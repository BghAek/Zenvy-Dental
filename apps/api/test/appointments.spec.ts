import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { appointmentListResponseSchema, appointmentSchema } from '@zenvy/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// S2-4 appointments suite (docs/api/appointments.md): CRUD, list filters and
// cursor, the full reminder lifecycle (create → 24h + 2h, reschedule, cancel,
// DONE → follow-up, opt-out, past start), and the mandatory cross-tenant proof
// (docs/04-security.md). The mailer is stubbed so sign-up is silent; users are
// then attached to seeded clinics directly, as in the patients suite.

vi.mock('../src/mail/mailer', () => ({ sendMail: async (): Promise<void> => undefined }));

const run = randomUUID().slice(0, 8);
const PASSWORD = 'MotDePasse123!';
const email = (label: string) => `s24-${label}-${run}@zenvy.test`;
// Phones go through the E.164 contract, so the per-run suffix must be digits.
const digits = String(Date.now()).slice(-7);

const HOUR_MS = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR_MS).toISOString();

describe('appointments (S2-4)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let clinicA: { id: string };
  let clinicB: { id: string };
  let ownerCookie: string[];
  let otherCookie: string[]; // owner of clinic B
  let patientA: { id: string };
  let optedOut: { id: string };
  let patientB: { id: string }; // belongs to clinic B

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

  const create = (cookie: string[], body: Record<string, unknown>) =>
    request(server).post('/api/v1/appointments').set('Cookie', cookie).send(body);

  const createFor = async (patientId: string, startsAt: string, extra = {}) => {
    const res = await create(ownerCookie, {
      patientId,
      startsAt,
      durationMin: 30,
      type: 'Détartrage',
      ...extra,
    }).expect(201);
    return appointmentSchema.parse(res.body);
  };

  const patch = (id: string, body: Record<string, unknown>, cookie = ownerCookie) =>
    request(server).patch(`/api/v1/appointments/${id}`).set('Cookie', cookie).send(body);

  /** Reminder rows straight from the DB, bypassing the tenant extension. */
  const rowsOf = (appointmentId: string) =>
    basePrisma.scheduledMessage.findMany({ where: { appointmentId }, orderBy: { sendAt: 'asc' } });

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();

    [clinicA, clinicB] = await Promise.all(
      (['a', 'b'] as const).map((l) =>
        basePrisma.clinic.create({
          data: { name: `Cabinet RDV ${l} ${run}`, slug: `cabinet-rdv-${l}-${run}` },
        }),
      ),
    );
    ownerCookie = await signUpAttached('owner', clinicA.id, 'CLINIC_OWNER');
    otherCookie = await signUpAttached('other', clinicB.id, 'CLINIC_OWNER');

    [patientA, optedOut, patientB] = await Promise.all([
      basePrisma.patient.create({
        data: {
          clinicId: clinicA.id,
          firstName: 'Amélie',
          lastName: 'Durand',
          phone: `+33611${digits}`,
        },
      }),
      basePrisma.patient.create({
        data: {
          clinicId: clinicA.id,
          firstName: 'Stop',
          lastName: 'Merci',
          phone: `+33622${digits}`,
          optOut: true,
        },
      }),
      basePrisma.patient.create({
        data: {
          clinicId: clinicB.id,
          firstName: 'Autre',
          lastName: 'Cabinet',
          phone: `+33633${digits}`,
        },
      }),
    ]);
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { id: { in: [clinicA.id, clinicB.id] } } });
    await basePrisma.user.deleteMany({ where: { email: { contains: run } } });
    await app.close();
    await basePrisma.$disconnect();
  });

  it('rejects unauthenticated access (401)', async () => {
    await request(server).get('/api/v1/appointments').expect(401);
  });

  it('creates an appointment with two reminder rows at −24h and −2h', async () => {
    const startsAt = inHours(72);
    const appointment = await createFor(patientA.id, startsAt);
    expect(appointment.status).toBe('SCHEDULED'); // server default
    expect(appointment.patient.id).toBe(patientA.id);

    const start = new Date(startsAt).getTime();
    expect(appointment.reminders.map((r) => r.kind)).toEqual(['REMINDER_24H', 'REMINDER_2H']);
    expect(appointment.reminders.every((r) => r.status === 'PENDING')).toBe(true);
    expect(new Date(appointment.reminders[0].sendAt).getTime()).toBe(start - 24 * HOUR_MS);
    expect(new Date(appointment.reminders[1].sendAt).getTime()).toBe(start - 2 * HOUR_MS);

    // Template names come from the S3-1 catalogue; nothing sends until S3-2.
    const rows = await rowsOf(appointment.id);
    expect(rows.map((r) => r.templateName)).toEqual(['reminder_24h_fr', 'reminder_2h_fr']);
  });

  it('rejects an invalid payload and an unknown patient', async () => {
    const bad = await create(ownerCookie, {
      patientId: patientA.id,
      startsAt: inHours(48),
      durationMin: 2, // below the 5-minute floor
      type: 'Contrôle',
    }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const unknown = await create(ownerCookie, {
      patientId: 'nope',
      startsAt: inHours(48),
      durationMin: 30,
      type: 'Contrôle',
    }).expect(404);
    expect(unknown.body.error.code).toBe('PATIENT_NOT_FOUND');

    // Another clinic's patient is the same 404 — no cross-tenant probing.
    const foreign = await create(ownerCookie, {
      patientId: patientB.id,
      startsAt: inHours(48),
      durationMin: 30,
      type: 'Contrôle',
    }).expect(404);
    expect(foreign.body.error.code).toBe('PATIENT_NOT_FOUND');
  });

  it('creates no rows for a past start, and none for an opted-out patient', async () => {
    const past = await createFor(patientA.id, inHours(-48));
    expect(past.reminders).toEqual([]);

    const silent = await createFor(optedOut.id, inHours(72));
    expect(silent.reminders).toEqual([]);
  });

  it('reschedules: pending rows follow the new start', async () => {
    const appointment = await createFor(patientA.id, inHours(72));
    const before = appointment.reminders.map((r) => r.id);

    const moved = inHours(96);
    const res = await patch(appointment.id, { startsAt: moved }).expect(200);
    const updated = appointmentSchema.parse(res.body);
    const start = new Date(moved).getTime();

    expect(updated.reminders.map((r) => r.id)).toEqual(before); // recomputed, not churned
    expect(new Date(updated.reminders[0].sendAt).getTime()).toBe(start - 24 * HOUR_MS);
    expect(new Date(updated.reminders[1].sendAt).getTime()).toBe(start - 2 * HOUR_MS);
  });

  it('leaves already-sent rows alone on reschedule and cancels a slipped-past row', async () => {
    const appointment = await createFor(patientA.id, inHours(72));
    const [sent] = await rowsOf(appointment.id);
    await basePrisma.scheduledMessage.update({
      where: { id: sent.id },
      data: { status: 'SENT' },
    });

    // Moving the start to +1h puts both reminder times in the past.
    await patch(appointment.id, { startsAt: inHours(1) }).expect(200);
    const rows = await rowsOf(appointment.id);
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    expect(byKind.REMINDER_24H.status).toBe('SENT'); // untouched
    expect(byKind.REMINDER_24H.sendAt.getTime()).toBe(sent.sendAt.getTime());
    expect(byKind.REMINDER_2H.status).toBe('CANCELLED'); // would have fired late
  });

  it('cancels pending rows when the status becomes CANCELLED or NO_SHOW', async () => {
    for (const status of ['CANCELLED', 'NO_SHOW'] as const) {
      const appointment = await createFor(patientA.id, inHours(72));
      const res = await patch(appointment.id, { status }).expect(200);
      const updated = appointmentSchema.parse(res.body);
      expect(updated.status).toBe(status);
      expect(updated.reminders.every((r) => r.status === 'CANCELLED')).toBe(true);
    }
  });

  it('schedules a J+1 follow-up when the status becomes DONE', async () => {
    // A past appointment the clinic honoured: no reminders, then a follow-up.
    const startsAt = inHours(-2);
    const appointment = await createFor(patientA.id, startsAt);
    expect(appointment.reminders).toEqual([]);

    const res = await patch(appointment.id, { status: 'DONE' }).expect(200);
    const done = appointmentSchema.parse(res.body);
    expect(done.reminders).toHaveLength(1);
    expect(done.reminders[0].kind).toBe('FOLLOWUP');
    expect(done.reminders[0].status).toBe('PENDING');
    expect(new Date(done.reminders[0].sendAt).getTime()).toBe(
      new Date(startsAt).getTime() + 24 * HOUR_MS,
    );
    const [row] = await rowsOf(appointment.id);
    expect(row.templateName).toBe('followup_fr');
  });

  it('re-arms reminders when a cancelled appointment is reinstated', async () => {
    const appointment = await createFor(patientA.id, inHours(72));
    await patch(appointment.id, { status: 'CANCELLED' }).expect(200);

    const res = await patch(appointment.id, { status: 'CONFIRMED' }).expect(200);
    const pending = appointmentSchema
      .parse(res.body)
      .reminders.filter((r) => r.status === 'PENDING');
    expect(pending.map((r) => r.kind)).toEqual(['REMINDER_24H', 'REMINDER_2H']);
  });

  it('reads by id and 404s on unknown ids; deleting cascades the rows away', async () => {
    const appointment = await createFor(patientA.id, inHours(72));
    const read = await request(server)
      .get(`/api/v1/appointments/${appointment.id}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(appointmentSchema.parse(read.body).reminders).toHaveLength(2);

    const missing = await request(server)
      .get('/api/v1/appointments/does-not-exist')
      .set('Cookie', ownerCookie)
      .expect(404);
    expect(missing.body.error.code).toBe('APPOINTMENT_NOT_FOUND');

    await request(server)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    expect(await rowsOf(appointment.id)).toHaveLength(0);
    await request(server)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set('Cookie', ownerCookie)
      .expect(404);
  });

  it('lists sorted by startsAt asc, filtered by from/to, patient and status', async () => {
    const tagged = await basePrisma.patient.create({
      data: {
        clinicId: clinicA.id,
        firstName: 'Filtre',
        lastName: 'Test',
        phone: `+33644${digits}`,
      },
    });
    const starts = [inHours(200), inHours(150), inHours(250)];
    for (const startsAt of starts) await createFor(tagged.id, startsAt);

    const res = await request(server)
      .get(`/api/v1/appointments?patientId=${tagged.id}`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const items = appointmentListResponseSchema.parse(res.body).items;
    expect(items.map((a) => a.startsAt)).toEqual([...starts].sort());

    // from inclusive, to exclusive.
    const window = await request(server)
      .get(
        `/api/v1/appointments?patientId=${tagged.id}&from=${encodeURIComponent(starts[1])}&to=${encodeURIComponent(starts[0])}`,
      )
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(appointmentListResponseSchema.parse(window.body).items.map((a) => a.startsAt)).toEqual([
      starts[1],
    ]);

    await patch(items[0].id, { status: 'CONFIRMED' }).expect(200);
    const confirmed = await request(server)
      .get(`/api/v1/appointments?patientId=${tagged.id}&status=CONFIRMED`)
      .set('Cookie', ownerCookie)
      .expect(200);
    const confirmedItems = appointmentListResponseSchema.parse(confirmed.body).items;
    expect(confirmedItems).toHaveLength(1);
    expect(confirmedItems[0].id).toBe(items[0].id);

    // Blank params (a cleared filter) count as unset.
    await request(server)
      .get(`/api/v1/appointments?patientId=${tagged.id}&from=&to=&status=`)
      .set('Cookie', ownerCookie)
      .expect(200);
  });

  it('paginates with a stable cursor and no overlap', async () => {
    const paged = await basePrisma.patient.create({
      data: {
        clinicId: clinicA.id,
        firstName: 'Page',
        lastName: 'Nation',
        phone: `+33655${digits}`,
      },
    });
    for (let i = 0; i < 5; i += 1) await createFor(paged.id, inHours(300 + i));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url = `/api/v1/appointments?patientId=${paged.id}&limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await request(server).get(url).set('Cookie', ownerCookie).expect(200);
      const body = appointmentListResponseSchema.parse(res.body);
      expect(body.items.length).toBeLessThanOrEqual(2);
      seen.push(...body.items.map((a) => a.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  // Mandatory cross-tenant proof (docs/04-security.md): clinic B must never
  // read, mutate, or delete clinic A's appointment — all indistinguishable 404s.
  it('isolates tenants: clinic B cannot touch clinic A appointments', async () => {
    const appointment = await createFor(patientA.id, inHours(72));

    await request(server)
      .get(`/api/v1/appointments/${appointment.id}`)
      .set('Cookie', otherCookie)
      .expect(404);
    await patch(appointment.id, { status: 'CANCELLED' }, otherCookie).expect(404);
    await request(server)
      .delete(`/api/v1/appointments/${appointment.id}`)
      .set('Cookie', otherCookie)
      .expect(404);

    const bList = await request(server)
      .get('/api/v1/appointments?limit=100')
      .set('Cookie', otherCookie)
      .expect(200);
    const bIds = appointmentListResponseSchema.parse(bList.body).items.map((a) => a.id);
    expect(bIds).not.toContain(appointment.id);

    // A's row and its reminders are genuinely untouched.
    const untouched = await basePrisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(untouched?.status).toBe('SCHEDULED');
    const rows = await rowsOf(appointment.id);
    expect(rows.every((r) => r.status === 'PENDING')).toBe(true);
  });
});
