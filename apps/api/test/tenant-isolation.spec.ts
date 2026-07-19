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

  it('update cannot relocate a row to another clinic via data.clinicId', async () => {
    const updated = await asClinic(t.clinicA.id, () =>
      prisma.patient.update({
        // A hostile caller trying to move their own row into clinic B.
        where: { id: t.patientA.id },
        data: { clinicId: t.clinicB.id } as never,
      }),
    );
    expect(updated.clinicId).toBe(t.clinicA.id);
  });

  it('updateMany cannot relocate rows to another clinic', async () => {
    await asClinic(t.clinicA.id, () =>
      prisma.patient.updateMany({ data: { clinicId: t.clinicB.id } as never }),
    );
    const moved = await basePrisma.patient.count({ where: { clinicId: t.clinicB.id } });
    expect(moved).toBe(1); // still only patientB
  });

  it('scopes the User model (fail-closed default set)', async () => {
    const userA = await basePrisma.user.create({
      data: { email: `s05-a-${t.clinicA.id}@zenvy.test`, name: 'Staff A', clinicId: t.clinicA.id },
    });
    const userB = await basePrisma.user.create({
      data: { email: `s05-b-${t.clinicB.id}@zenvy.test`, name: 'Staff B', clinicId: t.clinicB.id },
    });
    const seen = await asClinic(t.clinicA.id, () => prisma.user.findMany());
    expect(seen.map((u) => u.id)).toEqual([userA.id]);
    await basePrisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  it('scopes Clinic on id (the tenant itself)', async () => {
    const clinics = await asClinic(t.clinicA.id, () => prisma.clinic.findMany());
    expect(clinics.map((c) => c.id)).toEqual([t.clinicA.id]);
    const other = await asClinic(t.clinicA.id, () =>
      prisma.clinic.findUnique({ where: { id: t.clinicB.id } }),
    );
    expect(other).toBeNull();
  });

  it('lets SUPER_ADMIN read across tenants', async () => {
    const patients = await asSuperAdmin(() =>
      prisma.patient.findMany({ where: { id: { in: [t.patientA.id, t.patientB.id] } } }),
    );
    expect(patients).toHaveLength(2);
  });
});
