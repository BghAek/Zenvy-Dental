import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { tenantExtension } from '../tenancy/tenant.extension';

// Base client — Better Auth adapter and explicitly cross-tenant/system paths
// only. Business code must use the tenant-scoped `prisma` export below.
export const basePrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// The one client business code imports: every query on a tenant-scoped model
// is automatically confined to the request's clinic (docs/02-database.md).
export const prisma = basePrisma.$extends(tenantExtension);

export type TenantPrismaClient = typeof prisma;
