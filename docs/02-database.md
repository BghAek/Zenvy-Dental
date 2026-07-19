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
| `Conversation` | ✔ | patientId (nullable until matched), waContactPhone, status (`ai` \| `human` \| `closed`), urgentFlag, lastMessageAt |
| `Message` | ✔ | conversationId, direction (`in/out`), author (`patient/ai/staff/system`), body, waMessageId, template used, delivery status |
| `WhatsAppAccount` | ✔ | phoneNumberId (globally unique — the tenant-routing key), wabaId, displayNumber, verified status, tokens (encrypted) |
| `Subscription` | ✔ | stripeCustomerId, stripeSubscriptionId, plan (`premium`), status (`trialing/active/past_due/canceled`), trialEndsAt |
| `ScheduledMessage` | ✔ | patientId, appointmentId?, kind (`reminder_24h` \| `reminder_2h` \| `followup` \| `custom`), templateName, params, sendAt, status, BullMQ jobId |
| `StaffInvite` | ✔ | pending staff invitation (docs/api/auth.md): email, tokenHash (unique), expiresAt (7d), acceptedAt? — invited role fixed to `CLINIC_STAFF` in v1; added by the S1-2 migration |
| `OnboardingRequest` | ✔ | manual WhatsApp-onboarding queue item: status, notes, scheduledCallAt |
| `SupportThread` / `SupportMessage` | ✔ | clinic ↔ owner support chat |
| `ErrorLog` | ✔ (nullable) | correlationId, clinicId?, userId?, module, severity, message, stack, context JSON, createdAt |
| `AuditLog` | ✔ (nullable) | actor, action, entity, entityId, diff JSON — **written from day one, viewer UI is v2** |

## Conventions

- IDs: `cuid()` strings. Timestamps: `createdAt`/`updatedAt` on every table, all times stored UTC; clinic timezone applied at the edge.
- Phone numbers: E.164 everywhere (`+33612345678`); normalize on input, validate with Zod in `packages/shared`.
- Soft delete only where product-required (Patient — clinics expect undo); everything else hard-deletes.
- Money: integer cents, never floats.
- Enums live in `packages/shared` and mirror Prisma enums 1:1.
- Migrations: `prisma migrate` only — never `db push` beyond local experiments. Every migration is reviewed in its PR.
- Indexes minimum: every FK, `(clinicId, phone)` unique on Patient, `phoneNumberId` unique, `(clinicId, lastMessageAt)` on Conversation, `(status, sendAt)` on ScheduledMessage, `(clinicId, createdAt)` on ErrorLog.

## Seeding

`prisma/seed.ts` creates: 1 SUPER_ADMIN, 1 demo clinic ("Cabinet Dentaire Lumière") with French patients, appointments, and realistic conversation history — this IS the sales demo dataset, keep it excellent.
