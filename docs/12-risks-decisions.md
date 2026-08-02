# 12 — Decision Log & Risk Register

Append-only. Every founder decision that shapes the product lands here with its date. Agents: **never re-litigate a logged decision** — raise new evidence to the founder instead.

## Decisions (2026-07-18 — founding brainstorm)

| # | Decision | Rationale / notes |
|---|---|---|
| D1 | Positioning: **communication layer on top of existing PMS**, never a PMS replacement | Re-entering patient data kills adoption; coexistence = fastest "I'd pay" |
| D2 | Build polished product first; validation via French marketing contact after | Founder call; demo quality is therefore strategic |
| D3 | Founder capacity: full-time, no hard deadline | 2-week sprints, 4–6 parallel PRs max |
| D4 | **Keep Contabo + Neon** despite FR health-data (HDS) hosting rules | Founder accepts risk; see R1 |
| D5 | US LLC + real Stripe at production; **Stripe test mode until then** | Stripe unavailable in Algeria |
| D6 | **French-only UI + AI; English code/docs; no i18n lib in v1** | Market is France; i18n when a 2nd language is sold |
| D7 | Meta path: dev account + test number now; business verification & embedded signup post-LLC; **manual clinic onboarding in v1** | Verification needs a legal entity; manual queue was planned as fallback anyway |
| D8 | v1 scope = **Balanced cut** (full dentist experience, mini owner portal) | See 00-vision §v1 scope |
| D9 | **Premium-only purchasable in v1; Standard €20 displayed as anchor** | Avoids defining a weak €20 product now; keeps price anchoring |
| D10 | AI safety policy: strict medical boundaries, AI self-discloses, generous handoff, emergency escalation | Full policy in 05-ai-policy |
| D11 | **No n8n** — automation is NestJS + BullMQ | One less prod system; testable TS; unified tenancy/logging |
| D12 | **One monorepo**, 4 apps + `packages/shared` | Contract sharing; single-PR cross-cutting features |
| D13 | Landing = **Next.js static export**; dashboards stay Vite SPAs | SEO + 3D hero isolation; still React for Antigravity |
| D14 | Inbox real-time = 5s polling in v1 | SSE when demo proves polling insufficient |
| D15 | Workflow: every task on its own branch → 5-section PR → founder merges | See 10-agent-workflow |

## Decisions (2026-07-25 — S2-1 contracts)

| # | Decision | Rationale / notes |
|---|---|---|
| D16 | Inbox lifecycle: **takeover → release → close**, all three manual; a new inbound message reopens a closed thread as `AI` | Staff must be able to hand a resolved thread back to the assistant; closing archives without losing history. Contract in docs/api/conversations.md |
| D17 | An inbound WhatsApp message from an unknown number **creates a Patient** (`source=WHATSAPP_INBOUND`, name from the WhatsApp profile) and links the conversation | The AI gets patient context from message one and the clinic keeps a single list; junk contacts are soft-deleted like any other patient |

## Decisions (2026-07-26 — S2-3 AI engine)

| # | Decision | Rationale / notes |
|---|---|---|
| D18 | The AI eval set runs in **two halves**: deterministic cases (keyword classifier, output guardrails, prompt assembly) on every PR, and the same French corpus against the live model only when `OPENAI_API_KEY` is present | Honours « failing eval = failing CI » without billing every PR (R4) or turning an OpenAI outage into a red build on unrelated work. The live half is run locally before any PR touching the `ai` module (docs/13-local-dev.md §Evals) |
| D19 | On handoff, guardrail failure or engine error, the assistant sends **one fixed French sentence** and the thread flips to `HUMAN` — the model's own text is discarded | A reply that failed a safety check must not be partially salvaged, and one constant keeps what the patient sees predictable |

## Decisions (2026-08-01 — S2-7 security review)

| # | Decision | Rationale / notes |
|---|---|---|
| D20 | Rate limiting uses **`express-rate-limit` middleware**, not the `@nestjs/throttler` named in docs/04, and its store stays **in-memory** for v1 | Better Auth is mounted with `app.use()` and terminates the response itself, so a Nest `APP_GUARD` never runs on `/auth/*` — the brute-force path the limit exists for. One middleware covers auth, webhooks and everything else; the Nest guard would have needed a second mechanism beside it. The store follows the deployment: one API process (docs/01), so per-process counters *are* the global counters — Redis-backed storage lands with the second instance |
| D21 | The assistant answers at most **60 messages per clinic per hour**; past that the thread flips to `HUMAN` unanswered, and the **emergency keyword path is exempt** | Anyone who knows the clinic's WhatsApp number can make us call OpenAI, so the AI input path needs a ceiling before real numbers go live (R4). The cap sits between the free keyword classifier and the first paid call, so a flood cannot suppress an emergency escalation (R6). Superseded by the per-clinic token budget in S3-6 |

## Decisions (2026-08-02 — S3-1 template catalogue)

| # | Decision | Rationale / notes |
|---|---|---|
| D22 | Reminder templates are **plain text ending in « répondez à ce message »** — no « Confirmer » / « Annuler » quick-reply buttons | A written reply opens the 24h window and lands in the AI engine, which already reads « oui je confirme » and « je dois annuler » — so free text costs nothing to support, while buttons need `type: button` payload handling in the inbound worker, an engine branch and automatic status flips. Buttons are a later template version if confirmation rates ask for them |
| D23 | The catalogue lives **in code** (`apps/api/src/whatsapp/templates.ts`) and is pushed to Meta by `pnpm --filter @zenvy/api templates:register`, not typed into the Template Manager UI | Templates register per WhatsApp Business Account, so the console path would be repeated by hand for every clinic that onboards. One file also keeps the names `reminders.ts` writes and the bodies Meta approves from drifting apart |
| D24 | Exactly **three** templates in v1 — the two reminders and the J+1 follow-up. No generic « the clinic wants to reach you » re-engagement template | Staff messaging a patient after the 24h window is a real gap, but closing it needs inbox UI and an endpoint that S3 does not schedule; the inbox keeps refusing those sends (docs/api/conversations.md) until that work is planned |

## Risk register

| # | Risk | Severity | Mitigation / trigger to act |
|---|---|---|---|
| R1 | Non-HDS hosting of French patient-health data (Contabo/Neon); GDPR applies regardless of founder's location | High (legal/sales) | Data minimization by design; Prisma+Docker keep migration to OVH/Scaleway cheap. **Trigger: before first real clinic's patient data, or first prospect asking about hosting.** |
| R2 | Zero market validation until product is built | High (product) | Show seeded-demo screenshots/videos to dentists via marketing contact **during** S2–S3, not after S4 |
| R3 | Meta business verification & Tech-Provider review lead time (weeks) blocks real numbers | Medium | Start LLC + verification the moment a first client is near; v1 runs on test number + manual onboarding |
| R4 | WhatsApp per-conversation fees + OpenAI tokens erode €399 margin | Medium | Cost logging per clinic from S3; token budget guard; price revisit with real data |
| R5 | Founder is the review bottleneck for all PRs | Medium | Hard cap on open PRs; small tasks; detailed "How to test" sections make reviews fast |
| R6 | AI says something harmful/wrong to a patient | High (trust) | 05-ai-policy guardrails + evals in CI + takeover + urgent flags; incidents logged and reviewed |
| R7 | Stripe/LLC timing: a clinic wants to pay before the entity exists | Low now | LLC formation is ~days via Atlas; trigger at first serious prospect |
| R8 | EU AI Act / chatbot disclosure obligations evolve | Low | Assistant self-discloses (D10); revisit compliance at first paying customer |
| R9 | Solo-founder burnout / scope creep | Medium | Sprint plan is the scope contract; anything new goes to v2 backlog unless founder swaps it for something |

## How to add entries

Founder states a decision in any session → agent appends it here (same PR as the work it affects) with date and one-line rationale. Risks get re-severity-scored when circumstances change; resolved risks move to a `## Retired` section (create when first needed).
