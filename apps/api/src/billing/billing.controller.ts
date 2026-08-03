import { Controller, Post, Req } from '@nestjs/common';
import type { BillingSessionResponse } from '@zenvy/shared';
import type { Request } from 'express';
import { Roles } from '../auth/rbac';
import { ApiException } from '../common/http';
import { Role, SubscriptionStatus } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';
import { NoSubscription } from './subscription.guard';
import { stripe, stripeConfig } from './stripe';

// S3-3 billing endpoints (docs/api/billing.md). Both return a Stripe-hosted
// URL: no card data, no prices, no payment UI on our side. Neither takes a
// body — the return URLs are server-derived so a client cannot turn checkout
// into an open redirect. Subscription state is written by the webhook only.

// Stripe refuses a trial_end under 48h out; below that, billing just starts now.
const MIN_TRIAL_SECONDS = 48 * 60 * 60;

const webAppUrl = (): string => process.env.APP_WEB_URL ?? 'https://app.zenvydental.fr';
const subscriptionPage = (): string => `${webAppUrl()}/settings/subscription`;

// Billing routes must stay reachable when gating blocks everything else —
// otherwise a past-due clinic could never pay its way back in.
@NoSubscription()
@Roles(Role.CLINIC_OWNER)
@Controller('billing')
export class BillingController {
  @Post('checkout-session')
  async checkout(@Req() req: Request): Promise<BillingSessionResponse> {
    const clinicId = req.sessionUser!.clinicId!;
    const price = stripeConfig('STRIPE_PRICE_ID');
    if (!price) {
      throw new ApiException(
        'BILLING_UNAVAILABLE',
        'Le paiement est momentanément indisponible. Réessayez plus tard.',
      );
    }

    const subscription = await prisma.subscription.findUnique({ where: { clinicId } });
    if (subscription?.status === SubscriptionStatus.ACTIVE) {
      throw new ApiException('CONFLICT', 'Votre abonnement est déjà actif.');
    }

    // Remaining trial days are carried over: subscribing on day 3 of the trial
    // must not forfeit the other 11 (docs/api/billing.md).
    const trialEnd = subscription?.trialEndsAt
      ? Math.floor(subscription.trialEndsAt.getTime() / 1000)
      : undefined;
    const keepsTrial = trialEnd && trialEnd - Math.floor(Date.now() / 1000) > MIN_TRIAL_SECONDS;

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      locale: 'fr',
      // Both carry the tenant back on every later event — no lookup table.
      client_reference_id: clinicId,
      subscription_data: {
        metadata: { clinicId },
        ...(keepsTrial ? { trial_end: trialEnd } : {}),
      },
      ...(subscription?.stripeCustomerId
        ? { customer: subscription.stripeCustomerId }
        : { customer_email: req.sessionUser!.email }),
      success_url: `${subscriptionPage()}?checkout=success`,
      cancel_url: `${subscriptionPage()}?checkout=cancelled`,
    });

    return { url: session.url! };
  }

  @Post('portal-session')
  async portal(@Req() req: Request): Promise<BillingSessionResponse> {
    const clinicId = req.sessionUser!.clinicId!;
    const subscription = await prisma.subscription.findUnique({ where: { clinicId } });
    // The way out of PAST_DUE (update the card) and the way to cancel — both
    // need a Stripe customer, which only a completed checkout creates.
    if (!subscription?.stripeCustomerId) {
      throw new ApiException('BILLING_NO_CUSTOMER', 'Aucun abonnement à gérer pour le moment.');
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      locale: 'fr',
      return_url: subscriptionPage(),
    });

    return { url: session.url };
  }
}
