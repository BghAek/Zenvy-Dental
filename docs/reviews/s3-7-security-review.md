# S3-7 — Security review: billing + feature gating

**Reviewer:** Claude Code (Security Engineer persona, docs/08).
**Scope:** everything that decides whether a clinic is entitled to the product, and everything that writes that decision — `apps/api/src/billing/` (checkout, portal, Stripe webhook, `SubscriptionGuard`), the guard's wiring (`app.module.ts`, `auth/rbac.ts`, `tenancy/`), the gating opt-outs in `identity/`, and every path that spends money on a clinic's behalf (`ai/engine.ts`, `whatsapp/outbound.processor.ts`).
**Method:** first-hand read of every file on the path, checked against docs/04-security.md, docs/api/billing.md and Stripe's own delivery guarantees.
**Definition of done (docs/08):** threat addressed + a test proving it; docs updated.

## Verdict

The HTTP surface is sound: the signature check, the tenant resolution, the deny-by-default guard and the exemption list all hold up, and the endpoints hand no money-shaped decision to the client. The failures are one layer out — **gating was only ever a request-time guard**, so the two paths that spend money without a request never asked the question, and **the webhook trusted Stripe's delivery order**, which Stripe explicitly does not guarantee.

## Findings fixed in this PR

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | major | **Gating stops at HTTP: cancelled clinics keep costing us money.** `SubscriptionGuard` locks the dashboard, but nothing checks a subscription in the workers. A clinic that cancels — or whose card fails, or whose trial ran out — keeps its WhatsApp number live: every patient message still runs the AI engine (two OpenAI calls + a Graph send) and every queued reminder still fires a paid template. There is no ceiling and no expiry; it simply runs forever, and the only signal is the OpenAI bill (R4). | `clinicPaysForService(clinicId)` — the guard's own `isSubscriptionUsable` behind one lookup — called in `ai/engine.ts` and `whatsapp/outbound.processor.ts` (D33) |
| 2 | major | **Stripe events are applied in arrival order.** Stripe delivers in parallel and documents that order is not guaranteed. The two events fired on a cancellation (`customer.subscription.updated` + `.deleted`) can land the wrong way round, and a stale `active` applied after `canceled` un-cancels the clinic **permanently** — a deleted subscription generates no further event, so nothing ever corrects it. Full product access, indefinitely, for free. | `Subscription.statusEventAt` holds Stripe's own `created` for the last status write; a strictly older status event is logged and dropped (D34) |
| 3 | minor | **`TRIALING` with a null `trialEndsAt` was an unlimited trial.** The usability rule read `trialEndsAt === null || trialEndsAt > now`, so an unset column granted permanent access — the opposite of the deny-by-default posture the same guard is built on. Nothing legitimate produces that row today, which is exactly why it would go unnoticed the day something does (a seed script, a manual fix, a future plan without a trial). | `trialEndsAt !== null && trialEndsAt > now` |
| 4 | minor | **docs/api/billing.md described an idempotency scheme the code does not implement** — "the id is inserted into `StripeEvent` first". The code deliberately records it *after* processing (a crash between insert and work would silence Stripe's retry for good). A security control whose documentation and implementation disagree gets reviewed against the wrong model. | Doc corrected to match the code, with the reason; the trade-off is now D29's rationale in writing |

## Checked and found sound (no change)

- **Signature verification** — `constructEvent` against `req.rawBody`, before any payload use; a missing secret, a missing signature and the `CHANGE_ME` placeholder all fail closed, and Stripe's own replay window is enforced inside `constructEvent`. Unsigned and wrong-secret cases are tested.
- **No money decision reaches the client** — neither endpoint takes a body; price, customer, trial end and both return URLs are server-derived, so checkout cannot be turned into an open redirect and the trial cannot be extended by a caller. `trialEndsAt` is written only by clinic creation and by the webhook.
- **Subscription state has exactly one writer** — the webhook. `POST /billing/checkout-session` never optimistically flips a status, so a failed payment cannot leave us believing a clinic pays.
- **Tenant resolution** — `metadata.clinicId` → `stripeCustomerId`, both Stripe-signed, then the write inside `runAsClinic`; an event matching no clinic is acknowledged and dropped. The cross-tenant test proves a neighbouring clinic is untouched.
- **Guard order and exemptions** — `RolesGuard` then `SubscriptionGuard` (registration order is execution order); `@NoSubscription()` covers exactly `GET /me`, `POST /clinics`, `POST /staff-invites/accept` and `/billing/*`, so a locked-out owner can always pay, and everything else is gated by default. Billing is `CLINIC_OWNER`-only; staff get 403.
- **Session freshness** — role and `clinicId` come from a per-request Better Auth session lookup with no cookie cache, so a demotion or a clinic change takes effect on the next request rather than at cookie expiry.
- **Audit trail** — `subscription.status_changed` is written on every real transition with `from`/`to` and a null actor (Stripe, not a user).

## Accepted, not fixed

| Finding | Why it stands |
|---|---|
| Two *simultaneous* deliveries of the same event id both pass the `findUnique` check and apply | Check-then-act, but every effect is an idempotent assignment and `createMany({skipDuplicates})` settles the ledger; the only visible artefact is a duplicate `subscription.status_changed` audit row. A transaction or an advisory lock buys one duplicate log line |
| One subscription lookup per gated request, and now one per AI reply and per scheduled send | Indexed unique read on a table with one row per clinic. Cache it if it ever shows in latency — the existing `ponytail:` note on the guard covers both |
| `StripeEvent` grows without bound | Idempotency ledgers are supposed to; revisit with retention when the row count is worth an argument |
| A user with no clinic passes the guard and is stopped by the Prisma tenant extension with a 500, not a clean 4xx | Pre-existing S1-2 behaviour, no isolation consequence — the query genuinely cannot run. Worth a clean 403 whenever the identity module is next open |

## Raised for the frontend owner (not fixed here)

`apps/web` has no handling for **402 `SUBSCRIPTION_INACTIVE`** anywhere — no interceptor, no redirect. A clinic that lapses gets raw failures on every screen while the one page that could rescue it (`/settings/subscription`, already built in S3-4) still works. Not a security defect, but it is the other half of gating, and it belongs in the frontend backlog rather than in this API PR.

## How it is proven

Four new tests, each verified to fail with its fix reverted:

- `test/billing.spec.ts` — a stale `active` delivered after `deleted` leaves the clinic `CANCELED` while a genuinely newer event still lands (finding 2); a `TRIALING` row with no end date answers 402 (finding 3).
- `test/ai-engine.spec.ts` — a cancelled clinic gets no model call and no send even on an emergency message, and the thread flips to `HUMAN` (finding 1).
- `test/scheduled-sends.spec.ts` — a cancelled clinic's due reminder is never handed to Meta and the row ends `FAILED` (finding 1).

The three worker suites had to start seeding subscriptions to keep passing, which is itself the evidence that nothing in those paths had ever consulted one.

Full API suite: **230 passed, 1 skipped** (the live-model eval half).
