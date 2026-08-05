# API contract — Auth, clinic & trial (S1-1)

Covers the S1-2 flow: **register → verify email → create clinic → 14-day trial starts (no card) → invite staff**. Conventions (envelope, statuses, tenancy) in `docs/03-api-conventions.md`; schemas in `packages/shared/src/auth.ts`.

## Better Auth routes (owned by the library)

Better Auth is mounted at `/api/v1/auth` (`apps/api/src/auth/auth.ts`). Request/response shapes are Better Auth's own — frontends call them via the Better Auth client or plain fetch; we do not wrap them in our envelope. Routes used in v1 (S1-4 screens):

| Route | Method | Purpose |
|---|---|---|
| `/api/v1/auth/sign-up/email` | POST | Register: `{ email, password, name }`. Role/clinicId are not accepted as input (`input: false`). |
| `/api/v1/auth/sign-in/email` | POST | Login, sets the session cookie |
| `/api/v1/auth/sign-out` | POST | Logout |
| `/api/v1/auth/get-session` | GET | Raw Better Auth session (frontends prefer `GET /me` below) |
| `/api/v1/auth/send-verification-email` | POST | Re-send the verification link |
| `/api/v1/auth/verify-email` | GET | Verification link target (`?token=`) |
| `/api/v1/auth/request-password-reset` | POST | `{ email, redirectTo }` — always 200 (no account enumeration) |
| `/api/v1/auth/reset-password` | POST | `{ token, newPassword }` |

Rate limiting is tight on all `/auth/*` routes (docs/04-security.md).

## Custom endpoints

All under `/api/v1`, session-cookie auth, standard error envelope.

### GET /me

Session identity + tenant context in one round trip. Any authenticated user.

- **200** → `meResponseSchema`: `{ user, clinic, subscription }` — `clinic`/`subscription` are `null` until the user creates or joins a clinic. `user.role`, `user.clinicId`, `subscription.status` + `trialEndsAt` are what the web shell needs for guards and the trial countdown.
- **401** `UNAUTHENTICATED`.

### POST /clinics

Creates the caller's clinic and starts the trial. Caller must be authenticated, **email-verified**, and not yet in a clinic.

- Body → `createClinicRequestSchema`: `{ name, phone?, address?, timezone? }`. `timezone` defaults to `Europe/Paris`; phone is normalized to E.164. `slug` is server-generated from `name` (deduplicated) — never client-supplied.
- Server-side effects, atomically: clinic created; caller becomes `CLINIC_OWNER` with `clinicId` set; `Subscription` row created with `status: TRIALING`, `plan: PREMIUM`, `trialEndsAt = now + 14 days` — no card required; a `PENDING` `OnboardingRequest` is enqueued for the founder (v1 connects every WhatsApp number by hand — `docs/api/ops.md`). AuditLog written.
- **201** → `createClinicResponseSchema`: `{ clinic, subscription }`.
- **403** `EMAIL_NOT_VERIFIED` · **409** `USER_ALREADY_IN_CLINIC` · **400** `VALIDATION_ERROR`.

### POST /staff-invites

`CLINIC_OWNER` only. Invites a staff member by email.

- Body → `createStaffInviteRequestSchema`: `{ email }`.
- Server: creates a `StaffInvite` row (token stored **hashed**, expires in 7 days) and emails a link `https://app.zenvydental.fr/register?invite=<token>`. Inviting an email that already has a pending invite replaces it (one active invite per email per clinic).
- **201** → `staffInviteSchema`: `{ id, email, expiresAt, createdAt }` (token never returned).
- **403** `FORBIDDEN` (not owner) · **409** `USER_ALREADY_IN_CLINIC` (email already belongs to a clinic member).

Listing/revoking invites and staff management UI are S3-4 scope; this contract covers only what S1-2 needs.

### POST /staff-invites/accept

Caller is authenticated, email-verified, and not yet in a clinic (they registered via the invite link, then call this).

- Body → `acceptStaffInviteRequestSchema`: `{ token }`.
- Server: validates token (unexpired, unused, hash match), attaches caller to the invite's clinic as `CLINIC_STAFF`, marks the invite accepted. AuditLog written.
- **200** → `meResponseSchema` (updated role/clinic — frontend replaces its `/me` cache).
- **400** `INVITE_INVALID` (bad, expired, or already-used token — deliberately one code) · **403** `EMAIL_NOT_VERIFIED` · **409** `USER_ALREADY_IN_CLINIC`.

## Storage note (S1-2 migration)

New `StaffInvite` model: `id, clinicId, email, tokenHash (unique), expiresAt, acceptedAt?, createdAt` — tenant-scoped, invited role fixed to `CLINIC_STAFF` in v1 (see docs/02-database.md).
