import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { billingSessionResponseSchema, errorResponseSchema } from '@zenvy/shared';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// S3-3 billing suite (docs/api/billing.md): webhook signature + idempotency,
// every Stripe→ZenvyDental state transition, and the feature gating guard.
// Events are signed locally with Stripe's own test helper and posted at the
// real endpoint — no network, no Stripe account needed. The two endpoints that
// would call Stripe are covered on the paths that reject before that call.

vi.mock('../src/mail/mailer', () => ({ sendMail: async (): Promise<void> => undefined }));

const WEBHOOK_SECRET = 'whsec_test_s33';
// Never used against the network here — only Stripe's local signature helper
// and the lazy client construction need a syntactically valid key.
process.env.STRIPE_SECRET_KEY = 'sk_test_s33';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
delete process.env.STRIPE_PRICE_ID;

const run = randomUUID().slice(0, 8);
const PASSWORD = 'MotDePasse123!';
const email = (label: string) => `s33-${label}-${run}@zenvy.test`;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 3600 * 1000);

describe('billing (S3-3)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let clinicId: string;
  let ownerCookie: string[];
  let staffCookie: string[];

  const customerId = `cus_${run}`;
  const stripeSubId = `sub_${run}`;

  const signUpAttached = async (
    label: string,
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

  /** Posts a Stripe-signed event exactly as Stripe would. */
  const postEvent = (event: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify(event);
    return request(server)
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', Stripe.webhooks.generateTestHeaderString({ payload, secret }))
      .set('Content-Type', 'application/json')
      .send(payload);
  };

  const subscriptionEvent = (
    status: string,
    overrides: Record<string, unknown> = {},
    id = `evt_${run}_${randomUUID().slice(0, 8)}`,
  ) => ({
    id,
    object: 'event',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: stripeSubId,
        object: 'subscription',
        customer: customerId,
        status,
        trial_end: null,
        metadata: { clinicId },
        ...overrides,
      },
    },
  });

  const subscriptionRow = () => basePrisma.subscription.findUnique({ where: { clinicId } });

  const setSubscription = (data: Record<string, unknown>) =>
    basePrisma.subscription.update({ where: { clinicId }, data });

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
    server = app.getHttpServer();

    const clinic = await basePrisma.clinic.create({
      data: {
        name: `Cabinet Facture ${run}`,
        slug: `billing-${run}`,
        subscription: { create: { trialEndsAt: days(14) } },
      },
    });
    clinicId = clinic.id;
    ownerCookie = await signUpAttached('owner', 'CLINIC_OWNER');
    staffCookie = await signUpAttached('staff', 'CLINIC_STAFF');
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { id: clinicId } });
    await basePrisma.user.deleteMany({ where: { email: { contains: run } } });
    await basePrisma.stripeEvent.deleteMany({ where: { id: { contains: run } } });
    await app.close();
    await basePrisma.$disconnect();
  });

  describe('webhook signature', () => {
    it('rejects an unsigned event (403) without touching the payload', async () => {
      await request(server)
        .post('/api/v1/webhooks/stripe')
        .send(subscriptionEvent('canceled'))
        .expect(403);
      expect((await subscriptionRow())?.status).toBe('TRIALING');
    });

    it('rejects an event signed with the wrong secret (403)', async () => {
      await postEvent(subscriptionEvent('canceled'), 'whsec_attacker').expect(403);
      expect((await subscriptionRow())?.status).toBe('TRIALING');
    });
  });

  describe('state transitions', () => {
    it('checkout.session.completed stores the Stripe customer and subscription ids', async () => {
      await postEvent({
        id: `evt_checkout_${run}`,
        object: 'event',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_${run}`,
            object: 'checkout.session',
            mode: 'subscription',
            client_reference_id: clinicId,
            customer: customerId,
            subscription: stripeSubId,
          },
        },
      }).expect(200);

      const row = await subscriptionRow();
      expect(row?.stripeCustomerId).toBe(customerId);
      expect(row?.stripeSubscriptionId).toBe(stripeSubId);
      // Payment state is only ever set by a subscription event.
      expect(row?.status).toBe('TRIALING');
    });

    it('trialing → active → past_due → canceled follows Stripe', async () => {
      const trialEnd = Math.floor(days(3).getTime() / 1000);
      await postEvent(subscriptionEvent('trialing', { trial_end: trialEnd })).expect(200);
      let row = await subscriptionRow();
      expect(row?.status).toBe('TRIALING');
      expect(row?.trialEndsAt?.getTime()).toBe(trialEnd * 1000);

      await postEvent(subscriptionEvent('active')).expect(200);
      expect((await subscriptionRow())?.status).toBe('ACTIVE');
      // Trial cleared when Stripe reports none — the countdown must not linger.
      expect((await subscriptionRow())?.trialEndsAt).toBeNull();

      await postEvent(subscriptionEvent('past_due')).expect(200);
      expect((await subscriptionRow())?.status).toBe('PAST_DUE');

      await postEvent({
        ...subscriptionEvent('canceled'),
        type: 'customer.subscription.deleted',
      }).expect(200);
      expect((await subscriptionRow())?.status).toBe('CANCELED');

      row = await subscriptionRow();
      expect(row?.stripeSubscriptionId).toBe(stripeSubId);
    });

    it('maps unpaid → PAST_DUE and leaves local state alone on incomplete', async () => {
      await postEvent(subscriptionEvent('unpaid')).expect(200);
      expect((await subscriptionRow())?.status).toBe('PAST_DUE');

      await postEvent(subscriptionEvent('incomplete')).expect(200);
      expect((await subscriptionRow())?.status).toBe('PAST_DUE');
    });

    it('resolves the clinic by customer id when metadata is absent', async () => {
      await postEvent(subscriptionEvent('active', { metadata: {} })).expect(200);
      expect((await subscriptionRow())?.status).toBe('ACTIVE');
    });

    it('acknowledges an event matching no clinic, and ignored event types', async () => {
      await postEvent(
        subscriptionEvent('canceled', { customer: `cus_unknown_${run}`, metadata: {} }),
      ).expect(200);
      expect((await subscriptionRow())?.status).toBe('ACTIVE');

      await postEvent({
        id: `evt_ignored_${run}`,
        object: 'event',
        type: 'invoice.paid',
        data: { object: { id: `in_${run}`, object: 'invoice' } },
      }).expect(200);
      expect((await subscriptionRow())?.status).toBe('ACTIVE');
    });

    it('never touches another clinic (cross-tenant proof)', async () => {
      const other = await basePrisma.clinic.create({
        data: {
          name: `Cabinet Voisin ${run}`,
          slug: `billing-other-${run}`,
          subscription: { create: { trialEndsAt: days(14) } },
        },
      });
      try {
        await postEvent(subscriptionEvent('canceled')).expect(200);
        const neighbour = await basePrisma.subscription.findUnique({
          where: { clinicId: other.id },
        });
        expect(neighbour?.status).toBe('TRIALING');
        expect(neighbour?.stripeSubscriptionId).toBeNull();
        expect((await subscriptionRow())?.status).toBe('CANCELED');
      } finally {
        await basePrisma.clinic.delete({ where: { id: other.id } });
      }
    });
  });

  describe('idempotency', () => {
    it('processes a replayed event id only once', async () => {
      const eventId = `evt_replay_${run}`;
      await postEvent(subscriptionEvent('past_due', {}, eventId)).expect(200);
      expect((await subscriptionRow())?.status).toBe('PAST_DUE');

      // Same id, different payload: a redelivery must not be re-applied, so
      // the CANCELED body is ignored entirely.
      await postEvent(subscriptionEvent('canceled', {}, eventId)).expect(200);
      expect((await subscriptionRow())?.status).toBe('PAST_DUE');
      expect(await basePrisma.stripeEvent.count({ where: { id: eventId } })).toBe(1);
    });
  });

  describe('feature gating', () => {
    const listPatients = (cookie: string[]) =>
      request(server).get('/api/v1/patients').set('Cookie', cookie);

    it('lets an active trial through', async () => {
      await setSubscription({ status: 'TRIALING', trialEndsAt: days(3) });
      await listPatients(ownerCookie).expect(200);
    });

    it('blocks an expired trial (402) without any scheduled job', async () => {
      await setSubscription({ status: 'TRIALING', trialEndsAt: days(-1) });
      const res = await listPatients(ownerCookie).expect(402);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('SUBSCRIPTION_INACTIVE');
    });

    it('blocks PAST_DUE and CANCELED, allows ACTIVE', async () => {
      await setSubscription({ status: 'PAST_DUE', trialEndsAt: null });
      await listPatients(ownerCookie).expect(402);

      await setSubscription({ status: 'CANCELED' });
      await listPatients(ownerCookie).expect(402);

      await setSubscription({ status: 'ACTIVE' });
      await listPatients(ownerCookie).expect(200);
    });

    it('keeps /me and billing reachable while blocked', async () => {
      await setSubscription({ status: 'PAST_DUE' });
      await request(server).get('/api/v1/me').set('Cookie', ownerCookie).expect(200);
      // 503, not 402: gating let it through and only STRIPE_PRICE_ID is missing.
      await request(server)
        .post('/api/v1/billing/checkout-session')
        .set('Cookie', ownerCookie)
        .expect(503);
    });
  });

  describe('endpoints', () => {
    it('refuses billing to staff (403) and to anonymous callers (401)', async () => {
      await request(server)
        .post('/api/v1/billing/portal-session')
        .set('Cookie', staffCookie)
        .expect(403);
      await request(server).post('/api/v1/billing/portal-session').expect(401);
    });

    it('refuses the portal before any checkout (409)', async () => {
      await setSubscription({ status: 'ACTIVE', stripeCustomerId: null });
      const res = await request(server)
        .post('/api/v1/billing/portal-session')
        .set('Cookie', ownerCookie)
        .expect(409);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('BILLING_NO_CUSTOMER');
    });

    it('refuses a second checkout while ACTIVE (409)', async () => {
      process.env.STRIPE_PRICE_ID = `price_${run}`;
      try {
        await setSubscription({ status: 'ACTIVE' });
        const res = await request(server)
          .post('/api/v1/billing/checkout-session')
          .set('Cookie', ownerCookie)
          .expect(409);
        expect(errorResponseSchema.parse(res.body).error.code).toBe('CONFLICT');
      } finally {
        delete process.env.STRIPE_PRICE_ID;
      }
    });

    it('answers 503 when Stripe is not configured', async () => {
      await setSubscription({ status: 'TRIALING', trialEndsAt: days(3) });
      const res = await request(server)
        .post('/api/v1/billing/checkout-session')
        .set('Cookie', ownerCookie)
        .expect(503);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('BILLING_UNAVAILABLE');
    });
  });

  it('exposes the session URL shape the frontend redirects to', () => {
    expect(billingSessionResponseSchema.parse({ url: 'https://checkout.stripe.com/c/pay/cs_test' }))
      .toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test' });
  });
});
