import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { patientListResponseSchema, patientSchema } from '@zenvy/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// S1-3 patients CRUD suite (docs/api/patients.md): create/read/update/soft-
// delete, phone normalization, restore-on-create, search, tag filter, cursor
// pagination, and the mandatory cross-tenant proof (docs/04-security.md). The
// mailer is stubbed so sign-up (the only way to mint a real session) is silent;
// users are then attached to seeded clinics directly — the middleware reads
// clinicId/role fresh from the user row on every request.

vi.mock('../src/mail/mailer', () => ({ sendMail: async (): Promise<void> => undefined }));

const run = randomUUID().slice(0, 8);
const PASSWORD = 'MotDePasse123!';
const email = (label: string) => `s13-${label}-${run}@zenvy.test`;

describe('patients (S1-3)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let clinicA: { id: string };
  let clinicB: { id: string };
  let ownerCookie: string[];
  let staffCookie: string[];
  let otherCookie: string[]; // owner of clinic B

  // Sign up, then attach the user to a clinic with a role (as S1-2's flow
  // would). getSession reads these columns fresh, so no re-login is needed.
  const signUpAttached = async (
    label: string,
    clinicId: string,
    role: 'CLINIC_OWNER' | 'CLINIC_STAFF',
  ): Promise<string[]> => {
    const res = await request(server)
      .post('/api/v1/auth/sign-up/email')
      .send({ email: email(label), password: PASSWORD, name: label })
      .expect(200);
    await basePrisma.user.update({
      where: { email: email(label) },
      data: { emailVerified: true, clinicId, role },
    });
    return res.get('Set-Cookie')!;
  };

  const createPatient = (cookie: string[], body: Record<string, unknown>) =>
    request(server).post('/api/v1/patients').set('Cookie', cookie).send(body);

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();

    [clinicA, clinicB] = await Promise.all(
      (['a', 'b'] as const).map((l) =>
        basePrisma.clinic.create({
          data: { name: `Cabinet ${l} ${run}`, slug: `cabinet-${l}-${run}` },
        }),
      ),
    );
    ownerCookie = await signUpAttached('owner', clinicA.id, 'CLINIC_OWNER');
    staffCookie = await signUpAttached('staff', clinicA.id, 'CLINIC_STAFF');
    otherCookie = await signUpAttached('other', clinicB.id, 'CLINIC_OWNER');
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { id: { in: [clinicA.id, clinicB.id] } } });
    await basePrisma.user.deleteMany({ where: { email: { contains: run } } });
    await app.close();
    await basePrisma.$disconnect();
  });

  it('rejects unauthenticated access (401)', async () => {
    await request(server).get('/api/v1/patients').expect(401);
  });

  it('creates a patient: phone normalized, server-set source/optOut, empty tags', async () => {
    const res = await createPatient(ownerCookie, {
      firstName: 'Amélie',
      lastName: 'Durand',
      phone: '06 12 34 56 78',
    }).expect(201);
    const patient = patientSchema.parse(res.body);
    expect(patient.phone).toBe('+33612345678');
    expect(patient.source).toBe('MANUAL');
    expect(patient.optOut).toBe(false);
    expect(patient.tags).toEqual([]);
    expect(patient.notes).toBeNull();
  });

  it('rejects an invalid payload (400 VALIDATION_ERROR, French message)', async () => {
    const res = await createPatient(ownerCookie, {
      firstName: '   ',
      lastName: 'Durand',
      phone: '06 12 34 56 78',
    }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/[À-ÿ]|requis|caractère/);

    await createPatient(ownerCookie, {
      firstName: 'Bad',
      lastName: 'Phone',
      phone: 'pas-un-numero',
    }).expect(400);
  });

  it('rejects a duplicate active phone (409 PATIENT_PHONE_EXISTS)', async () => {
    await createPatient(ownerCookie, {
      firstName: 'Doublon',
      lastName: 'Un',
      phone: '07 00 00 00 01',
    }).expect(201);
    const res = await createPatient(staffCookie, {
      firstName: 'Doublon',
      lastName: 'Deux',
      phone: '07 00 00 00 01',
    }).expect(409);
    expect(res.body.error.code).toBe('PATIENT_PHONE_EXISTS');
  });

  it('reads a patient by id, 404s on unknown/foreign ids', async () => {
    const { body: created } = await createPatient(ownerCookie, {
      firstName: 'Lecture',
      lastName: 'Test',
      phone: '07 00 00 00 02',
      tags: ['vip'],
      notes: 'Allergique à la pénicilline',
    }).expect(201);

    const res = await request(server)
      .get(`/api/v1/patients/${created.id}`)
      .set('Cookie', staffCookie)
      .expect(200);
    expect(patientSchema.parse(res.body).notes).toBe('Allergique à la pénicilline');

    const missing = await request(server)
      .get('/api/v1/patients/does-not-exist')
      .set('Cookie', ownerCookie)
      .expect(404);
    expect(missing.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('updates fields and clears notes with null', async () => {
    const { body: p } = await createPatient(ownerCookie, {
      firstName: 'Modif',
      lastName: 'Avant',
      phone: '07 00 00 00 03',
      notes: 'à effacer',
    }).expect(201);

    const res = await request(server)
      .patch(`/api/v1/patients/${p.id}`)
      .set('Cookie', ownerCookie)
      .send({ lastName: 'Après', optOut: true, notes: null, tags: ['relance'] })
      .expect(200);
    const updated = patientSchema.parse(res.body);
    expect(updated.lastName).toBe('Après');
    expect(updated.optOut).toBe(true);
    expect(updated.notes).toBeNull();
    expect(updated.tags).toEqual(['relance']);
    expect(updated.firstName).toBe('Modif'); // untouched
  });

  it('rejects a phone change that collides with an active patient (409)', async () => {
    await createPatient(ownerCookie, {
      firstName: 'Occupé',
      lastName: 'Numéro',
      phone: '07 00 00 00 04',
    }).expect(201);
    const { body: mover } = await createPatient(ownerCookie, {
      firstName: 'Déménage',
      lastName: 'Ici',
      phone: '07 00 00 00 05',
    }).expect(201);

    const res = await request(server)
      .patch(`/api/v1/patients/${mover.id}`)
      .set('Cookie', ownerCookie)
      .send({ phone: '07 00 00 00 04' })
      .expect(409);
    expect(res.body.error.code).toBe('PATIENT_PHONE_EXISTS');
  });

  it('404s updating an unknown id', async () => {
    await request(server)
      .patch('/api/v1/patients/nope')
      .set('Cookie', ownerCookie)
      .send({ firstName: 'X' })
      .expect(404);
  });

  it('soft-deletes: 204, then hidden from read and list, re-delete 404', async () => {
    const { body: p } = await createPatient(ownerCookie, {
      firstName: 'Supprime',
      lastName: 'Moi',
      phone: '07 00 00 00 06',
    }).expect(201);

    await request(server)
      .delete(`/api/v1/patients/${p.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);

    await request(server).get(`/api/v1/patients/${p.id}`).set('Cookie', ownerCookie).expect(404);
    await request(server)
      .delete(`/api/v1/patients/${p.id}`)
      .set('Cookie', ownerCookie)
      .expect(404);

    const list = await request(server)
      .get('/api/v1/patients?limit=100')
      .set('Cookie', ownerCookie)
      .expect(200);
    const ids = patientListResponseSchema.parse(list.body).items.map((i) => i.id);
    expect(ids).not.toContain(p.id);
  });

  it('restores a soft-deleted patient on re-create with the same phone (same id)', async () => {
    const { body: p } = await createPatient(ownerCookie, {
      firstName: 'Revient',
      lastName: 'Ancien',
      phone: '07 00 00 00 07',
      notes: 'vieilles notes',
    }).expect(201);
    await request(server)
      .delete(`/api/v1/patients/${p.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);

    const res = await createPatient(ownerCookie, {
      firstName: 'Revient',
      lastName: 'Nouveau',
      phone: '07 00 00 00 07',
    }).expect(201);
    const restored = patientSchema.parse(res.body);
    expect(restored.id).toBe(p.id); // same row, deletedAt cleared
    expect(restored.lastName).toBe('Nouveau'); // submitted data applied
    expect(restored.notes).toBeNull(); // reset

    // And it reads back normally.
    await request(server).get(`/api/v1/patients/${p.id}`).set('Cookie', ownerCookie).expect(200);
  });

  it('searches by name (case-insensitive) and by printed phone digits', async () => {
    await createPatient(ownerCookie, {
      firstName: 'Bérénice',
      lastName: 'Chercheuse',
      phone: '06 98 76 54 32',
    }).expect(201);

    const byName = await request(server)
      .get('/api/v1/patients?search=BÉRÉN')
      .set('Cookie', ownerCookie)
      .expect(200);
    const nameHits = patientListResponseSchema.parse(byName.body).items;
    expect(nameHits.some((p) => p.firstName === 'Bérénice')).toBe(true);

    // As printed on a chart, not E.164 — must still find the stored +33… number.
    const byPhone = await request(server)
      .get('/api/v1/patients?search=06%2098%2076%2054%2032')
      .set('Cookie', ownerCookie)
      .expect(200);
    const phoneHits = patientListResponseSchema.parse(byPhone.body).items;
    expect(phoneHits.some((p) => p.phone === '+33698765432')).toBe(true);
  });

  it('filters by exact tag', async () => {
    const uniqueTag = `tag-${run}`;
    await createPatient(ownerCookie, {
      firstName: 'Étiqueté',
      lastName: 'Un',
      phone: '07 11 11 11 11',
      tags: [uniqueTag],
    }).expect(201);

    const res = await request(server)
      .get(`/api/v1/patients?tag=${uniqueTag}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const items = patientListResponseSchema.parse(res.body).items;
    expect(items).toHaveLength(1);
    expect(items[0].firstName).toBe('Étiqueté');
  });

  it('paginates with a stable cursor and no overlap', async () => {
    const pageTag = `page-${run}`;
    for (let i = 0; i < 5; i += 1) {
      await createPatient(ownerCookie, {
        firstName: `Page${i}`,
        lastName: 'Nation',
        phone: `07 22 22 22 2${i}`,
        tags: [pageTag],
      }).expect(201);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url = `/api/v1/patients?tag=${pageTag}&limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await request(server).get(url).set('Cookie', ownerCookie).expect(200);
      const body = patientListResponseSchema.parse(res.body);
      expect(body.items.length).toBeLessThanOrEqual(2);
      seen.push(...body.items.map((i) => i.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toHaveLength(5); // all rows, exactly once
    expect(new Set(seen).size).toBe(5); // no overlap across pages
  });

  // Mandatory cross-tenant proof (docs/04-security.md): clinic B must never
  // read, mutate, or delete clinic A's patient — all indistinguishable 404s.
  it('isolates tenants: clinic B cannot touch clinic A patients', async () => {
    const { body: aPatient } = await createPatient(ownerCookie, {
      firstName: 'Isolé',
      lastName: 'ClinicA',
      phone: '07 33 33 33 33',
    }).expect(201);

    await request(server)
      .get(`/api/v1/patients/${aPatient.id}`)
      .set('Cookie', otherCookie)
      .expect(404);
    await request(server)
      .patch(`/api/v1/patients/${aPatient.id}`)
      .set('Cookie', otherCookie)
      .send({ firstName: 'Piraté' })
      .expect(404);
    await request(server)
      .delete(`/api/v1/patients/${aPatient.id}`)
      .set('Cookie', otherCookie)
      .expect(404);

    // B's list never contains A's patient, and A's row is genuinely untouched.
    const bList = await request(server)
      .get('/api/v1/patients?limit=100')
      .set('Cookie', otherCookie)
      .expect(200);
    const bIds = patientListResponseSchema.parse(bList.body).items.map((i) => i.id);
    expect(bIds).not.toContain(aPatient.id);

    const untouched = await basePrisma.patient.findUnique({ where: { id: aPatient.id } });
    expect(untouched?.firstName).toBe('Isolé');
    expect(untouched?.deletedAt).toBeNull();
  });
});
