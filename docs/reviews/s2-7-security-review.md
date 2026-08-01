# S2-7 — Security review: WhatsApp webhook + AI input path

**Reviewer:** Claude Code (Security Engineer persona, docs/08).
**Scope:** everything an unauthenticated party can reach or influence — `apps/api/src/whatsapp/` (webhook, ingest queue, inbound worker), `apps/api/src/ai/` (engine, prompt, guardrails, llm), and the pipeline they run in (`app.ts`, `app.module.ts`, `auth/rbac.ts`).
**Method:** first-hand read of every file on the path, checked against docs/04-security.md, docs/05-ai-policy.md and docs/01-architecture.md §Deploy.
**Definition of done (docs/08):** threat addressed + a test proving it; docs/04 updated.

## Verdict

The signature, tenant-routing and prompt-injection work from S2-2/S2-3 holds up — no finding against it. What was missing is the layer around it: **docs/04 §Platform hardening was never implemented at all** (no helmet, no CORS policy, no rate limits), and the AI input path had no ceiling on what an anonymous sender could spend.

## Findings fixed in this PR

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1 | major | **No rate limiting anywhere.** `/auth/*` accepted unlimited sign-in attempts (credential stuffing against Better Auth), `/webhooks/*` unlimited unsigned POSTs (each paying an HMAC + an exception-filter log). docs/04 mandated `@nestjs/throttler`; that would not have covered `/auth/*` at all — Better Auth is mounted with `app.use()` and terminates before Nest's guards run. | `express-rate-limit` in `app.ts`: auth 20/15 min, webhooks 600/min, per IP (D20) |
| 2 | major | **`trust proxy` unset.** Behind the nginx hop every request would key on the proxy's IP, so any per-IP limit — including the ones added here — would have throttled all clinics as one bucket. | `app.set('trust proxy', 1)` |
| 3 | major | **No ceiling on LLM spend from the input path.** Anyone who knows a clinic's WhatsApp number could send an unbounded stream of messages, each costing up to two OpenAI calls with a 20-message history. Nothing capped it; the patient auto-creation cap (20/h) bounded rows, not tokens (R4). | 60 AI replies per clinic per hour, checked *after* the free emergency keyword pass so a flood cannot silence an escalation (R6). Over the cap the thread flips to `HUMAN` (D21) |
| 4 | minor | **No security headers.** `helmet` is required by docs/04 and was absent — no `nosniff`, no frameguard, and `X-Powered-By: Express` advertised the stack. | `app.use(helmet())` |
| 5 | minor | **No CORS policy.** Undefined behaviour rather than a decision; the split-origin local setup (`VITE_API_URL`) and the `api.` subdomain in docs/01 both need one, and it must never become a wildcard with `credentials`. | Exact-origin allowlist from `CORS_ORIGINS`, **empty by default** so production (same-origin) keeps failing closed |
| 6 | minor | **Reflected `hub.challenge` served as `text/html`.** The verification handshake echoes the query parameter verbatim and Express labels string responses HTML, so a valid-token URL was a reflected-XSS primitive. Low reach (needs `META_VERIFY_TOKEN`), one line to close. | `@Header('Content-Type', 'text/plain; charset=utf-8')` |

## Checked and found sound (no change)

- **Signature verification** — HMAC over `req.rawBody`, not the re-serialised body; `timingSafeEqual` with a length guard; `CHANGE_ME` treated as unset so a copied `.env.example` fails closed. Wrong-secret, tampered-payload, missing-header and placeholder-secret cases are all already tested.
- **Nothing acts on an unsigned payload** — the only work before the check is Express' JSON parse, which docs/04 explicitly allows.
- **Prompt injection** — untrusted values go in a delimited block whose delimiters they cannot close (`sanitize` strips `<<`/`>>`), patient text rides in `user` turns, and the model's output is re-checked deterministically (`guardrails.ts`) before it reaches a patient. Injection cases are in the eval corpus.
- **Tenant routing** — `phone_number_id` → `clinicId` is the one unscoped lookup, and everything after it runs inside `runAsClinic`; an unroutable event is logged and dropped. Cross-tenant tests exist for the engine.
- **Secrets and PII in logs** — no payload, message body or model error body reaches the logger; `ErrorLog` carries ids and metadata only.
- **Deny-by-default authz** — `RolesGuard` rejects any route without explicit `@Public`/`@Roles`; only `/health` and the two webhook routes are public.

## Accepted, not fixed

| Finding | Why it stands |
|---|---|
| `clinic.name` and `aiConfig` are interpolated into the system prompt unsanitised | Clinic-controlled, and a clinic self-injecting into its own assistant harms only itself. Revisit if `aiConfig` ever becomes patient- or ops-editable |
| Rate-limit store is in-memory | One API process in v1 (docs/01 §Deploy), so per-process counters are the global counters. Redis store lands with the second instance (D20) |
| The reply cap is a flat count, not a token budget | The real cost guard is S3-6's per-clinic token budget; this is the floor that keeps the number safe to hand out before then (D21) |

## How it is proven

`apps/api/test/hardening.spec.ts` (helmet headers, no allow-origin without an allowlist, auth path reaching 429), the cap case in `test/ai-engine.spec.ts` (no paid call past the cap, emergency still escalates), and the `text/plain` assertion in `test/whatsapp-webhook.spec.ts`. Full API suite: 158 passed, 20 skipped (the live-model eval half).
