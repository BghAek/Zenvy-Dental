import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { auth } from '../auth/auth';
import type { Role } from '../generated/prisma/enums';
import { runWithTenantContext } from './tenant-context';

// Resolves the Better Auth session once per request; when authenticated, the
// rest of the pipeline (guards, handlers, Prisma queries) runs inside the
// tenant AsyncLocalStorage context (docs/02-database.md §Tenancy).
export async function tenantContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Health probes hit on a tight interval — spare them the session DB lookup.
  // (/api/v1/auth/* never reaches here: Better Auth's handler is mounted
  // ahead of the Nest pipeline and terminates those requests itself.)
  if (req.path === '/health') {
    next();
    return;
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    next();
    return;
  }
  req.sessionUser = session.user;
  runWithTenantContext(
    {
      userId: session.user.id,
      role: session.user.role as Role,
      clinicId: session.user.clinicId ?? null,
    },
    () => next(),
  );
}
