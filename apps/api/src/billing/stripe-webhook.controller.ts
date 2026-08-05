import {
  Controller,
  ForbiddenException,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '../auth/rbac';
import type { SubscriptionStatus } from '../generated/prisma/enums';
import { basePrisma, prisma } from '../prisma/client';
import { runAsClinic } from '../tenancy/tenant-context';
import { idOf, mapSubscriptionStatus, stripe, stripeConfig } from './stripe';

// Stripe webhook receiver (S3-3, docs/api/billing.md) — the ONLY writer of
// subscription state. Signature is verified against the exact raw body before
// any payload use (docs/04 §Platform hardening); everything past that answers
// 200, including ignored event types: a non-2xx would make Stripe retry an
// event we dropped on purpose.

@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger('StripeWebhook');

  @Public()
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>): Promise<void> {
    const secret = stripeConfig('STRIPE_WEBHOOK_SECRET');
    const signature = req.header('stripe-signature');
    if (!secret || !signature || !req.rawBody) {
      this.logger.warn('Stripe event rejected: missing secret, signature, or raw body');
      throw new ForbiddenException('Signature du webhook invalide.');
    }

    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(req.rawBody, signature, secret);
    } catch {
      // Covers a bad signature and a stale timestamp (Stripe's replay window).
      this.logger.warn('Stripe event rejected: signature verification failed');
      throw new ForbiddenException('Signature du webhook invalide.');
    }

    // Idempotency by event id (docs/03-api-conventions.md). Recorded AFTER the
    // work, not before: every effect below is an idempotent state assignment,
    // so re-applying a retried event is harmless, while marking it done first
    // would let a mid-processing crash silence Stripe's retry for good.
    const seen = await basePrisma.stripeEvent.findUnique({
      where: { id: event.id },
      select: { id: true },
    });
    if (seen) {
      this.logger.log(`Stripe event ${event.id} already processed`);
      return;
    }

    await this.apply(event);
    await basePrisma.stripeEvent.createMany({
      data: [{ id: event.id, type: event.type }],
      skipDuplicates: true,
    });
  }

  private async apply(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = idOf(session.customer);
        const subscriptionId = idOf(session.subscription);
        // No ordering guard here: this event carries ids, not status, and the
        // ids of a stale session are the ones we already hold.
        await this.update(session.client_reference_id, customerId, {
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        });
        return;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const status = mapSubscriptionStatus(subscription.status);
        // `incomplete`: the first payment is still in flight — local state stands.
        if (!status) return;
        const customerId = idOf(subscription.customer);
        // Undefined only if Stripe ever sends an event without `created`: the
        // write then behaves exactly as it did before the ordering guard
        // (applied, stamp untouched) rather than storing an Invalid Date.
        const eventAt = Number.isFinite(event.created)
          ? new Date(event.created * 1000)
          : undefined;
        await this.update(
          subscription.metadata?.clinicId,
          customerId,
          {
            status,
            stripeSubscriptionId: subscription.id,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            ...(eventAt ? { statusEventAt: eventAt } : {}),
          },
          eventAt,
        );
        return;
      }
      default:
        this.logger.log(`Stripe event ${event.type} ignored`);
    }
  }

  /** Resolves the tenant the way the WhatsApp inbound worker does — a
   *  deliberate cross-tenant read (basePrisma) to find the clinic, then the
   *  write inside that clinic's context. */
  private async update(
    clinicId: string | null | undefined,
    customerId: string | undefined,
    data: {
      status?: SubscriptionStatus;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      trialEndsAt?: Date | null;
      statusEventAt?: Date;
    },
    eventAt?: Date,
  ): Promise<void> {
    const target = clinicId
      ? await basePrisma.subscription.findUnique({ where: { clinicId } })
      : customerId
        ? await basePrisma.subscription.findUnique({ where: { stripeCustomerId: customerId } })
        : null;
    if (!target) {
      // Nothing to retry for: a redelivery would not make it match either.
      this.logger.warn(`Stripe event matched no clinic (customer ${customerId ?? 'unknown'})`);
      return;
    }
    // Stripe delivers events in parallel and does NOT guarantee order, so a
    // status write is refused when a strictly newer one already landed —
    // otherwise a late `updated(active)` after `deleted` un-cancels a clinic
    // for good, and no further event would ever correct it (S3-7). Strictly
    // older only: same-second events keep arrival order, as before.
    if (eventAt && target.statusEventAt && eventAt < target.statusEventAt) {
      this.logger.warn(`Stripe event older than the applied state: ignored for ${target.clinicId}`);
      return;
    }
    // The await must happen INSIDE the context: a PrismaPromise runs the
    // tenant extension when it is awaited, not when it is built.
    await runAsClinic(target.clinicId, async () => {
      await prisma.subscription.update({ where: { clinicId: target.clinicId }, data });
      // Billing changes are audited (docs/04-security.md §Audit). No actor:
      // Stripe made this change, no user did.
      if (data.status && data.status !== target.status) {
        await prisma.auditLog.create({
          data: {
            clinicId: target.clinicId,
            action: 'subscription.status_changed',
            entity: 'Subscription',
            entityId: target.id,
            diff: { from: target.status, to: data.status },
          },
        });
      }
    });
  }
}
