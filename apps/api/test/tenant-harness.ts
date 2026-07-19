import { randomUUID } from 'node:crypto';
import { basePrisma } from '../src/prisma/client';
import { runWithTenantContext } from '../src/tenancy/tenant-context';

// Cross-tenant test harness (S0-5): every tenant-scoped module reuses these
// helpers to prove clinic A can never touch clinic B's rows (docs/04-security).

// PrismaPromises execute lazily on await — the await must happen INSIDE the
// tenant context, so these wrappers await for you (mirrors a real request,
// where handlers run and await entirely inside the middleware's context).
export function asClinic<T>(clinicId: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ userId: 'test-staff', role: 'CLINIC_STAFF', clinicId }, async () =>
    fn(),
  );
}

export function asSuperAdmin<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext(
    { userId: 'test-admin', role: 'SUPER_ADMIN', clinicId: null },
    async () => fn(),
  );
}

export interface TwoClinics {
  clinicA: { id: string };
  clinicB: { id: string };
  patientA: { id: string; phone: string };
  patientB: { id: string; phone: string };
  cleanup: () => Promise<void>;
}

/** Seeds two clinics with one patient each, via the base client (setup is
 *  deliberately outside any tenant context). */
export async function seedTwoClinics(): Promise<TwoClinics> {
  const run = randomUUID().slice(0, 8);
  const [clinicA, clinicB] = await Promise.all(
    (['a', 'b'] as const).map((label) =>
      basePrisma.clinic.create({
        data: { name: `Test Clinic ${label} ${run}`, slug: `test-clinic-${label}-${run}` },
      }),
    ),
  );
  const [patientA, patientB] = await Promise.all(
    [clinicA, clinicB].map((clinic, i) =>
      basePrisma.patient.create({
        data: {
          clinicId: clinic.id,
          firstName: 'Patient',
          lastName: i === 0 ? 'Alpha' : 'Beta',
          phone: `+3361234${run.slice(0, 4)}${i}`,
        },
      }),
    ),
  );
  return {
    clinicA,
    clinicB,
    patientA,
    patientB,
    cleanup: async () => {
      // Deleting the clinics cascades to every tenant-scoped row.
      await basePrisma.clinic.deleteMany({
        where: { id: { in: [clinicA.id, clinicB.id] } },
      });
    },
  };
}
