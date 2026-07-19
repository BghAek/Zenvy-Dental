import { Prisma } from '../generated/prisma/client';
import { getTenantContext } from './tenant-context';

// Fail closed by default: EVERY model is tenant-scoped unless listed here, so
// a model added in a future sprint is automatically confined (or throws
// outside a tenant context) instead of silently leaking across clinics.
// System paths that legitimately run without a request (jobs, seeds, error
// logging) use basePrisma explicitly.
const NON_TENANT_MODELS = new Set([
  // Better Auth infrastructure — the auth layer queries it via basePrisma.
  'Session',
  'Account',
  'Verification',
  // No clinicId column; scoped through its SupportThread.
  'SupportMessage',
]);

// Clinic is the tenant itself: no clinicId column, so it is scoped on id.
function tenantField(model: string): string {
  return model === 'Clinic' ? 'id' : 'clinicId';
}

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
  update?: Record<string, unknown>;
}

function scopeArgs(operation: string, args: unknown, field: string, clinicId: string): unknown {
  const scoped: ScopableArgs = { ...((args ?? {}) as ScopableArgs) };
  // Stamped last: a client-supplied tenant value is never trusted.
  const stamp = (obj: unknown) => ({ ...(obj as Record<string, unknown>), [field]: clinicId });
  // Update payloads must not relocate a row to another tenant; override the
  // field only when the caller tried to set it.
  const disarm = (obj: ScopableArgs['data']) =>
    obj && !Array.isArray(obj) && field in obj ? stamp(obj) : obj;
  // ANDed, never overridden: rewriting a caller-supplied filter would either
  // widen the query to the whole clinic (deleteMany({ clinicId: other }) must
  // match nothing, not delete everything we own) or silently retarget a
  // unique lookup (Clinic is scoped on its unique id). A contradiction with
  // the caller's where correctly matches nothing. Extended where-unique
  // accepts AND alongside the key, so this covers unique ops too.
  const constrain = (where: ScopableArgs['where']) => {
    if (!where) return { [field]: clinicId };
    const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
    return { ...where, AND: [...existing, { [field]: clinicId }] };
  };
  switch (operation) {
    case 'create':
      scoped.data = stamp(scoped.data);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      scoped.data = Array.isArray(scoped.data) ? scoped.data.map(stamp) : stamp(scoped.data);
      break;
    case 'upsert':
      scoped.where = constrain(scoped.where);
      scoped.create = stamp(scoped.create);
      scoped.update = disarm(scoped.update) as ScopableArgs['update'];
      break;
    case 'update':
    case 'updateMany':
    case 'updateManyAndReturn':
      scoped.where = constrain(scoped.where);
      scoped.data = disarm(scoped.data);
      break;
    default:
      // findUnique/findFirst/findMany/delete/deleteMany/count/aggregate/groupBy…
      scoped.where = constrain(scoped.where);
  }
  return scoped;
}

// ponytail: top-level operations only — nested relation writes (parent.create
// with { children: { create } }) bypass stamping; forbid nested tenant-model
// writes in business code until S1-3 hardens this if needed.
export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (NON_TENANT_MODELS.has(model)) return query(args);
        const context = getTenantContext();
        if (!context) throw new MissingTenantContextError(model, operation);
        // SUPER_ADMIN is cross-tenant by design; guards ensure only /ops
        // routes reach here without a clinic (docs/02-database.md §Tenancy).
        if (context.role === 'SUPER_ADMIN') return query(args);
        if (!context.clinicId) throw new MissingTenantContextError(model, operation);
        return query(
          scopeArgs(operation, args, tenantField(model), context.clinicId) as typeof args,
        );
      },
    },
  },
});
