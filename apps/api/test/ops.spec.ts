import { randomUUID } from 'node:crypto';
import type { ArgumentsHost, INestApplication } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import {
  opsClientListResponseSchema,
  opsErrorListResponseSchema,
  opsErrorSchema,
  opsOnboardingRequestListResponseSchema,
  supportThreadListResponseSchema,
  supportThreadSchema,
} from '@zenvy/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from '../src/common/http';
import { basePrisma } from '../src/prisma/client';

// S4-1 ops suite (docs/api/ops.md): SUPER_ADMIN-only access, the client list,
// the error viewer, the onboarding queue, and both halves of support chat —
// including the mandatory cross-tenant proof (a clinic must never reach another
// clinic's thread, which matters more here because SupportMessage is NOT scoped
// by the tenant extension) and the ErrorLog write the viewer reads from.

vi.mock('../src/mail/mailer', () => ({ sendMail: async (): Promise<void> => undefined }));

const run = randomUUID().slice(0, 8);
const PASSWORD = 'MotDePasse123!';
const email = (label: string) => `s41-${label}-${run}@zenvy.test`;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 3600 * 1000);

describe('ops (S4-1)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let clinicA: { id: string; slug: string };
  let clinicB: { id: string; slug: string };
  let adminCookie: string[];
  let ownerACookie: string[];
  let ownerBCookie: string[]; // clinic B: subscription CANCELED
  let threadA: string;
  let threadB: string;

  const signUp = async (label: string): Promise<string[]> => {
    const res = await request(server)
      .post('/api/v1/auth/sign-up/email')
      .send({ email: email(label), password: PASSWORD, name: `User ${label}` })
      .expect(200);
    return res.get('Set-Cookie')!;
  };

  const signUpAs = async (
    label: string,
    clinicId: string | null,
    role: 'SUPER_ADMIN' | 'CLINIC_OWNER' | 'CLINIC_STAFF',
  ): Promise<string[]> => {
    const cookie = await signUp(label);
    await basePrisma.user.update({
      where: { email: email(label) },
      data: { emailVerified: true, clinicId, role },
    });
    return cookie;
  };

  const seedError = (data: Record<string, unknown>) =>
    basePrisma.errorLog.create({
      data: { module: 'ai', severity: 'ERROR', message: `seeded ${run}`, ...data },
    });

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();

    clinicA = await basePrisma.clinic.create({
      data: {
        name: `Cabinet Alpha ${run}`,
        slug: `ops-alpha-${run}`,
        onboardingStatus: 'IN_PROGRESS',
        subscription: { create: { trialEndsAt: days(14) } },
        whatsAppAccounts: {
          create: {
            phoneNumberId: `pn-${run}`,
            wabaId: `waba-${run}`,
            displayNumber: '+33600000001',
            verified: true,
          },
        },
      },
    });
    clinicB = await basePrisma.clinic.create({
      data: {
        name: `Cabinet Beta ${run}`,
        slug: `ops-beta-${run}`,
        subscription: { create: { status: 'CANCELED', trialEndsAt: days(-1) } },
        // Present but unverified — whatsappConnected must stay false.
        whatsAppAccounts: {
          create: {
            phoneNumberId: `pn-b-${run}`,
            wabaId: `waba-b-${run}`,
            displayNumber: '+33600000002',
          },
        },
      },
    });

    // Clinic A: two patients, one soft-deleted (excluded from counts).
    await basePrisma.patient.createMany({
      data: [
        {
          clinicId: clinicA.id,
          firstName: 'Marie',
          lastName: 'Durand',
          phone: `+3361000${run.slice(0, 4)}`,
        },
        {
          clinicId: clinicA.id,
          firstName: 'Paul',
          lastName: 'Martin',
          phone: `+3362000${run.slice(0, 4)}`,
          deletedAt: new Date(),
        },
      ],
    });

    adminCookie = await signUpAs('admin', null, 'SUPER_ADMIN');
    ownerACookie = await signUpAs('ownera', clinicA.id, 'CLINIC_OWNER');
    ownerBCookie = await signUpAs('ownerb', clinicB.id, 'CLINIC_OWNER');
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { slug: { contains: run } } });
    await basePrisma.user.deleteMany({ where: { email: { contains: run } } });
    await basePrisma.errorLog.deleteMany({ where: { message: { contains: run } } });
    await app.close();
    await basePrisma.$disconnect();
  });

  describe('access control', () => {
    it('refuses every /ops route to a clinic role (403)', async () => {
      for (const path of ['clients', 'errors', 'onboarding-requests', 'support-threads']) {
        await request(server).get(`/api/v1/ops/${path}`).set('Cookie', ownerACookie).expect(403);
      }
    });

    it('refuses /ops to an anonymous caller (401)', async () => {
      await request(server).get('/api/v1/ops/clients').expect(401);
    });

    it('refuses the clinic support routes to the founder (403)', async () => {
      await request(server).get('/api/v1/support-threads').set('Cookie', adminCookie).expect(403);
    });
  });

  describe('clients list', () => {
    it('returns clinics with subscription, WhatsApp state and live counts', async () => {
      const res = await request(server)
        .get('/api/v1/ops/clients?limit=100')
        .set('Cookie', adminCookie)
        .expect(200);
      const { items } = opsClientListResponseSchema.parse(res.body);

      const a = items.find((c) => c.id === clinicA.id)!;
      expect(a.subscription).toMatchObject({ status: 'TRIALING', plan: 'PREMIUM' });
      expect(a.whatsappConnected).toBe(true);
      expect(a.onboardingStatus).toBe('IN_PROGRESS');
      // Soft-deleted patients are not clients' patients any more.
      expect(a.counts.patients).toBe(1);
      expect(a.counts.users).toBe(1);

      const b = items.find((c) => c.id === clinicB.id)!;
      expect(b.subscription?.status).toBe('CANCELED');
      // The number exists but Meta has not verified it — not connected.
      expect(b.whatsappConnected).toBe(false);
    });

    it('filters by search, subscription status and onboarding status', async () => {
      const bySearch = await request(server)
        .get(`/api/v1/ops/clients?search=alpha-${run}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(bySearch.body.items.map((c: { id: string }) => c.id)).toEqual([clinicA.id]);

      const byStatus = await request(server)
        .get(`/api/v1/ops/clients?subscriptionStatus=CANCELED&search=${run}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(byStatus.body.items.map((c: { id: string }) => c.id)).toEqual([clinicB.id]);

      const byOnboarding = await request(server)
        .get(`/api/v1/ops/clients?onboardingStatus=IN_PROGRESS&search=${run}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(byOnboarding.body.items.map((c: { id: string }) => c.id)).toEqual([clinicA.id]);
    });

    it('paginates with a stable cursor', async () => {
      const first = await request(server)
        .get(`/api/v1/ops/clients?search=${run}&limit=1`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.nextCursor).toBeTruthy();

      const second = await request(server)
        .get(`/api/v1/ops/clients?search=${run}&limit=1&cursor=${first.body.nextCursor}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });
  });

  describe('error viewer', () => {
    let detailId: string;

    beforeAll(async () => {
      const old = await seedError({
        clinicId: clinicA.id,
        module: 'whatsapp',
        severity: 'WARN',
        correlationId: `req_old_${run}`,
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      });
      const recent = await seedError({
        clinicId: clinicA.id,
        correlationId: `req_hunt_${run}`,
        stack: 'Error: boom\n  at somewhere',
        context: { conversationId: 'conv_1' },
      });
      await seedError({ clinicId: clinicB.id, severity: 'FATAL' });
      await seedError({}); // platform-level: no clinic
      detailId = recent.id;
      expect(old.id).toBeTruthy();
    });

    it('lists newest first without stacks, filtered by clinic', async () => {
      const res = await request(server)
        .get(`/api/v1/ops/errors?clinicId=${clinicA.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      const { items } = opsErrorListResponseSchema.parse(res.body);
      expect(items).toHaveLength(2);
      expect(items[0].id).toBe(detailId); // newest first
      expect(items[0].clinic?.slug).toBe(clinicA.slug);
      expect(items[0]).not.toHaveProperty('stack');
    });

    it('filters by correlation id — the code the clinic reports', async () => {
      const res = await request(server)
        .get(`/api/v1/ops/errors?correlationId=req_hunt_${run}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(res.body.items.map((e: { id: string }) => e.id)).toEqual([detailId]);
    });

    it('filters by severity, module and date window', async () => {
      const fatal = await request(server)
        .get(`/api/v1/ops/errors?severity=FATAL&clinicId=${clinicB.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(fatal.body.items).toHaveLength(1);

      const byModule = await request(server)
        .get(`/api/v1/ops/errors?module=whatsapp&clinicId=${clinicA.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(byModule.body.items).toHaveLength(1);

      // The 2020 row is outside the window, the recent one is inside.
      const windowed = await request(server)
        .get(`/api/v1/ops/errors?clinicId=${clinicA.id}&since=2021-01-01T00:00:00.000Z`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(windowed.body.items.map((e: { id: string }) => e.id)).toEqual([detailId]);

      const before = await request(server)
        .get(`/api/v1/ops/errors?clinicId=${clinicA.id}&until=2021-01-01T00:00:00.000Z`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(before.body.items).toHaveLength(1);
      expect(before.body.items[0].id).not.toBe(detailId);
    });

    it('returns stack and context on the detail route, 404 on an unknown id', async () => {
      const res = await request(server)
        .get(`/api/v1/ops/errors/${detailId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      const detail = opsErrorSchema.parse(res.body);
      expect(detail.stack).toContain('boom');
      expect(detail.context).toEqual({ conversationId: 'conv_1' });

      const missing = await request(server)
        .get('/api/v1/ops/errors/nope')
        .set('Cookie', adminCookie)
        .expect(404);
      expect(missing.body.error.code).toBe('ERROR_LOG_NOT_FOUND');
    });
  });

  // The viewer is only as good as what feeds it (docs/06-observability.md).
  describe('exception filter persistence', () => {
    const fakeHost = (req: unknown, res: unknown): ArgumentsHost =>
      ({
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      }) as unknown as ArgumentsHost;

    const capture = () => {
      const res = {
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(body: unknown) {
          this.body = body;
        },
      };
      return res;
    };

    it('writes an ErrorLog row for a 5xx, keyed by the correlationId the user sees', async () => {
      const res = capture();
      const owner = await basePrisma.user.findUniqueOrThrow({ where: { email: email('ownera') } });
      const req = {
        method: 'GET',
        originalUrl: '/api/v1/patients',
        sessionUser: { id: owner.id, clinicId: clinicA.id },
      };
      await new ApiExceptionFilter().catch(new Error(`boom ${run}`), fakeHost(req, res));

      expect(res.statusCode).toBe(500);
      const { correlationId } = (res.body as { error: { correlationId: string } }).error;
      const row = await basePrisma.errorLog.findFirst({ where: { correlationId } });
      expect(row).toMatchObject({
        clinicId: clinicA.id,
        userId: owner.id,
        module: 'http',
        severity: 'ERROR',
        message: `boom ${run}`,
      });
      expect(row?.stack).toContain('Error: boom');
      expect(row?.context).toMatchObject({ method: 'GET', path: '/api/v1/patients', status: 500 });
      await basePrisma.errorLog.deleteMany({ where: { correlationId } });
    });

    it('writes nothing for a 4xx — the caller’s mistake is not our breakage', async () => {
      const res = capture();
      const before = await basePrisma.errorLog.count();
      await new ApiExceptionFilter().catch(
        new HttpException('Not found', 404),
        fakeHost({ method: 'GET', originalUrl: '/api/v1/patients/nope' }, res),
      );
      expect(res.statusCode).toBe(404);
      expect(await basePrisma.errorLog.count()).toBe(before);
    });
  });

  describe('onboarding queue', () => {
    let requestId: string;
    let newClinicId: string;

    it('is fed by clinic creation — a signup is a queue item', async () => {
      const cookie = await signUpAs('founder2', null, 'CLINIC_STAFF');
      const created = await request(server)
        .post('/api/v1/clinics')
        .set('Cookie', cookie)
        .send({ name: `Cabinet Gamma ${run}`, timezone: 'Europe/Paris' })
        .expect(201);
      newClinicId = created.body.clinic.id;

      const res = await request(server)
        .get(`/api/v1/ops/onboarding-requests?clinicId=${newClinicId}`)
        .set('Cookie', adminCookie)
        .expect(200);
      const { items } = opsOnboardingRequestListResponseSchema.parse(res.body);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ status: 'PENDING', notes: null, scheduledCallAt: null });
      expect(items[0].clinic.name).toBe(`Cabinet Gamma ${run}`);
      requestId = items[0].id;
    });

    it('schedules a call, then clears the note', async () => {
      const callAt = days(2).toISOString();
      const scheduled = await request(server)
        .patch(`/api/v1/ops/onboarding-requests/${requestId}`)
        .set('Cookie', adminCookie)
        .send({
          status: 'CALL_SCHEDULED',
          notes: 'Rappeler le cabinet à 14h',
          scheduledCallAt: callAt,
        })
        .expect(200);
      expect(scheduled.body).toMatchObject({
        status: 'CALL_SCHEDULED',
        notes: 'Rappeler le cabinet à 14h',
        scheduledCallAt: callAt,
      });

      const cleared = await request(server)
        .patch(`/api/v1/ops/onboarding-requests/${requestId}`)
        .set('Cookie', adminCookie)
        .send({ status: 'DONE', notes: null })
        .expect(200);
      // Absent key untouched, explicit null cleared.
      expect(cleared.body).toMatchObject({ status: 'DONE', notes: null, scheduledCallAt: callAt });
    });

    it('filters by status and 404s on an unknown id', async () => {
      const res = await request(server)
        .get('/api/v1/ops/onboarding-requests?status=PENDING&limit=100')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(res.body.items.every((r: { status: string }) => r.status === 'PENDING')).toBe(true);
      expect(res.body.items.some((r: { id: string }) => r.id === requestId)).toBe(false);

      const missing = await request(server)
        .patch('/api/v1/ops/onboarding-requests/nope')
        .set('Cookie', adminCookie)
        .send({ status: 'DONE' })
        .expect(404);
      expect(missing.body.error.code).toBe('ONBOARDING_REQUEST_NOT_FOUND');
    });

    afterAll(async () => {
      await basePrisma.clinic.deleteMany({ where: { id: newClinicId } });
    });
  });

  describe('support chat', () => {
    it('lets a clinic open a thread carrying its first message', async () => {
      const res = await request(server)
        .post('/api/v1/support-threads')
        .set('Cookie', ownerACookie)
        .send({ subject: 'Numéro WhatsApp', body: 'Bonjour, quand connectez-vous notre numéro ?' })
        .expect(201);
      const thread = supportThreadSchema.parse(res.body);
      threadA = thread.id;
      expect(thread.status).toBe('OPEN');
      expect(thread.messages).toHaveLength(1);
      expect(thread.messages[0]).toMatchObject({
        authorRole: 'CLINIC_OWNER',
        authorName: 'User ownera',
      });
      expect(thread.messageCount).toBe(1);
      expect(thread.lastMessagePreview).toContain('Bonjour');

      const b = await request(server)
        .post('/api/v1/support-threads')
        .set('Cookie', ownerBCookie)
        .send({ body: 'Notre abonnement est bloqué.' })
        .expect(201);
      threadB = b.body.id;
    });

    it('keeps support reachable for a clinic whose subscription is dead', async () => {
      // Same session, same clinic: gated elsewhere, allowed here.
      await request(server).get('/api/v1/patients').set('Cookie', ownerBCookie).expect(402);
      await request(server).get('/api/v1/support-threads').set('Cookie', ownerBCookie).expect(200);
    });

    it('never shows a clinic another clinic’s thread', async () => {
      const list = await request(server)
        .get('/api/v1/support-threads')
        .set('Cookie', ownerACookie)
        .expect(200);
      const { items } = supportThreadListResponseSchema.parse(list.body);
      expect(items.map((t) => t.id)).toEqual([threadA]);

      // A clinicId in the query is ignored — tenancy comes from the session.
      const spoofed = await request(server)
        .get(`/api/v1/support-threads?clinicId=${clinicB.id}`)
        .set('Cookie', ownerACookie)
        .expect(200);
      expect(spoofed.body.items.map((t: { id: string }) => t.id)).toEqual([threadA]);

      await request(server)
        .get(`/api/v1/support-threads/${threadB}`)
        .set('Cookie', ownerACookie)
        .expect(404);
    });

    it('refuses a cross-tenant reply without touching the foreign thread', async () => {
      const res = await request(server)
        .post(`/api/v1/support-threads/${threadB}/messages`)
        .set('Cookie', ownerACookie)
        .send({ body: 'injection' })
        .expect(404);
      expect(res.body.error.code).toBe('SUPPORT_THREAD_NOT_FOUND');
      // SupportMessage is not scoped by the extension: prove nothing was written.
      expect(await basePrisma.supportMessage.count({ where: { threadId: threadB } })).toBe(1);
    });

    it('lets the founder read every thread and answer anonymously', async () => {
      const all = await request(server)
        .get('/api/v1/ops/support-threads?limit=100')
        .set('Cookie', adminCookie)
        .expect(200);
      const ids = all.body.items.map((t: { id: string }) => t.id);
      expect(ids).toContain(threadA);
      expect(ids).toContain(threadB);

      const filtered = await request(server)
        .get(`/api/v1/ops/support-threads?clinicId=${clinicA.id}`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(filtered.body.items.map((t: { id: string }) => t.id)).toEqual([threadA]);

      const reply = await request(server)
        .post(`/api/v1/ops/support-threads/${threadA}/messages`)
        .set('Cookie', adminCookie)
        .send({ body: 'Nous connectons votre numéro demain matin.' })
        .expect(201);
      // The clinic sees the role, never the founder's name.
      expect(reply.body).toMatchObject({ authorRole: 'SUPER_ADMIN', authorName: null });

      const detail = await request(server)
        .get(`/api/v1/support-threads/${threadA}`)
        .set('Cookie', ownerACookie)
        .expect(200);
      const thread = supportThreadSchema.parse(detail.body);
      expect(thread.messages.map((m) => m.authorRole)).toEqual(['CLINIC_OWNER', 'SUPER_ADMIN']);
      expect(thread.status).toBe('OPEN'); // answering does not close
    });

    it('reopens a closed thread when the clinic writes again', async () => {
      const closed = await request(server)
        .patch(`/api/v1/ops/support-threads/${threadA}`)
        .set('Cookie', adminCookie)
        .send({ status: 'CLOSED' })
        .expect(200);
      expect(closed.body.status).toBe('CLOSED');

      await request(server)
        .post(`/api/v1/support-threads/${threadA}/messages`)
        .set('Cookie', ownerACookie)
        .send({ body: 'Merci, une dernière question.' })
        .expect(201);

      const reopened = await request(server)
        .get(`/api/v1/support-threads/${threadA}`)
        .set('Cookie', ownerACookie)
        .expect(200);
      expect(reopened.body.status).toBe('OPEN');
      expect(reopened.body.messageCount).toBe(3);
    });

    it('404s the founder on an unknown thread', async () => {
      await request(server)
        .get('/api/v1/ops/support-threads/nope')
        .set('Cookie', adminCookie)
        .expect(404);
      await request(server)
        .patch('/api/v1/ops/support-threads/nope')
        .set('Cookie', adminCookie)
        .send({ status: 'CLOSED' })
        .expect(404);
    });
  });
});
