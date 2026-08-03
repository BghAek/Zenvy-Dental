# 05 — AI Assistant Policy & Engine Design

The AI chats with real patients, in French, in the clinic's name. This policy was approved by the founder (2026-07-18) and is enforced in code (guardrails), not just in the system prompt.

## Hard boundaries (patient-facing)

| Rule | Enforcement |
|---|---|
| **Never** gives medical advice, diagnosis, or treatment opinions → redirects: « C'est une question pour le Dr X, je lui transmets. » | System prompt + post-generation classifier check + handoff trigger |
| **Never** invents prices, availability, or clinic facts — only clinic-configured data may be stated | Context builder injects only `Clinic.aiConfig`; prompt forbids extrapolation; spot-check evals |
| **Always** introduces itself as the clinic's virtual assistant on first contact (EU AI Act chatbot-disclosure) | First-message template, non-configurable |
| **Emergency detection** (douleur intense, saignement, gonflement, fièvre, trauma…) → immediately sends clinic phone + emergency guidance, flags conversation `urgent`, notifies clinic | Keyword+LLM classifier runs BEFORE the reply generation; bypasses normal flow |
| **Human handoff** when: patient requests, anger/frustration detected, medical topic, low confidence, or 3 consecutive non-understandings | Engine state machine; conversation status flips to `human`; AI stops replying |
| Patient text is **data, not instructions** — prompt-injection attempts must not alter behavior | Delimited untrusted content in prompt; output guardrails; injection cases in eval set |

Clinic configures: hours, services, prices, tone (2–3 presets), out-of-office behavior, custom FAQ. Every AI conversation is visible in the dashboard inbox and can be taken over at any moment; takeover writes an AuditLog entry.

## Engine flow (apps/api `ai` module)

```
Meta webhook → verify signature → 200 fast → enqueue (BullMQ)
  → resolve tenant by phone_number_id
  → upsert Conversation + store Message(in)
  → if status == human/closed → notify staff, STOP (AI silent)
  → emergency classifier → if urgent: escalation path, STOP
  → context builder: aiConfig + last N messages + patient record + appointment info
  → LLM call (OpenAI, French system prompt implementing this policy)
  → guardrail post-check (medical-advice / fact-invention / language)
  → pass: send via Graph API, store Message(out, author=ai)
  → fail: safe fallback message + handoff to human
```

- Model: start `gpt-4o-mini` for cost, `gpt-4o` class where quality demands; provider isolated behind one `LlmService` so models/providers swap freely. Temperature low. Response length capped.
- 24h rule: free-form replies only within Meta's 24h customer-service window; outside it, **approved templates only** (enforced in `whatsapp` module, not trusted to the LLM).
- Cost guard: per-clinic daily token budget with alert to owner portal when exceeded. <!-- ponytail: fixed daily cap, per-plan budgets when >1 pricing tier is live -->
- Reply cap (S2-7, D21): **60 AI replies per clinic per hour**. Checked after the free emergency keyword pass and before the first paid call, so a message flood costs nothing and still cannot silence an escalation. Over the cap the thread flips to `HUMAN` with an `ErrorLog` — the message is stored and visible, just not answered. Replaced by the token budget above in S3-6.

## Outbound automation (reminders / follow-ups)

- `ScheduledMessage` rows created by appointment lifecycle events (booked → reminder_24h + reminder_2h; done → followup J+1 configurable).
- A per-minute sweep hands every due row to a BullMQ job that sends a **pre-approved French template message** — the catalogue (three UTILITY templates, their bodies and variables) is `docs/api/whatsapp-templates.md`, the send rules are `docs/api/appointments.md` §Sending; the LLM never writes an outbound reminder (stored `author=SYSTEM`).
- Patient reply to any outbound message opens the 24h window → conversation continues under the engine flow above.
- Opt-out honored absolutely: patient `optOut` blocks all outbound; « STOP » in any message sets it (S3-2, word-bounded match in the inbound worker) and retroactively cancels that patient's pending scheduled messages. The three outbound paths — AI engine, staff send, scheduled sender — each check it themselves. Nothing is sent to acknowledge a STOP (D26).

## Implementation (S2-3, `apps/api/src/ai/`)

| File | Holds |
|---|---|
| `llm.ts` | The only place the API talks to the provider. Raw `fetch` on Chat Completions with a strict `json_schema`; model from `OPENAI_MODEL` (default `gpt-4o-mini`), temperature 0.2, 15s timeout. No key → the engine stays silent and logs, rather than handing every thread to a human. |
| `prompt.ts` | The French system prompt (the six absolute rules above), the context builder, and the delimited untrusted block. `Clinic.aiConfig` is dumped key/value until its contract lands in S3-4. |
| `guardrails.ts` | Deterministic post-checks — the prompt asks, these enforce. Emergency keyword fast path, then `TOO_LONG` / `NOT_FRENCH` / `MEDICAL_ADVICE` / `INVENTED_FACT` on every generated reply. |
| `engine.ts` | The flow above, entered from the inbound worker inside `runAsClinic`. Never throws: a failure ends with the thread `HUMAN` and an `ErrorLog`, because the worker's `waMessageId` dedup means a job retry would skip the reply entirely. |

Two LLM calls per inbound message at most: the emergency classifier (skipped when a keyword already matched) and one generation call returning `{ reply, handoff, understood }`.

**Fixed patient-visible strings** (policy, not clinic-tunable copy): the disclosure prepended to the assistant's first message in a thread, the handoff sentence, the clarification request, and the emergency escalation (clinic phone + 15). Handoff, guardrail failure and engine error all send the **same** handoff sentence and flip the thread to `HUMAN` — the model's own text is discarded (D19).

**Non-understanding counter:** the clarification request is a fixed sentence, so three consecutive misses are counted by reading the last two assistant messages back — no extra column.

**Escalation notifies the clinic** through `Conversation.urgentFlag` + `status=HUMAN`, which the inbox surfaces within its 5s poll. <!-- ponytail: inbox flag only, add push/email when staff ask for it -->

## Quality evaluation

A small French eval set (`apps/api/src/ai/evals/cases.ts`) covering: emergency phrasing variants, price-invention traps, prompt injections, handoff triggers, tone. One corpus, two runners (`apps/api/test/ai-evals.spec.ts`), per founder decision D18:

- **Deterministic half** — keyword classifier, output guardrails, prompt assembly. Runs on every PR, costs nothing, cannot flake. Failing eval = failing CI.
- **Live half** — the same French cases against the real model. Skipped unless `OPENAI_API_KEY` is set, so CI is never billed and never red on a provider outage. Run it locally before any PR touching the `ai` module (`docs/13-local-dev.md` §Evals).
