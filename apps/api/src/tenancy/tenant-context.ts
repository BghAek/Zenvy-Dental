import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '../generated/prisma/enums';

export interface TenantContext {
  userId: string;
  role: Role;
  /** null only for SUPER_ADMIN (cross-tenant by design, docs/04-security.md). */
  clinicId: string | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
