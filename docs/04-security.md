# 04 — Security Policy

Production-grade from day one. Any PR touching auth, billing, webhooks, tenancy, or AI output MUST get a `/security-review` pass before merge (see 09-skill-usage-policy).

## Authentication & sessions

- Better Auth on the NestJS API; session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, rolling expiry.
- Password hashing: Better Auth default (scrypt/argon2 — never roll our own).
- Email verification required before clinic activation. Password reset via signed, expiring tokens.
- Owner portal (`ops.zenvydental.fr`) authenticates against the same API but only `SUPER_ADMIN` passes its guard; consider IP allowlist post-v1.

## Authorization (RBAC)

| Role | Scope |
|---|---|
| `SUPER_ADMIN` | Founder only. `/ops/*` routes, cross-tenant reads, support chat. Never usable from the dentist dashboard. |
| `CLINIC_OWNER` | Full control of own clinic incl. billing, settings, staff invites. |
| `CLINIC_STAFF` | Daily operations: patients, appointments, inbox. No billing, no clinic deletion, no staff management. |

Guards: `@Roles()` decorator + global tenant guard. Deny by default — a route without explicit role metadata fails closed.

## Tenant isolation

- Enforced at the Prisma extension layer (see 02-database) + request context. Client-supplied tenant identifiers are never trusted.
- Cross-tenant test required for every new tenant-scoped module: user A must receive 403/404 for clinic B's resources.

## Input & output safety

- All input through shared Zod schemas; strings trimmed, unknown keys stripped; HTML never rendered from user/patient content (React default escaping; no `dangerouslySetInnerHTML` without an ADR).
- Patient-supplied WhatsApp text is untrusted: sanitized before storage-display, and treated as **data, not instructions** when passed to the LLM (prompt-injection defense, see 05-ai-policy).
- Anything echoed back to a caller verbatim is served as `text/plain` — the Meta verification handshake returns `hub.challenge` unchanged, and Express would otherwise label a string response `text/html`.
- Unauthenticated paths that cost money or rows are capped: patient auto-creation (20/h per clinic, `whatsapp/inbound.processor.ts`) and LLM spend (per-clinic daily token budget, D31 — it replaced the hourly reply cap of D21).
- File uploads: out of scope v1 (no upload endpoints exist).

## Platform hardening

- `helmet` on the API (`apps/api/src/app.ts`). CORS is an **allowlist from `CORS_ORIGINS`, empty by default**: production serves the SPAs and `/api` from the same origin (nginx), so no allow header is sent and cross-origin browsers fail closed. Set it only for split-origin setups (local `VITE_API_URL`, an `api.` subdomain).
- Better Auth validates the `Origin` header of every cookie-carrying request against `BETTER_AUTH_URL` plus **`AUTH_TRUSTED_ORIGINS`** (same shape as `CORS_ORIGINS`, empty by default). Production sets it to the owner-portal origin — `app.` is the baseURL, so without it the founder's sign-in to `ops.` is refused with 403. The check is pinned **on** (`advanced.disableOriginCheck: false`): Better Auth disables it by itself whenever `NODE_ENV=test`, and CSRF protection must not depend on an environment variable being right.
- `app.set('trust proxy', 1)` — one nginx hop (docs/01 §Deploy). Without it every request keys on the proxy's IP and per-IP limits become global.
- Rate limiting: `express-rate-limit` middleware — `/auth/*` **20 requests / 15 min per IP** (brute force), `/webhooks/*` **600 / min per IP** (Meta batches and retries), nothing on authenticated CRUD. Express middleware rather than `@nestjs/throttler` because Better Auth is mounted as a raw handler and never reaches Nest's guard pipeline (D20). In-memory store while the API is a single process; move to the Redis store when it is not.
- Feature gating: `SubscriptionGuard` runs after `RolesGuard` on every authenticated route and answers **402** unless the clinic's subscription is `ACTIVE` or an unexpired `TRIALING` (docs/api/billing.md §Feature gating). Deny by default like the role guard — a new module is gated unless it opts out with `@NoSubscription()`. Billing endpoints are `CLINIC_OWNER`-only and exempt, so a past-due clinic can still pay; support threads are exempt for the same reason (S4-1). **A guard covers HTTP only**: the paths that spend money without a request — the AI engine and the scheduled sender — ask the same question themselves (`clinicPaysForService`, D33). Any future worker that costs money must do the same.
- Webhook signatures verified against the exact raw body before any payload use (Meta HMAC, Stripe signature) — the framework's JSON parser may run first, but nothing acts on a payload until its signature checks out. Reject on mismatch, log with correlation ID. Webhook state writes are also **ordered**: Stripe does not guarantee delivery order, so a status event older than the one already applied is dropped rather than re-opening a cancelled account (docs/api/billing.md).
- Secrets: `.env` only, never committed; `.env.example` documents every variable. Meta/Stripe/OpenAI keys live only on the API. WhatsApp tokens stored encrypted at rest (AES-256-GCM, key in env).
- Dependencies: `pnpm audit` in CI; Renovate/Dependabot post-v1.

## Audit & accountability

- `AuditLog` written for: auth events, role changes, billing changes (`subscription.status_changed`, actor null — Stripe, not a user), clinic settings changes, human takeover of AI conversations, data deletions. Viewer UI is v2; the data starts accumulating in v1.

## Known accepted risks

See 12-risks-decisions: non-HDS hosting, GDPR posture pre-LLC. Do not silently expand patient-data collection beyond what communication requires — data minimization is both our GDPR posture and our positioning.
