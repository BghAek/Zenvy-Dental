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
- File uploads: out of scope v1 (no upload endpoints exist).

## Platform hardening

- `helmet` on the API; strict CORS (exact origins for the three frontends).
- Rate limiting: `@nestjs/throttler` backed by Redis — tight on `/auth/*` (brute force) and `/webhooks/*` (flood), generous on authenticated CRUD.
- Webhook signatures verified against the exact raw body before any payload use (Meta HMAC, Stripe signature) — the framework's JSON parser may run first, but nothing acts on a payload until its signature checks out. Reject on mismatch, log with correlation ID.
- Secrets: `.env` only, never committed; `.env.example` documents every variable. Meta/Stripe/OpenAI keys live only on the API. WhatsApp tokens stored encrypted at rest (AES-256-GCM, key in env).
- Dependencies: `pnpm audit` in CI; Renovate/Dependabot post-v1.

## Audit & accountability

- `AuditLog` written for: auth events, role changes, billing changes, clinic settings changes, human takeover of AI conversations, data deletions. Viewer UI is v2; the data starts accumulating in v1.

## Known accepted risks

See 12-risks-decisions: non-HDS hosting, GDPR posture pre-LLC. Do not silently expand patient-data collection beyond what communication requires — data minimization is both our GDPR posture and our positioning.
