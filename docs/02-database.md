# 02 — Database Design

Postgres (Neon) via Prisma. Schema lives in `apps/api/prisma/schema.prisma`. This doc defines entities and invariants; the schema file is the executable truth once it exists.

## Tenancy — the one rule that matters most

Every tenant-scoped table carries `clinicId`. Isolation is enforced **centrally**, not per-endpoint:

1. A NestJS middleware resolves the tenant from the authenticated session and puts it on request context.
2. A **Prisma client extension** automatically injects `where: { clinicId }` into every query on tenant-scoped models and stamps `clinicId` on creates.
3. RBAC guards ensure SUPER_ADMIN-only endpoints are the only ones that can query across tenants.

A tenant-scoped query without a clinic context must throw, never silently return cross-tenant data. Tests must cover this (see 07-coding-standards).

## Core entities

| Entity | Tenant-scoped | Purpose / key fields |
|---|---|---|
| `Clinic` | — (IS the tenant) | name, slug, phone, address, timezone, French locale settings, AI config (tone, services, prices, hours, out-of-office), onboarding status |
| `User` | ✔ (nullable for SUPER_ADMIN) | Better Auth user; role: `SUPER_ADMIN` \| `CLINIC_OWNER` \| `CLINIC_STAFF` |
| `Patient` | ✔ | firstName, lastName, phone (E.164, unique per clinic), tags, notes, source (`manual` \| `whatsapp_inbound`), optOut flag |
| `Appointment` | ✔ | patientId, startsAt, durationMin, type (free text), status (`scheduled/confirmed/cancelled/no_show/done`), reminder state |
| `Conversation` | ✔ | patientId (nullable until matched), waContactPhone (unique per clinic — one thread per contact, the webhook's upsert key), status (`ai` \| `human` \| `closed`), urgentFlag, lastMessageAt |
| `Message` | ✔ | conversationId, direction (`in/out`), author (`patient/ai/staff/system`), body, waMessageId, template used, delivery status |
| `WhatsAppAccount` | ✔ | phoneNumberId (globally unique — the tenant-routing key), wabaId, displayNumber, verified status, tokens (encrypted) |
| `Subscription` | ✔ | stripeCustomerId, stripeSubscriptionId, plan (`premium`), status (`trialing/active/past_due/canceled`), trialEndsAt, statusEventAt (Stripe's timestamp for the last status event applied — the webhook's out-of-order guard, S3-7) |
| `ScheduledMessage` | ✔ | patientId, appointmentId?, kind (`reminder_24h` \| `reminder_2h` \| `followup` \| `custom`), templateName, params, sendAt, status, BullMQ jobId |
| `StaffInvite` | ✔ | pending staff invitation (docs/api/auth.md): email, tokenHash (unique), expiresAt (7d), acceptedAt? — invited role fixed to `CLINIC_STAFF` in v1; added by the S1-2 migration |
| `OnboardingRequest` | ✔ | manual WhatsApp-onboarding queue item: status, notes, scheduledCallAt — one created per clinic at clinic-creation time (S4-1) |
| `SupportThread` / `SupportMessage` | ✔ | clinic ↔ owner support chat. `SupportMessage` has **no `clinicId`**: it is scoped through its thread, so it sits in the tenant extension's `NON_TENANT_MODELS` and every clinic-facing access must go through `supportThread` first (`docs/api/ops.md` §Tenancy note) |
| `ErrorLog` | ✔ (nullable) | correlationId, clinicId?, userId?, module, severity, message, stack, context JSON, createdAt |
| `StripeEvent` | — (not tenant-scoped) | Stripe webhook idempotency ledger: Stripe's event id as PK, type, createdAt — a redelivered event inserts nothing and is skipped (S3-3) |
| `AiUsage` | ✔ | one row per LLM call (S3-6): model, promptTokens, completionTokens, costMicroEur — the cost log, and the ledger the daily token budget guard sums |
| `AuditLog` | ✔ (nullable) | actor, action, entity, entityId, diff JSON — **written from day one, viewer UI is v2** |

## Conventions

- IDs: `cuid()` strings. Timestamps: `createdAt`/`updatedAt` on every table, all times stored UTC; clinic timezone applied at the edge.
- Phone numbers: E.164 everywhere (`+33612345678`); normalize on input, validate with Zod in `packages/shared`.
- Soft delete only where product-required (Patient — clinics expect undo); everything else hard-deletes.
- Money: integer cents, never floats.
- Enums live in `packages/shared` and mirror Prisma enums 1:1.
- Migrations: `prisma migrate` only — never `db push` beyond local experiments. Every migration is reviewed in its PR.
- Indexes minimum: every FK, `(clinicId, phone)` unique on Patient, `phoneNumberId` unique, `(clinicId, waContactPhone)` unique + `(clinicId, lastMessageAt)` on Conversation, `(status, sendAt)` on ScheduledMessage, `(clinicId, createdAt)` on ErrorLog and on AiUsage.

## Seeding

`prisma/seed.ts` is the sales demo dataset — this IS what a prospect sees, keep it excellent. One command (`prisma db seed`) builds:

- **« Cabinet Dentaire Lumière »** — the clinic for `apps/web`: 14 French patients (one opted out, one soft-deleted), 17 appointments spanning a fortnight either side of today, 8 WhatsApp threads, the `ScheduledMessage` rows those appointments imply in every status, and a week of `AiUsage`.
- **Five more clinics** — for `apps/owner`: one subscription per state (`ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`), an onboarding queue, an error log including rows with no clinic, three support threads.
- **Three logins** (S4-4, D37) — a SUPER_ADMIN plus the demo clinic's owner and staff, each with a Better Auth credential account, so the demo is walkable without creating a user by hand.

Two invariants the seed relies on, both load-bearing for a demo that is run months from now:

- **Idempotent.** Every seeded clinic is deleted and rebuilt; the cascade takes its tenant rows with it. Unattributed `ErrorLog` rows have no clinic to cascade from, so they carry a `demo-` correlation id and are deleted by it.
- **Relative to now.** No absolute dates. Appointments are offsets from today in Europe/Paris and are nudged off the weekend, so the clinic's Mon–Fri hours hold whichever day the seed runs.
