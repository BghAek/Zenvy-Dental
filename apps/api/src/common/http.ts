import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  PipeTransform,
} from '@nestjs/common';
import { ERROR_CODES, type ErrorCode, type ErrorResponse, type Paginated } from '@zenvy/shared';
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { basePrisma } from '../prisma/client';

// The error envelope (docs/03-api-conventions.md) + shared-Zod body validation.
// ponytail: correlationId is minted here per error; the request-wide pino
// correlation middleware lands with the rest of the observability work (docs/06).

/** Throw with a stable machine code and a French, user-renderable message. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message, ERROR_CODES[code]);
  }
}

// Fallback French messages for framework-raised HttpExceptions whose message
// is English (Nest 404s, etc.). Guard/webhook exceptions already carry French.
const STATUS_FALLBACK: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'Requête invalide.' },
  401: { code: 'UNAUTHENTICATED', message: 'Authentification requise.' },
  403: { code: 'FORBIDDEN', message: 'Accès refusé.' },
  404: { code: 'NOT_FOUND', message: 'Ressource introuvable.' },
  409: { code: 'CONFLICT', message: 'Conflit avec l’état actuel.' },
  422: { code: 'DOMAIN_RULE_VIOLATION', message: 'Opération non autorisée.' },
  429: { code: 'RATE_LIMITED', message: 'Trop de requêtes, réessayez plus tard.' },
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const correlationId = `req_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'Une erreur interne est survenue. Réessayez plus tard.';

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      // Framework-raised exceptions (guards, 404s) get the per-status French
      // fallback — business code throws ApiException for specific messages.
      const fallback = STATUS_FALLBACK[status];
      if (fallback) {
        code = fallback.code;
        message = fallback.message;
      } else if (status < 500) {
        // Unmapped client error (e.g. 415) — keep the envelope self-consistent
        // rather than the INTERNAL_ERROR default, which only fits 5xx.
        code = 'VALIDATION_ERROR';
        message = 'Requête invalide.';
      }
      // Unmapped 5xx falls through to the INTERNAL_ERROR default (correct).
    }

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`[${correlationId}] unhandled exception: ${stack}`);
      // The durable trail the owner portal queries (docs/06-observability.md).
      // Only 5xx: a 4xx is the caller's mistake, and logging those would drown
      // the real breakage in validation noise. Awaited so the row exists before
      // the user is told the reference code — the whole point is that the
      // founder can look it up the moment the clinic reports it.
      // ponytail: one insert on the error path; if the DB itself is what broke,
      // the failed write is caught here and the response still goes out.
      await basePrisma.errorLog
        .create({
          data: {
            correlationId,
            clinicId: req.sessionUser?.clinicId ?? null,
            userId: req.sessionUser?.id ?? null,
            module: 'http',
            severity: 'ERROR',
            // The raw exception message, not the generic French envelope one.
            message: exception instanceof Error ? exception.message : String(exception),
            stack: stack ?? null,
            context: { method: req.method, path: req.originalUrl ?? req.url, status },
          },
        })
        .catch((err: unknown) => {
          this.logger.error(`[${correlationId}] ErrorLog write failed: ${String(err)}`);
        });
    } else {
      this.logger.warn(`[${correlationId}] ${status} ${code}: ${message}`);
    }

    const body: ErrorResponse = { error: { code, message, correlationId } };
    res.status(status).json(body);
  }
}

/** Parses a body/query with its shared Zod schema; unknown fields stripped by
 *  the schemas themselves, French issue message surfaced as VALIDATION_ERROR. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        'VALIDATION_ERROR',
        result.error.issues[0]?.message ?? 'Requête invalide.',
      );
    }
    return result.data;
  }
}

// Cursor pagination, the other half of docs/03-api-conventions.md: query with
// `take: limit + 1` over a stable (sort, id) order, then let these two shape the
// page. ponytail: the list routes written before S4-1 still inline this — they
// work; fold them in when one of them next needs a change.

/** One extra row is the whole trick: its presence IS the next page. */
export const page = <T extends { id: string }>(rows: T[], limit: number): Paginated<T> => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
};

export const cursorArgs = (cursor?: string) => (cursor ? { cursor: { id: cursor }, skip: 1 } : {});
