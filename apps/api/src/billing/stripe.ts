import Stripe from 'stripe';
import { ApiException } from '../common/http';
import { SubscriptionStatus } from '../generated/prisma/enums';

// Stripe seam for S3-3 (docs/api/billing.md). Test mode only until the LLC
// exists (decision D5) — nothing here depends on the mode, the key does.

// The .env.example placeholder must never act as a real key (same guard as the
// Meta webhook secrets) — treat CHANGE_ME as unset and fail closed.
export const stripeConfig = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value !== 'CHANGE_ME' ? value : undefined;
};

let client: Stripe | undefined;

/** Built on first use, not at import: the API boots (and the whole test suite
 *  runs) without Stripe keys — only the billing routes need them. */
export function stripe(): Stripe {
  const key = stripeConfig('STRIPE_SECRET_KEY');
  if (!key) {
    throw new ApiException(
      'BILLING_UNAVAILABLE',
      'Le paiement est momentanément indisponible. Réessayez plus tard.',
    );
  }
  client ??= new Stripe(key);
  return client;
}

// Stripe's status vocabulary → ours (docs/api/billing.md §Status mapping).
// `incomplete` is deliberately absent: the first payment is still in flight,
// so the local state (usually TRIALING) stands until it resolves.
const STATUS: Record<string, SubscriptionStatus> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  incomplete_expired: SubscriptionStatus.CANCELED,
  paused: SubscriptionStatus.CANCELED,
};

export const mapSubscriptionStatus = (status: string): SubscriptionStatus | undefined =>
  STATUS[status];

/** Stripe returns either the id or the expanded object; we only ever want the id. */
export const idOf = (ref: string | { id: string } | null | undefined): string | undefined =>
  typeof ref === 'string' ? ref : (ref?.id ?? undefined);
