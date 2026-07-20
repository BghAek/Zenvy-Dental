import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  createClinicResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  staffInviteSchema,
} from '@zenvy/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mail } from '../src/mail/mailer';
import { basePrisma } from '../src/prisma/client';
import { asClinic, seedTwoClinics } from './tenant-harness';

// S1-2 integration suite: register → verify email → create clinic → 14-day
// trial → invite staff → accept (docs/api/auth.md). Mails are captured by
// mocking the mailer seam — links (verify + invite tokens) are read from them
// exactly as a user would.

const mails = vi.hoisted(() => [] as Mail[]);
vi.mock('../src/mail/mailer', () => ({
  sendMail: async (mail: Mail) => {
    mails.push(mail);
  },
}));

const run = randomUUID().slice(0, 8);
const ownerEmail = `s12-owner-${run}@zenvy.test`;
const staffEmail = `s12-staff-${run}@zenvy.test`;
const strangerEmail = `s12-stranger-${run}@zenvy.test`;
const PASSWORD = 'MotDePasse123!';

const lastMailTo = (to: string): Mail => {
  const mail = [...mails].reverse().find((m) => m.to === to);
  expect(mail, `expected a mail sent to ${to}`).toBeDefined();
  return mail!;
};

describe('identity flow (S1-2)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const signUp = async (email: string, name: string): Promise<string[]> => {
    const res = await request(server)
      .post('/api/v1/auth/sign-up/email')
      .send({ email, password: PASSWORD, name })
      .expect(200);
    return res.get('Set-Cookie')!;
  };

  // Follows the emailed verification link against the in-process server.
  const verifyEmailFromMail = async (email: string): Promise<void> => {
    const url = new URL(lastMailTo(email).text.match(/https?:\/\/\S+/)![0]);
    await request(server).get(`${url.pathname}${url.search}`);
    const user = await basePrisma.user.findUnique({ where: { email } });
    expect(user?.emailVerified).toBe(true);
  };

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { name: { contains: run } } });
    await basePrisma.user.deleteMany({ where: { email: { contains: run } } });
    await app.close();
    await basePrisma.$disconnect();
  });

  let ownerCookie: string[];
  let staffCookie: string[];
  let clinicId: string;
  let inviteToken: string;

  it('register: /me shows an unverified, clinic-less user', async () => {
    ownerCookie = await signUp(ownerEmail, 'Docteur Sourire');
    const res = await request(server).get('/api/v1/me').set('Cookie', ownerCookie).expect(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.user).toMatchObject({ emailVerified: false, role: 'CLINIC_STAFF', clinicId: null });
    expect(me.clinic).toBeNull();
    expect(me.subscription).toBeNull();
  });

  it('blocks clinic creation before email verification (403 EMAIL_NOT_VERIFIED)', async () => {
    const res = await request(server)
      .post('/api/v1/clinics')
      .set('Cookie', ownerCookie)
      .send({ name: `Cabinet Émile ${run}` })
      .expect(403);
    const { error } = errorResponseSchema.parse(res.body);
    expect(error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(error.correlationId).toMatch(/^req_/);
  });

  it('verify email via the emailed link, then create clinic → trial starts', async () => {
    await verifyEmailFromMail(ownerEmail);

    const res = await request(server)
      .post('/api/v1/clinics')
      .set('Cookie', ownerCookie)
      .send({ name: `Cabinet Émile ${run}`, phone: '06 12 34 56 78', timezone: 'europe/paris' })
      .expect(201);
    const { clinic, subscription } = createClinicResponseSchema.parse(res.body);
    clinicId = clinic.id;

    // Slug from the French name, diacritics stripped; server-generated.
    expect(clinic.slug).toBe(`cabinet-emile-${run}`);
    expect(clinic.phone).toBe('+33612345678');
    expect(clinic.timezone).toBe('Europe/Paris');
    // 14-day no-card trial.
    expect(subscription.status).toBe('TRIALING');
    expect(subscription.plan).toBe('PREMIUM');
    const daysLeft = (Date.parse(subscription.trialEndsAt!) - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(13.9);
    expect(daysLeft).toBeLessThanOrEqual(14);

    // Caller became CLINIC_OWNER; /me now returns the full tenant context.
    const me = meResponseSchema.parse(
      (await request(server).get('/api/v1/me').set('Cookie', ownerCookie).expect(200)).body,
    );
    expect(me.user.role).toBe('CLINIC_OWNER');
    expect(me.clinic?.id).toBe(clinicId);
    expect(me.subscription?.status).toBe('TRIALING');

    // AuditLog written (docs/api/auth.md).
    const audit = await basePrisma.auditLog.findFirst({
      where: { action: 'clinic.created', entityId: clinicId },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects a second clinic for the same user (409 USER_ALREADY_IN_CLINIC)', async () => {
    const res = await request(server)
      .post('/api/v1/clinics')
      .set('Cookie', ownerCookie)
      .send({ name: 'Encore un cabinet' })
      .expect(409);
    expect(res.body.error.code).toBe('USER_ALREADY_IN_CLINIC');
  });

  it('dedupes slugs for same-name clinics', async () => {
    const otherCookie = await signUp(strangerEmail, 'Docteur Double');
    await verifyEmailFromMail(strangerEmail);
    const res = await request(server)
      .post('/api/v1/clinics')
      .set('Cookie', otherCookie)
      .send({ name: `Cabinet Émile ${run}` })
      .expect(201);
    expect(res.body.clinic.slug).toBe(`cabinet-emile-${run}-2`);
  });

  it('rejects an invalid clinic payload (400 VALIDATION_ERROR, French message)', async () => {
    const res = await request(server)
      .post('/api/v1/clinics')
      .set('Cookie', ownerCookie)
      .send({ name: '   ' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Le nom du cabinet est requis.');
  });

  it('owner invites staff: token emailed, never returned, re-invite replaces', async () => {
    const first = await request(server)
      .post('/api/v1/staff-invites')
      .set('Cookie', ownerCookie)
      .send({ email: staffEmail })
      .expect(201);
    const invite = staffInviteSchema.parse(first.body);
    expect(invite.email).toBe(staffEmail);
    expect(JSON.stringify(first.body)).not.toContain('token');

    // Re-invite: one active invite per email per clinic.
    await request(server)
      .post('/api/v1/staff-invites')
      .set('Cookie', ownerCookie)
      .send({ email: staffEmail })
      .expect(201);
    const rows = await basePrisma.staffInvite.findMany({ where: { email: staffEmail } });
    expect(rows).toHaveLength(1);

    inviteToken = lastMailTo(staffEmail).text.match(/invite=([A-Za-z0-9_-]+)/)![1];
    // Token stored hashed, not in plaintext.
    expect(rows[0].tokenHash).not.toBe(inviteToken);
  });

  it('rejects inviting an email that already belongs to a clinic (409)', async () => {
    const res = await request(server)
      .post('/api/v1/staff-invites')
      .set('Cookie', ownerCookie)
      .send({ email: ownerEmail })
      .expect(409);
    expect(res.body.error.code).toBe('USER_ALREADY_IN_CLINIC');
  });

  it('accept: requires a verified email (403)', async () => {
    staffCookie = await signUp(staffEmail, 'Assistante Zoé');
    const res = await request(server)
      .post('/api/v1/staff-invites/accept')
      .set('Cookie', staffCookie)
      .send({ token: inviteToken })
      .expect(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('accept: bad token and wrong-account tokens are both INVITE_INVALID (400)', async () => {
    await verifyEmailFromMail(staffEmail);
    const bad = await request(server)
      .post('/api/v1/staff-invites/accept')
      .set('Cookie', staffCookie)
      .send({ token: 'not-a-real-token' })
      .expect(400);
    expect(bad.body.error.code).toBe('INVITE_INVALID');

    // A verified, clinic-less account whose email is NOT the invited one:
    // possessing the token must not be enough (invite is email-bound).
    const wrongEmail = `s12-wrong-${run}@zenvy.test`;
    const wrongCookie = await signUp(wrongEmail, 'Docteur Intrus');
    await verifyEmailFromMail(wrongEmail);
    const wrong = await request(server)
      .post('/api/v1/staff-invites/accept')
      .set('Cookie', wrongCookie)
      .send({ token: inviteToken })
      .expect(400);
    expect(wrong.body.error.code).toBe('INVITE_INVALID');
  });

  it('accept: attaches the invitee as CLINIC_STAFF and returns the fresh /me', async () => {
    const res = await request(server)
      .post('/api/v1/staff-invites/accept')
      .set('Cookie', staffCookie)
      .send({ token: inviteToken })
      .expect(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.user).toMatchObject({ role: 'CLINIC_STAFF', clinicId });
    expect(me.clinic?.id).toBe(clinicId);
    expect(me.subscription?.status).toBe('TRIALING');

    const invite = await basePrisma.staffInvite.findFirst({ where: { email: staffEmail } });
    expect(invite?.acceptedAt).not.toBeNull();

    // The documented AuditLog side-effect (docs/api/auth.md) — mirrors the
    // clinic.created assertion so this write can't regress silently.
    const audit = await basePrisma.auditLog.findFirst({
      where: { action: 'staff_invite.accepted', entityId: invite?.id },
    });
    expect(audit).not.toBeNull();
  });

  it('accept: a member re-accepting gets 409, staff cannot invite (403)', async () => {
    const again = await request(server)
      .post('/api/v1/staff-invites/accept')
      .set('Cookie', staffCookie)
      .send({ token: inviteToken })
      .expect(409);
    expect(again.body.error.code).toBe('USER_ALREADY_IN_CLINIC');

    await request(server)
      .post('/api/v1/staff-invites')
      .set('Cookie', staffCookie)
      .send({ email: `someone-${run}@zenvy.test` })
      .expect(403);
  });

  it('accept: an expired invite is INVITE_INVALID (400)', async () => {
    const expiredEmail = `s12-expired-${run}@zenvy.test`;
    await request(server)
      .post('/api/v1/staff-invites')
      .set('Cookie', ownerCookie)
      .send({ email: expiredEmail })
      .expect(201);
    const token = lastMailTo(expiredEmail).text.match(/invite=([A-Za-z0-9_-]+)/)![1];
    await basePrisma.staffInvite.updateMany({
      where: { email: expiredEmail },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const cookie = await signUp(expiredEmail, 'Retardataire');
    await verifyEmailFromMail(expiredEmail);
    const res = await request(server)
      .post('/api/v1/staff-invites/accept')
      .set('Cookie', cookie)
      .send({ token })
      .expect(400);
    expect(res.body.error.code).toBe('INVITE_INVALID');
  });
});

// Cross-tenant proof for the new tenant-scoped model (docs/04-security.md).
describe('StaffInvite tenant isolation', () => {
  it('clinic A can never see or delete clinic B invites', async () => {
    const { clinicA, clinicB, cleanup } = await seedTwoClinics();
    try {
      await basePrisma.staffInvite.createMany({
        data: [clinicA, clinicB].map((clinic, i) => ({
          clinicId: clinic.id,
          email: `iso-${i}-${clinicA.id}@zenvy.test`,
          tokenHash: `iso-hash-${i}-${clinicA.id}`,
          expiresAt: new Date(Date.now() + 60_000),
        })),
      });

      const { prisma } = await import('../src/prisma/client');
      const seenByA = await asClinic(clinicA.id, () => prisma.staffInvite.findMany());
      expect(seenByA.map((invite) => invite.clinicId)).toEqual([clinicA.id]);

      // A blanket delete from A must not touch B's invite.
      await asClinic(clinicA.id, () => prisma.staffInvite.deleteMany());
      const bRows = await basePrisma.staffInvite.findMany({ where: { clinicId: clinicB.id } });
      expect(bRows).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
