# 00 — Product Vision

## What ZenvyDental is

A **patient-communication layer for French dental clinics**: a premium SaaS dashboard plus an AI-powered WhatsApp assistant that handles reminders, follow-ups, lead capture, and patient conversations in French.

**It is NOT a practice management system (PMS).** Clinics keep Julie, Logosw, Veasy, Doctolib, etc. ZenvyDental sits on top and owns *communication only*. Patients and appointments in Zenvy are lightweight communication records — never clinical files. If a feature requires the clinic to abandon or duplicate their PMS, it is out of scope by definition.

## Who it's for

- **Buyer:** independent French dental clinics and small practices (1–5 practitioners). Expansion to other EU markets later.
- **Users:** dentist / clinic owner, front-desk staff.
- **End beneficiaries:** their patients, chatting on WhatsApp in French.

## Why they pay

- Front desk drowns in phone calls: reminders, confirmations, "are you open?", rebooking no-shows.
- Missed calls = lost new-patient leads.
- ZenvyDental answers instantly on WhatsApp 24/7, fills the gaps, escalates to humans, and gives the clinic full visibility in a polished dashboard.

## Pricing

| Plan | Price | v1 status |
|---|---|---|
| Standard | €20/mo | **Displayed only** (price anchor). Purchasable in v2 as downgrade/churn-save path. |
| Premium | €399/mo | The only purchasable plan in v1. 14-day free trial. |

Premium = dashboard + AI WhatsApp assistant + reminders + follow-ups + lead capture.

## Go-to-market reality (be honest with ourselves)

- No committed customers yet. First-customer path: founder's marketing contact in France demos the finished product.
- Consequence: **the demo experience is a strategic feature.** Landing page, demo page, and seeded demo clinic get first-class engineering effort.
- Payments: US LLC + real Stripe account at production time. Until then Stripe **test mode** everywhere.

## Product principles

1. Premium SaaS feel — Stripe/Linear/Notion bar: minimal, fast, fluid, superb typography. No gimmicks.
2. French-only product (UI, emails, AI conversations). English code, docs, and commit messages.
3. AI is a premium *capability* inside a trustworthy platform — not the product identity.
4. Self-service wherever possible; a human fallback wherever self-service can fail (esp. WhatsApp onboarding).
5. Every error a user can see must be friendly, referenced (correlation ID), and visible to the owner portal.

## v1 scope (the "Balanced cut" — approved 2026-07-18)

**In:** landing (hero/pricing/demo), auth + clinic creation + trial, dashboard (patients, appointments, WhatsApp inbox, conversation history, settings, subscription page), French AI assistant (reminders, follow-ups, FAQ, human handoff), owner portal mini (client list, error logs, manual onboarding queue, support chat), Stripe test-mode subscriptions.

**Out (v2+):** analytics/reports, notification center, lead scoring, routing rules, feature flags, revenue dashboard, audit-log viewer UI, self-serve WhatsApp onboarding (post-LLC), Standard plan checkout, i18n beyond French.

## Success criteria for v1

A French dentist watching the demo says **"I would pay for this"** — and nothing in the product contradicts that impression: no English strings, no dead buttons, no unstyled error states.
