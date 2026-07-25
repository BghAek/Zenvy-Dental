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

/** Session-less system paths (the WhatsApp inbound worker, later BullMQ senders)
 *  scope Prisma to a clinic they resolved themselves — the only place clinicId
 *  is not session-derived (docs/api/conversations.md §Tenancy note). Role stays
 *  clinic-level so the extension scopes instead of bypassing. */
export function runAsClinic<T>(clinicId: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ userId: 'system', role: 'CLINIC_STAFF', clinicId }, fn);
}
