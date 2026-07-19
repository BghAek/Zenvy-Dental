import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { basePrisma, prisma } from '../src/prisma/client';
import { MissingTenantContextError } from '../src/tenancy/tenant.extension';
import { asClinic, asSuperAdmin, seedTwoClinics, type TwoClinics } from './tenant-harness';

describe('tenant isolation (Prisma extension)', () => {
  let t: TwoClinics;

  beforeAll(async () => {
    t = await seedTwoClinics();
  });

  afterAll(async () => {
    await t.cleanup();
    await basePrisma.$disconnect();
  });

  it('throws on a tenant-scoped query without a tenant context', async () => {
    await expect(prisma.patient.findMany()).rejects.toBeInstanceOf(MissingTenantContextError);
  });

  it('scopes findMany to the context clinic', async () => {
    const patients = await asClinic(t.clinicA.id, () => prisma.patient.findMany());
    expect(patients).toHaveLength(1);
    expect(patients[0].id).toBe(t.patientA.id);
  });

  it('hides another clinic’s row from findUnique', async () => {
    const found = await asClinic(t.clinicA.id, () =>
      prisma.patient.findUnique({ where: { id: t.patientB.id } }),
    );
    expect(found).toBeNull();
  });

  it('rejects an update of another clinic’s row', async () => {
    await expect(
      asClinic(t.clinicA.id, () =>
        prisma.patient.update({ where: { id: t.patientB.id }, data: { notes: 'hacked' } }),
      ),
    ).rejects.toThrow();
    const untouched = await basePrisma.patient.findUnique({ where: { id: t.patientB.id } });
    expect(untouched?.notes).toBeNull();
  });

  it('deleteMany cannot cross tenants even when explicitly targeted', async () => {
    const { count } = await asClinic(t.clinicA.id, () =>
      prisma.patient.deleteMany({ where: { clinicId: t.clinicB.id } }),
    );
    expect(count).toBe(0);
  });

  it('stamps creates with the context clinic, overriding a forged clinicId', async () => {
    const created = await asClinic(t.clinicA.id, () =>
      prisma.patient.create({
        // A hostile caller trying to write into clinic B.
        data: {
          clinicId: t.clinicB.id,
          firstName: 'Forgé',
          lastName: 'Intrus',
          phone: '+33699999901',
        } as never,
      }),
    );
    expect(created.clinicId).toBe(t.clinicA.id);
    await basePrisma.patient.delete({ where: { id: created.id } });
  });

  it('counts only the context clinic even with a forged where', async () => {
    const count = await asClinic(t.clinicA.id, () =>
      prisma.patient.count({ where: { clinicId: t.clinicB.id } }),
    );
    expect(count).toBe(0);
  });

  it('lets SUPER_ADMIN read across tenants', async () => {
    const patients = await asSuperAdmin(() =>
      prisma.patient.findMany({ where: { id: { in: [t.patientA.id, t.patientB.id] } } }),
    );
    expect(patients).toHaveLength(2);
  });
});
