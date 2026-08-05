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
| D21 | The assistant answers at most **60 messages per clinic per hour**; past that the thread flips to `HUMAN` unanswered, and the **emergency keyword path is exempt** | Anyone who knows the clinic's WhatsApp number can make us call OpenAI, so the AI input path needs a ceiling before real numbers go live (R4). The cap sits between the free keyword classifier and the first paid call, so a flood cannot suppress an emergency escalation (R6). Superseded by the per-clinic daily token budget (D31) in S3-6 |

## Decisions (2026-08-02 — S3-1 template catalogue)

| # | Decision | Rationale / notes |
|---|---|---|
| D22 | Reminder templates are **plain text ending in « répondez à ce message »** — no « Confirmer » / « Annuler » quick-reply buttons | A written reply opens the 24h window and lands in the AI engine, which already reads « oui je confirme » and « je dois annuler » — so free text costs nothing to support, while buttons need `type: button` payload handling in the inbound worker, an engine branch and automatic status flips. Buttons are a later template version if confirmation rates ask for them |
| D23 | The catalogue lives **in code** (`apps/api/src/whatsapp/templates.ts`) and is pushed to Meta by `pnpm --filter @zenvy/api templates:register`, not typed into the Template Manager UI | Templates register per WhatsApp Business Account, so the console path would be repeated by hand for every clinic that onboards. One file also keeps the names `reminders.ts` writes and the bodies Meta approves from drifting apart |
| D24 | Exactly **three** templates in v1 — the two reminders and the J+1 follow-up. No generic « the clinic wants to reach you » re-engagement template | Staff messaging a patient after the 24h window is a real gap, but closing it needs inbox UI and an endpoint that S3 does not schedule; the inbox keeps refusing those sends (docs/api/conversations.md) until that work is planned |

## Decisions (2026-08-03 — S3-2 scheduled senders)

| # | Decision | Rationale / notes |
|---|---|---|
| D25 | The schedule lives in **Postgres**, not in Redis: a per-minute sweep enqueues `ScheduledMessage` rows that have come due, instead of a BullMQ delayed job created weeks ahead when the row is written | S2-4 already re-times and cancels rows on every appointment write, so delayed jobs would need the mirror bookkeeping (remove, re-add, ignore-stale) and would make booking an appointment depend on Redis being up. Sweeping keeps one source of truth, survives a flushed Redis, and costs one query a minute. Redis still carries the send itself and its retries (3×, exponential from 1 min), which is what BullMQ is actually good at. The job id **is** the row id, so a double sweep cannot double-send |
| D26 | A patient who sends « STOP » gets **no confirmation message**, and the match is word-bounded (`\bstop\b`, case-insensitive) rather than whole-message | « Opt-out blocks all outbound » (docs/05) is absolute, and a « c'est noté » would be exactly the message they just refused — the reply also costs a template or a window. Word-bounded honours the policy's « STOP in any message » while sparing « la douleur a stoppé »; an unwanted opt-out is one toggle in the patient sheet, an ignored STOP is a complaint and a Meta quality-rating hit |
| D27 | Template variables are rendered **at send time** from live data, so `ScheduledMessage.params` stays null in v1 | The row is written days early: first name, clinic name and appointment time can all change before it fires, and re-rendering makes the reminder right rather than faithful to a stale snapshot. The column stays for a future kind whose values are not derivable from the appointment |

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

| D28 | `PAST_DUE` **blocks the product immediately** — no extra grace window of ours | Stripe's smart retries already take several days of failed charges before flipping a subscription to `past_due`, so that delay *is* the grace period; a second one on our side would just be an unmetered free month. The way back is always open: billing routes are exempt from gating, so the owner can update the card from the portal while everything else answers 402 |
| D29 | Subscription state is written by the **Stripe webhook only** — our endpoints never optimistically set a status, and the idempotency ledger records an event id **after** it is processed | One writer means Stripe is always the source of truth and a failed checkout cannot leave us believing a clinic pays. Recording after the work keeps Stripe's retry meaningful: marking the event done first would let a mid-processing crash silence the redelivery for good, and re-applying an event is harmless because every effect is an idempotent state assignment |
| D31 | The AI cost ceiling is a **per-clinic budget of 300 000 tokens over a rolling 24h** (`AI_DAILY_TOKEN_BUDGET`), summed from an `AiUsage` row written per LLM call — it replaces the S2-7 hourly reply cap (D21) | A reply count is a proxy for what we actually pay; tokens are the bill itself, and the same rows are the per-clinic cost log R4 asks for. 300 000 tokens is ~200 patient messages a day (≈0,05 € on `gpt-4o-mini`), five to ten times a small clinic's real volume, so it only bites on a flood. Rolling 24h rather than a calendar day: no timezone question, and no midnight reset to wait out. The guard keeps D21's placement — after the free emergency keyword pass, before the first paid call — so a flood still cannot silence an escalation. Exhaustion is a `warn` ErrorLog row, which the owner-portal error viewer already surfaces per clinic; no new alerting surface |
| D32 | The **live** eval half is scored as a **pass rate ≥95%** over the corpus, not case by case; the deterministic half stays all-or-nothing | S3-6 added colloquial and misspelled French, code-switching and metaphorical emergencies — cases where one borderline model judgement is noise, not a regression. A per-case assertion would make the suite a coin flip and train us to ignore it; a rate catches the thing that actually matters, a chunk of the corpus drifting at once. Deterministic cases have no such excuse: a regex either holds or it does not |
| D30 | The official **`stripe` Node SDK** is a justified dependency, unlike the hand-rolled Meta client | Webhook signature verification is security-critical crypto with a replay window (`constructEvent`), and Checkout/Portal parameters are deeply nested form encoding. The Meta client stayed hand-written because it posts flat JSON with a bearer token — a genuinely different amount of work |
| D33 | Feature gating extends to the **background workers**, and there the block is total — a clinic without a usable subscription gets no AI reply (**emergency path included**) and no scheduled template send (S3-7) | A guard only covers HTTP, so gating stopped at the dashboard: a cancelled clinic whose patients kept texting still cost us OpenAI tokens and Meta template fees, indefinitely and invisibly (R4). The emergency exemption that the token budget keeps (R6) does not carry over: a flood is an attack on a clinic we still serve, an ended subscription is the end of the service — writing to that cabinet's patients in its name once it is no longer a client is the worse liability. Every inbound message is still stored, and the thread flips to `HUMAN`; the scheduled row is marked `FAILED` with an `ErrorLog` line rather than left `PENDING`, which would re-sweep every minute and crowd real sends out of the batch |
| D34 | Stripe **status events are applied in the event's own timestamp order** (`Subscription.statusEventAt`), not in arrival order; a strictly older one is dropped | Stripe delivers in parallel and explicitly does not guarantee ordering. The pair fired on a cancellation (`updated` + `deleted`) can land the wrong way round, and a stale `active` applied after `canceled` re-opens the clinic **for good** — a deleted subscription generates no further event to correct it. Strictly-older only, so same-second events keep today's arrival-order behaviour; `checkout.session.completed` carries ids rather than status and stays unordered |

## How to add entries

Founder states a decision in any session → agent appends it here (same PR as the work it affects) with date and one-line rationale. Risks get re-severity-scored when circumstances change; resolved risks move to a `## Retired` section (create when first needed).
