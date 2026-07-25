import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../src/prisma/client';
import { InboundQueue } from '../src/whatsapp/inbound.queue';

// S0-9: the Meta verification handshake succeeds and everything unsigned is
// rejected. S2-2: a signed event is enqueued (never processed on the request
// path), and a rejected one enqueues nothing. The queue is stubbed — Redis is
// not part of this suite (nor of CI).
const VERIFY_TOKEN = 'zenvy-test-verify-token';
const APP_SECRET = 'zenvy-test-app-secret';
process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.META_APP_SECRET = APP_SECRET;

const WEBHOOK_PATH = '/api/v1/webhooks/whatsapp';

const sign = (body: string, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const payload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '215589313241560883',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15551797781', phone_number_id: '7794189252778687' },
            messages: [{ from: '33612345678', type: 'text', text: { body: 'Bonjour !' } }],
          },
        },
      ],
    },
  ],
});

describe('whatsapp webhook', () => {
  let app: INestApplication;
  let enqueue: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    enqueue = vi.spyOn(app.get(InboundQueue), 'add').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
    await basePrisma.$disconnect();
  });

  it('answers the Meta verification handshake with the challenge', async () => {
    const res = await request(app.getHttpServer())
      .get(WEBHOOK_PATH)
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      })
      .expect(200);
    expect(res.text).toBe('1158201444');
  });

  it('rejects the handshake on a wrong verify token (403)', async () => {
    await request(app.getHttpServer())
      .get(WEBHOOK_PATH)
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' })
      .expect(403);
  });

  it('rejects the handshake on a missing token (403)', async () => {
    await request(app.getHttpServer())
      .get(WEBHOOK_PATH)
      .query({ 'hub.mode': 'subscribe', 'hub.challenge': '1' })
      .expect(403);
  });

  it('accepts a correctly signed event (200) and enqueues one routed job', async () => {
    enqueue.mockClear();
    await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(payload))
      .send(payload)
      .expect(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toMatchObject({
      phoneNumberId: '7794189252778687',
      value: { messages: [{ from: '33612345678' }] },
    });
  });

  it('rejects a payload signed with the wrong secret (403) and enqueues nothing', async () => {
    enqueue.mockClear();
    await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(payload, 'attacker-secret'))
      .send(payload)
      .expect(403);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a tampered payload (403)', async () => {
    await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', sign(payload))
      .send(payload.replace('Bonjour !', 'Virement de 1000€'))
      .expect(403);
  });

  it('treats the CHANGE_ME placeholder as no secret at all (403)', async () => {
    process.env.META_VERIFY_TOKEN = 'CHANGE_ME';
    process.env.META_APP_SECRET = 'CHANGE_ME';
    try {
      await request(app.getHttpServer())
        .get(WEBHOOK_PATH)
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'CHANGE_ME', 'hub.challenge': '1' })
        .expect(403);
      await request(app.getHttpServer())
        .post(WEBHOOK_PATH)
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', sign(payload, 'CHANGE_ME'))
        .send(payload)
        .expect(403);
    } finally {
      process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;
      process.env.META_APP_SECRET = APP_SECRET;
    }
  });

  it('rejects a missing signature header (403)', async () => {
    await request(app.getHttpServer())
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(403);
  });
});
