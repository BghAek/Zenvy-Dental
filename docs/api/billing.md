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
- **Idempotent by event id**: an event whose id is already in `StripeEvent` is acknowledged without re-processing. The id is recorded *after* the work, not before — every effect is an idempotent state assignment, so replaying a retry is harmless, while marking it done first would let a mid-processing crash silence Stripe's retry for good.
- **Ordered by the event's own timestamp** (S3-7): Stripe delivers in parallel and does *not* guarantee order, so a status-bearing event strictly older than the last one applied (`Subscription.statusEventAt`) is logged and dropped. Without it a late `customer.subscription.updated (active)` arriving after `.deleted` would un-cancel a clinic permanently — no further event would ever come to correct it. `checkout.session.completed` carries ids, not status, and is not ordered.
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
       || (status === TRIALING && trialEndsAt !== null && trialEndsAt > now)
```

- **Trial expiry needs no job**: an expired trial is computed at request time from `trialEndsAt`, so a `TRIALING` row that ran out is already blocked.
- A `TRIALING` row with **no** `trialEndsAt` is **not** usable (S3-7): an unset column must never read as an unlimited trial. Every legitimate `TRIALING` row has an end date — clinic creation sets 14 days, and Stripe always sends `trial_end` with a `trialing` status.
- `PAST_DUE` blocks immediately. Stripe's smart retries take several days before flipping a subscription to `past_due`, so that delay *is* the grace period (decision D28).
- Deny by default, like `RolesGuard`: new modules are gated unless they opt out with `@NoSubscription()`. Exempt routes are only those a locked-out or clinic-less user must still reach: `GET /me`, `POST /clinics`, `POST /staff-invites/accept`, and `/billing/*`. `@Public()` routes (health, webhooks) and `SUPER_ADMIN` bypass entirely; a user with no clinic passes the guard and is stopped by tenancy instead.

### Gating the background workers (S3-7, D33)

A guard only covers HTTP. The two paths that spend money without a request check the same rule themselves through `clinicPaysForService(clinicId)`:

| Path | Behaviour when the subscription is not usable |
|---|---|
| AI engine (`ai/engine.ts`) — OpenAI + a WhatsApp send | No model call and no reply, **including the emergency path**: the service is over, so we do not write to patients on that cabinet's behalf. The inbound message is stored as always and the thread flips to `HUMAN`. |
| Scheduled sender (`whatsapp/outbound.processor.ts`) — a paid template send | The row is marked `FAILED` with an `ErrorLog` entry. Not left `PENDING`: it would be re-swept every minute and crowd real sends out of the batch. |

This is deliberately stricter than the AI token budget, which exempts emergencies (R6): a flood is an attack on a client we still serve, an ended subscription is the end of the service itself.

## Storage note (S3-3 migration)

New `StripeEvent { id (Stripe event id, PK), type, createdAt }` — not tenant-scoped: it is the webhook's idempotency ledger, keyed by Stripe's own event id. `Subscription` is unchanged; its `stripeCustomerId` / `stripeSubscriptionId` columns are populated for the first time here.

S3-7 adds `Subscription.statusEventAt` (nullable) — Stripe's own `created` timestamp for the last status-bearing event applied, the value the ordering guard above compares against. Null on every row that has never seen a subscription event.

## Environment

`STRIPE_SECRET_KEY` (test key, `sk_test_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…`, from `stripe listen` locally or the dashboard endpoint), `STRIPE_PRICE_ID` (the recurring €399/mo test price). Missing keys are not fatal at boot — only the billing endpoints return `503`, and the webhook rejects.
