# S4-8 — Full-platform review (code + security + over-engineering)

Date: 2026-08-10 · Scope: entire platform at `main` (7c6ddce) · Method: /security-review (full API surface + infra), /code-review at high effort (8 independent review angles, every finding verified against the code), /ponytail-audit (whole tree).

Verdict in one line: **the API core is sound — no security findings — but the owner portal cannot be used in production (no sign-in), the web app still runs settings/staff on a localStorage mock layer, and a Stripe webhook race survived S3-7.** Those three, plus a missing support-thread producer, are the launch blockers.

## 1. Security review — no findings

No HIGH or MEDIUM vulnerability at or above the confidence bar. Verified sound, end to end:

- **Auth/session**: Better Auth behind the Nest pipeline; global deny-by-default `RolesGuard`; role/clinicId are `input:false` fields (no self-assignment); origin checks pinned on.
- **Tenant isolation**: fail-closed Prisma extension — unscoped query on a tenant model throws; client-supplied tenant values stamped-last/ANDed; cross-tenant relocation blocked.
- **Webhooks**: Stripe signature via `constructEvent` on exact raw body; WhatsApp GET handshake + POST HMAC both `timingSafeEqual`, `CHANGE_ME` placeholders fail closed.
- **AI engine**: text-only verdict, no tools, no DB-writing actions a patient message could trigger.
- **IDOR/injection/infra**: scoped `findFirst` on every `:id` route; no raw SQL beyond `SELECT 1`; nginx `trust proxy: 1` matches the single hop; prod compose publishes no API port.

## 2. Fixed in this PR

| # | Finding | Fix |
|---|---------|-----|
| 1 | **Stripe event-ordering guard was read-then-write** — concurrent deliveries could both pass it and a stale `updated(active)` after `deleted` could permanently re-activate a clinic (the exact S3-7 bug the guard targets) | Stamp comparison moved into the `updateMany` WHERE; the stale write now matches zero rows ([stripe-webhook.controller.ts](../../apps/api/src/billing/stripe-webhook.controller.ts)) |
| 2 | **Stripe checkout/portal failures silently replaced by a mock URL** — a dentist trying to pay never saw the real error | Mock fallback deleted; the existing French error messages in SubscriptionSettings now surface |
| 3 | **Patient tags input ate separators** — controlled parse→join round-trip deleted the just-typed comma; multi-tag entry impossible | Input made uncontrolled (`defaultValue`), parse still on change |
| 4 | **Seed left live `PENDING` reminders for made-up mobiles** — the outbound sweep really sends them on any seeded box with a real Meta token | All seed patient mobiles moved to the ARCEP fictional range 06 39 98 XX XX (never allocated to real subscribers) |
| 5 | **Owner portal showed raw English enums** (PENDING, TRIALING, OPEN…) violating the all-French rule | French label maps added beside their schemas in `packages/shared/src/enums.ts`, used by all owner badges; the two page-local maps folded in |
| 6 | **Owner pages deep-imported `@zenvy/shared/src/ops`** bypassing the package's public surface | All four pages import from `@zenvy/shared` |
| 7 | **Owner dev server had no `/api` proxy** — every page errored following docs/13 | Same `server`/`preview` proxy as apps/web |
| 8 | **Owner support chat never refreshed** — clinic replies needed a full reload | 5s `refetchInterval` on list + detail, matching the web inbox cadence |
| 9 | **Owner lists silently truncated at 20 rows** (nextCursor ignored) | First page bumped to the API max (100) with a `ponytail:` marker; load-more when a list actually crosses 100 |
| 10 | **One API request per keystroke** in owner search/filter inputs | Shared 300ms `useDebouncedValue` hook feeding the query keys |
| 11 | **Redundant subscription query per send/per AI message** on the two hot worker paths | `subscription` joined into the existing clinic include; `isSubscriptionUsable` called directly |
| 12 | **`/health` opened two fresh Redis connections per probe**, now hit every 30s by the compose healthcheck and publicly reachable | Report memoized 10s — probe cost bounded regardless of hit rate, connection lifecycle untouched |
| 13 | **backup.sh heartbeat parse was fragile** (quotes/`export `/CRLF broke the very line that alerts on silent backup failure) | Tolerant sed-based parse |
| 14 | **Dead weight**: `/sample` design-demo route in the production web bundle, `ConfirmDialog` with zero consumers, unused `landingStrings` module, 8 stale `pr-body*.txt` at repo root, `framer-motion` declared in 3 packages with (post-cleanup) zero imports, `@types/three` in the wrong bucket, hand-rolled datetime-local formatter | All deleted/corrected; `pr*body*.txt` gitignored |

Verification: `pnpm -r build` green, API suite 255 passed / 1 skipped, shared selftest green, eslint clean.

## 3. Fix before launch — needs its own task (proposed for Sprint 5)

These are real feature work, too big to smuggle into a review PR. **All four block a real clinic + founder using the product.**

1. **Owner portal sign-in + 401 handling.** apps/owner has no login page, no session query, no 401 route; Better Auth cookies are host-only, so a session on app.zenvydental.fr never reaches ops.zenvydental.fr. Every prod query 401s into the generic error state. Reuse the web app's RequireAuth + login pattern (AUTH_TRUSTED_ORIGINS and docs/14 already anticipate exactly this flow). Three independent review angles converged on this as the single biggest gap.
2. **Replace the web localStorage mock layer with real API.** Staff list/invites/clinic settings in `apps/web/src/lib/queries/{settings,session,onboarding}.ts` write only localStorage; `session.ts` merges the stale stored clinic **over** the real `/me` response — on a shared browser that shows dentist B dentist A's clinic data, and it permanently masks server-side changes. Blocked on missing API surface: `PATCH /clinics`, `GET /staff`, `GET /staff-invites` (+ contracts in `packages/shared` and `docs/api/`). The Stripe part of the mock layer is already removed (fix #2 above).
3. **Web-side support UI (D36 gap).** No page in apps/web calls `POST /support-threads` — the founder support inbox has no producer, and the SUBSCRIPTION_INACTIVE clinic that D36's `@NoSubscription` exemption exists for has no UI path to reach support.
4. **Real WhatsApp number for the landing demo CTA.** `demo-cta.tsx` links to `wa.me/33612345678` — a plausible, allocatable French mobile; a clicked demo request goes to a stranger. **Founder input needed** (open since the S4-7 audit): supply the business number, or point the CTA at the form/email path until it exists.

## 4. v2 backlog / accepted as-is

- **Cursor-based load-more in owner lists** — when any list crosses 100 rows (marker comments in place).
- **nginx vhost include-file refactor** — the /api proxy stanza is copy-pasted across 3 vhosts; consolidate the first time a change must touch all of them.
- **ErrorLog write awaited on the 5xx path** — during a full DB outage each error response also waits out the Prisma connect timeout. Documented trade-off (the correlation code must exist before the user sees it); add a timeout race only if a real incident shows it biting.
- **Ops mutations pay 2–3 sequential round-trips** where one nested `update` would do — founder-only traffic, pure latency, not worth the churn now.
- **Seed re-implements the reminder plan and French date formatters** — drift risk documented; import `PLAN`/the formatters if either changes again.
- **Owner loading/error/empty triad duplicated across 3 pages; shadcn textarea class string copy-pasted in 3 files; landing reduced-motion variants hand-expanded** — cosmetic duplication, routed to the frontend/design owner per the standing disposition (design-system calls go to Antigravity).

## 5. Ponytail audit

The API side is lean: every deliberate shortcut carries a `ponytail:` marker with its ceiling and upgrade path, and no speculative abstraction survived the scan. All concrete cuts found (dead route, dead component, dead strings module, unused deps, root cruft) are applied in this PR — net ≈ −500 lines and one dependency removed from three packages.
