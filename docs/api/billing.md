# API contract — Billing & feature gating (S3-3)

Stripe subscriptions for the single **Premium** plan (€399/mo, 14-day no-card trial started at clinic creation — `docs/api/auth.md`). **Test mode only** until the LLC + live Stripe account exist (decision D5). Conventions (envelope, statuses, tenancy) in `docs/03-api-conventions.md`; schemas in `packages/shared/src/billing.ts`.

The clinic's current state is read from `GET /me` → `subscription` (`status`, `trialEndsAt`); billing adds no read endpoint of its own.

## Money never touches us

No card data, no prices, no payment UI in our apps. Both endpoints return a Stripe-hosted URL and the browser goes there; state comes back through the webhook only. Neither endpoint takes a body — `success_url`/`cancel_url`/`return_url` are derived from `APP_WEB_URL` server-side, so a client cannot turn checkout into an open redirect.

## Endpoints

### POST /billing/checkout-session

`CLINIC_OWNER` only (staff never see billing — `docs/04-security.md`). Starts a Stripe Checkout Session in `subscription` mode for the Premium price.

- Body: none. **201** → `billingSessionResponseSchema`: `{ url }` — redirect the browser to it.
- Server-side: reuses the clinic's `stripeCustomerId` when it exists, otherwise Checkout creates the customer and the webhook stores it. `client_reference_id` and `subscription_data.metadata.clinicId` carry the tenant so every later event maps back without a lookup table.
- **Remaining trial is honoured:** if `trialEndsAt` is more than 48 h away it is passed as `subscription_data.trial_end`, so subscribing on day 3 does not forfeit the other 11 days. Under 48 h Stripe rejects `trial_end`, so billing simply starts now.
- Return URLs: `{APP_WEB_URL}/settings/subscription?checkout=success|cancelled`.
- **402** `SUBSCRIPTION_INACTIVE` is *not* raised here — billing routes are exempt from gating, otherwise a past-due clinic could never pay.
- **403** `FORBIDDEN` (not owner) · **409** `CONFLICT` (already `ACTIVE`) · **503** `BILLING_UNAVAILABLE` (Stripe keys not configured).

### POST /billing/portal-session

`CLINIC_OWNER` only. Stripe Billing Portal: update the card (the way out of `PAST_DUE`), see invoices, cancel.

- Body: none. **201** → `billingSessionResponseSchema`: `{ url }`. `return_url` = `{APP_WEB_URL}/settings/subscription`.
- **409** `BILLING_NO_CUSTOMER` (never checked out) · **403** `FORBIDDEN` · **503** `BILLING_UNAVAILABLE`.

### POST /webhooks/stripe

Public route (no session), Stripe-signed. The **only** writer of subscription state — our endpoints never optimistically flip a status.

- Signature verified with `stripe.webhooks.constructEvent` against the exact raw body before any payload use; mismatch, missing signature, or unconfigured secret → **403**, nothing parsed (`docs/04-security.md`).
- **Idempotent by event id**: the id is inserted into `StripeEvent` first; an insert that hits the existing row means the event was already handled and it is acknowledged without re-processing. Stripe retries and at-least-once delivery are therefore harmless.
- Always answers **200** once the signature checks out, including for event types we ignore — a 4xx/5xx would make Stripe retry an event we deliberately dropped.

| Event | Effect |
|---|---|
| `checkout.session.completed` | Stores `stripeCustomerId` + `stripeSubscriptionId` on the clinic's `Subscription`. |
| `customer.subscription.created` / `.updated` / `.deleted` | Maps Stripe's status onto ours and refreshes `trialEndsAt` from `trial_end`. |
| anything else | Ignored (200). |

Tenant resolution, in order: `metadata.clinicId` (set at checkout, signed by Stripe) → lookup by `stripeCustomerId`. An event that matches no clinic is logged `warn` and acknowledged — retrying will not make it match.

### Status mapping

| Stripe | ZenvyDental |
|---|---|
| `trialing` | `TRIALING` |
| `active` | `ACTIVE` |
| `past_due`, `unpaid` | `PAST_DUE` |
| `canceled`, `incomplete_expired`, `paused` | `CANCELED` |
| `incomplete` | ignored — the first payment is still in flight; local state stands |

## Feature gating

A global guard (`SubscriptionGuard`, after `RolesGuard`) runs on every authenticated route and answers **402** `SUBSCRIPTION_INACTIVE` (« Votre abonnement n'est plus actif… ») unless the clinic is usable:

```
usable = status === ACTIVE
       || (status === TRIALING && (trialEndsAt === null || trialEndsAt > now))
```

- **Trial expiry needs no job**: an expired trial is computed at request time from `trialEndsAt`, so a `TRIALING` row that ran out is already blocked.
- `PAST_DUE` blocks immediately. Stripe's smart retries take several days before flipping a subscription to `past_due`, so that delay *is* the grace period (decision D28).
- Deny by default, like `RolesGuard`: new modules are gated unless they opt out with `@NoSubscription()`. Exempt routes are only those a locked-out or clinic-less user must still reach: `GET /me`, `POST /clinics`, `POST /staff-invites/accept`, and `/billing/*`. `@Public()` routes (health, webhooks) and `SUPER_ADMIN` bypass entirely; a user with no clinic passes the guard and is stopped by tenancy instead.

## Storage note (S3-3 migration)

New `StripeEvent { id (Stripe event id, PK), type, createdAt }` — not tenant-scoped: it is the webhook's idempotency ledger, keyed by Stripe's own event id. `Subscription` is unchanged; its `stripeCustomerId` / `stripeSubscriptionId` columns are populated for the first time here.

## Environment

`STRIPE_SECRET_KEY` (test key, `sk_test_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…`, from `stripe listen` locally or the dashboard endpoint), `STRIPE_PRICE_ID` (the recurring €399/mo test price). Missing keys are not fatal at boot — only the billing endpoints return `503`, and the webhook rejects.
