import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/rbac';

// S0-9: Meta webhook receiver — verification handshake + signed event logging.
// Signatures are verified before any payload use (docs/04 §Platform hardening).
// Persistence, fast-200 + BullMQ ingest, tenant routing, and correlation IDs
// on rejections arrive with S2-2 + the observability module; until then events
// are only logged so the founder can watch test messages land.
// ponytail: full-payload logging is test-number traffic only — S2-2 must replace
// it with persistence; real patient messages must never hit logs (docs/04).

// The .env.example placeholder must never act as a real secret (same guard as
// auth.ts on BETTER_AUTH_SECRET) — treat it as unset and fail closed.
const secretFromEnv = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value !== 'CHANGE_ME' ? value : undefined;
};

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhook');

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = secretFromEnv('META_VERIFY_TOKEN');
    // `!expected` fails closed when the env var is unset; the typeof guard
    // fends off qs arrays (?hub.verify_token=a&hub.verify_token=b).
    if (mode !== 'subscribe' || !expected || typeof token !== 'string' || !safeEqual(token, expected)) {
      this.logger.warn('Webhook verification rejected: bad mode or verify token');
      throw new ForbiddenException('Vérification du webhook refusée.');
    }
    this.logger.log('Webhook verification handshake succeeded');
    return challenge ?? '';
  }

  @Public()
  @Post()
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>): void {
    const secret = secretFromEnv('META_APP_SECRET');
    const signature = req.header('x-hub-signature-256');
    if (!secret || !signature || !req.rawBody) {
      this.logger.warn('Webhook event rejected: missing secret, signature, or raw body');
      throw new ForbiddenException('Signature du webhook invalide.');
    }

    const computed = `sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
    if (!safeEqual(computed, signature)) {
      this.logger.warn('Webhook event rejected: signature mismatch');
      throw new ForbiddenException('Signature du webhook invalide.');
    }

    this.logger.log(`Webhook event received: ${req.rawBody.toString('utf8')}`);
  }
}
