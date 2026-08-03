import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { conversationListResponseSchema, conversationSchema, messageSchema } from '@zenvy/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// S2-2 inbox suite (docs/api/conversations.md): list filtering and preview,
// detail window, message pagination, the three lifecycle actions, every send
// guard, and the mandatory cross-tenant proof. Graph API and mailer are stubbed
// — no network, no e-mail.

vi.mock('../src/mail/mailer', () => ({ sendMail: async (): Promise<void> => undefined }));
vi.mock('../src/whatsapp/graph', () => ({ sendText: vi.fn(async () => 'wamid.stub') }));

const run = randomUUID().slice(0, 8);
const PASSWORD = 'MotDePasse123!';
const email = (label: string) => `s22-${label}-${run}@zenvy.test`;
const HOUR = 60 * 60 * 1000;

describe('conversations (S2-2)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let clinicA: { id: string };
  let clinicB: { id: string };
  let cookie: string[]; // staff of clinic A
  let otherCookie: string[]; // owner of clinic B
  let live: { id: string }; // AI thread, patient linked, window open
  let closed: { id: string };
  let foreign: { id: string }; // clinic B's thread

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

  /** A thread with one inbound message, i.e. an open 24h window by default. */
  const seedThread = async (
    clinicId: string,
    phone: string,
    overrides: Record<string, unknown> = {},
    inboundAt = new Date(),
  ) => {
    const conversation = await basePrisma.conversation.create({
      data: { clinicId, waContactPhone: phone, lastMessageAt: inboundAt, ...overrides },
    });
    await basePrisma.message.create({
      data: {
        clinicId,
        conversationId: conversation.id,
        direction: 'IN',
        author: 'PATIENT',
        body: 'Bonjour, '.repeat(30),
        waMessageId: `wamid.${conversation.id}`,
        createdAt: inboundAt,
      },
    });
    return conversation;
  };

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();

    [clinicA, clinicB] = await Promise.all(
      (['a', 'b'] as const).map((l) =>
        basePrisma.clinic.create({
          data: { name: `Cabinet ${l} ${run}`, slug: `conv-${l}-${run}`,
            subscription: { create: { trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000) } },
          },
        }),
      ),
    );
    cookie = await signUpAttached('staff', clinicA.id, 'CLINIC_STAFF');
    otherCookie = await signUpAttached('other', clinicB.id, 'CLINIC_OWNER');

    await basePrisma.whatsAppAccount.create({
      data: {
        clinicId: clinicA.id,
        phoneNumberId: `pnid-conv-${run}`,
        wabaId: 'waba-a',
        displayNumber: '+33100000001',
      },
    });
    const patient = await basePrisma.patient.create({
      data: {
        clinicId: clinicA.id,
        firstName: 'Amélie',
        lastName: 'Durand',
        phone: '+33612347001',
        source: 'WHATSAPP_INBOUND',
      },
    });
    live = await seedThread(clinicA.id, '+33612347001', {
      patientId: patient.id,
      urgentFlag: true,
    });
    closed = await seedThread(clinicA.id, '+33612347002', { status: 'CLOSED' });
    foreign = await seedThread(clinicB.id, '+33612347003');
  });

  beforeEach(async () => {
    // Each action test starts from the seeded state (AI, urgent, window open).
    await basePrisma.conversation.update({
      where: { id: live.id },
      data: { status: 'AI', urgentFlag: true },
    });
    await basePrisma.auditLog.deleteMany({ where: { entityId: live.id } });
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { id: { in: [clinicA.id, clinicB.id] } } });
    await basePrisma.user.deleteMany({ where: { email: { contains: run } } });
    await app.close();
    await basePrisma.$disconnect();
  });

  const get = (path: string, as = cookie) => request(server).get(path).set('Cookie', as);
  const post = (path: string, as = cookie) => request(server).post(path).set('Cookie', as);

  it('rejects unauthenticated access (401)', async () => {
    await request(server).get('/api/v1/conversations').expect(401);
  });

  it('lists live threads with a truncated preview and hides CLOSED by default', async () => {
    const res = await get('/api/v1/conversations').expect(200);
    const body = conversationListResponseSchema.parse(res.body);
    const ids = body.items.map((c) => c.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(closed.id);
    expect(ids).not.toContain(foreign.id);
    const thread = body.items.find((c) => c.id === live.id)!;
    expect(thread.lastMessagePreview).toHaveLength(140);
    expect(thread.lastMessageAuthor).toBe('PATIENT');
    expect(thread.patient?.phone).toBe('+33612347001');
  });

  it('lists CLOSED threads when asked, and treats a blank filter as unset', async () => {
    const filtered = await get('/api/v1/conversations?status=CLOSED').expect(200);
    expect(filtered.body.items.map((c: { id: string }) => c.id)).toEqual([closed.id]);
    const blank = await get('/api/v1/conversations?status=').expect(200);
    expect(blank.body.items.map((c: { id: string }) => c.id)).not.toContain(closed.id);
  });

  it('returns the detail with the 24h window and paginates messages', async () => {
    const res = await get(`/api/v1/conversations/${live.id}`).expect(200);
    const conversation = conversationSchema.parse(res.body);
    expect(conversation.windowExpiresAt).not.toBeNull();
    expect(Date.parse(conversation.windowExpiresAt!)).toBeGreaterThan(Date.now());

    const messages = await get(`/api/v1/conversations/${live.id}/messages?limit=1`).expect(200);
    expect(messages.body.items).toHaveLength(1);
    expect(messageSchema.parse(messages.body.items[0]).direction).toBe('IN');
    expect(messages.body.items[0].waMessageId).toBeUndefined();
  });

  it('hides another clinic’s thread behind 404 (cross-tenant)', async () => {
    await get(`/api/v1/conversations/${foreign.id}`).expect(404);
    await get(`/api/v1/conversations/${foreign.id}/messages`).expect(404);
    await post(`/api/v1/conversations/${foreign.id}/takeover`).expect(404);
    await post(`/api/v1/conversations/${foreign.id}/messages`).send({ body: 'Coucou' }).expect(404);
    // …and clinic B still sees its own thread untouched.
    await get(`/api/v1/conversations/${foreign.id}`, otherCookie).expect(200);
  });

  it('takes over: clears the urgent flag, audits once, and is idempotent', async () => {
    const res = await post(`/api/v1/conversations/${live.id}/takeover`).expect(200);
    expect(res.body.status).toBe('HUMAN');
    expect(res.body.urgentFlag).toBe(false);
    await post(`/api/v1/conversations/${live.id}/takeover`).expect(200);
    const audits = await basePrisma.auditLog.findMany({ where: { entityId: live.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('conversation.takeover');
  });

  it('releases back to the AI and closes without losing messages', async () => {
    await post(`/api/v1/conversations/${live.id}/takeover`).expect(200);
    const released = await post(`/api/v1/conversations/${live.id}/release`).expect(200);
    expect(released.body.status).toBe('AI');
    const closedRes = await post(`/api/v1/conversations/${live.id}/close`).expect(200);
    expect(closedRes.body.status).toBe('CLOSED');
    expect(closedRes.body.urgentFlag).toBe(false);
    expect(await basePrisma.message.count({ where: { conversationId: live.id } })).toBe(1);
  });

  it('refuses to send on a thread the AI still owns (422)', async () => {
    const res = await post(`/api/v1/conversations/${live.id}/messages`)
      .send({ body: 'Bonjour' })
      .expect(422);
    expect(res.body.error.code).toBe('CONVERSATION_NOT_TAKEN_OVER');
  });

  it('refuses to send outside the 24h window (422)', async () => {
    const stale = await seedThread(
      clinicA.id,
      `+3361234${run.slice(0, 4)}`,
      { status: 'HUMAN' },
      new Date(Date.now() - 25 * HOUR),
    );
    const res = await post(`/api/v1/conversations/${stale.id}/messages`)
      .send({ body: 'Bonjour' })
      .expect(422);
    expect(res.body.error.code).toBe('OUTSIDE_24H_WINDOW');
  });

  it('refuses to send to an opted-out patient (422)', async () => {
    const patient = await basePrisma.patient.create({
      data: {
        clinicId: clinicA.id,
        firstName: 'Karim',
        lastName: 'Benali',
        phone: '+33612347004',
        optOut: true,
      },
    });
    const thread = await seedThread(clinicA.id, '+33612347004', {
      status: 'HUMAN',
      patientId: patient.id,
    });
    const res = await post(`/api/v1/conversations/${thread.id}/messages`)
      .send({ body: 'Bonjour' })
      .expect(422);
    expect(res.body.error.code).toBe('PATIENT_OPTED_OUT');
  });

  it('sends a staff reply through the Graph API and stores it as PENDING', async () => {
    await post(`/api/v1/conversations/${live.id}/takeover`).expect(200);
    const res = await post(`/api/v1/conversations/${live.id}/messages`)
      .send({ body: 'Bonjour, je prends la suite.' })
      .expect(201);
    const message = messageSchema.parse(res.body);
    expect(message).toMatchObject({
      direction: 'OUT',
      author: 'STAFF',
      deliveryStatus: 'PENDING',
      body: 'Bonjour, je prends la suite.',
    });
    const { sendText } = await import('../src/whatsapp/graph');
    expect(sendText).toHaveBeenCalledWith(
      expect.stringContaining('pnid-conv-'),
      '+33612347001',
      'Bonjour, je prends la suite.',
    );
    const stored = await basePrisma.message.findFirst({ where: { id: message.id } });
    expect(stored?.waMessageId).toBe('wamid.stub');
    const thread = await basePrisma.conversation.findUnique({ where: { id: live.id } });
    expect(thread!.lastMessageAt!.getTime()).toBeGreaterThan(Date.now() - HOUR);
  });

  it('rejects an empty body (400)', async () => {
    await post(`/api/v1/conversations/${live.id}/messages`).send({ body: '   ' }).expect(400);
  });
});
