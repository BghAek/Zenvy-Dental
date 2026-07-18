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

## Outbound automation (reminders / follow-ups)

- `ScheduledMessage` rows created by appointment lifecycle events (booked → reminder_24h + reminder_2h; done → followup J+1 configurable).
- BullMQ delayed jobs send via **pre-approved French template messages** (template catalog documented in `docs/api/whatsapp-templates.md` as they're registered with Meta).
- Patient reply to any outbound message opens the 24h window → conversation continues under the engine flow above.
- Opt-out honored absolutely: patient `optOut` blocks all outbound; « STOP » in any message sets it.

## Quality evaluation

A small French eval set (`apps/api/src/ai/evals/`) covering: emergency phrasing variants, price-invention traps, prompt injections, handoff triggers, tone. Run on every PR touching the `ai` module. Failing eval = failing CI.
