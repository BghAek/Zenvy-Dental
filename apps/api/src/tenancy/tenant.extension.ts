import { Prisma } from '../generated/prisma/client';
import { getTenantContext } from './tenant-context';

// Models whose clinicId is NOT NULL — every query on them is force-scoped to
// the request's clinic. Excluded on purpose: auth infrastructure (Session,
// Account, Verification), SupportMessage (scoped through its thread) and the
// nullable-tenant models (User, ErrorLog, AuditLog) that system paths must
// write without a request context; RBAC guards keep their reads safe.
const TENANT_MODELS = new Set([
  'Patient',
  'Appointment',
  'Conversation',
  'Message',
  'WhatsAppAccount',
  'Subscription',
  'ScheduledMessage',
  'OnboardingRequest',
  'SupportThread',
]);

/** A tenant-scoped query ran outside a tenant context — always a programming
 *  error; it must throw rather than silently return cross-tenant data. */
export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant-scoped query ${model}.${operation} executed without a tenant context`);
    this.name = 'MissingTenantContextError';
  }
}

interface ScopableArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
}

// Operations whose `where` is a WhereUniqueInput: a unique key stays pinned at
// the top level, so overriding clinicId is safe (a forged value just misses).
const UNIQUE_WHERE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

function scopeArgs(operation: string, args: unknown, clinicId: string): unknown {
  const scoped: ScopableArgs = { ...((args ?? {}) as ScopableArgs) };
  switch (operation) {
    // clinicId is stamped last: a client-supplied value is never trusted.
    case 'create':
      scoped.data = { ...(scoped.data as Record<string, unknown>), clinicId };
      break;
    case 'createMany':
    case 'createManyAndReturn':
      scoped.data = Array.isArray(scoped.data)
        ? scoped.data.map((row) => ({ ...row, clinicId }))
        : { ...(scoped.data as Record<string, unknown>), clinicId };
      break;
    case 'upsert':
      scoped.where = { ...scoped.where, clinicId };
      scoped.create = { ...scoped.create, clinicId };
      break;
    default:
      if (UNIQUE_WHERE_OPS.has(operation)) {
        // Extended where-unique accepts non-unique fields alongside the key.
        scoped.where = { ...scoped.where, clinicId };
      } else {
        // AND, never override: replacing a forged clinicId filter would widen
        // the query to the whole clinic (e.g. deleteMany({ clinicId: other })
        // must match nothing, not delete everything we own).
        scoped.where = scoped.where ? { AND: [scoped.where, { clinicId }] } : { clinicId };
      }
  }
  return scoped;
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);
        const context = getTenantContext();
        if (!context) throw new MissingTenantContextError(model, operation);
        // SUPER_ADMIN is cross-tenant by design; guards ensure only /ops
        // routes reach here without a clinic (docs/02-database.md §Tenancy).
        if (context.role === 'SUPER_ADMIN') return query(args);
        if (!context.clinicId) throw new MissingTenantContextError(model, operation);
        return query(scopeArgs(operation, args, context.clinicId) as typeof args);
      },
    },
  },
});
