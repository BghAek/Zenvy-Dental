# 07 — Coding Standards

Applies to both agents (Claude Code, Antigravity) and any human contributor.

## Language & style

- TypeScript strict mode everywhere. No `any` at module boundaries; no `@ts-ignore` without an explaining comment.
- ESLint + Prettier, configured once at the repo root, enforced in CI. Match the surrounding code's idiom; don't introduce new patterns without an ADR.
- English: code, comments, commit messages, docs, PR descriptions. French: every user-visible string.
- French UI strings live in per-app `strings/` modules (simple typed objects — **no i18n library in v1**; decision logged). <!-- ponytail: hardcoded FR string modules; add i18n lib when a second language is actually sold -->
- Comments only for what code can't say (constraints, ceilings, non-obvious whys). No narration.

## Simplicity rules (ponytail doctrine — binding)

1. Don't build what isn't needed for the current sprint's tasks (YAGNI).
2. Reuse what exists in the repo before writing new; stdlib/platform before dependency; **adding a dependency requires justification in the PR description**.
3. Deliberate shortcuts carry a `ponytail:` comment naming the ceiling and upgrade path.
4. Boring beats clever. Deletion beats addition.

## Testing philosophy

- Test what can break, not what can't: business logic (trial expiry, scheduling windows, tenant guards, AI guardrails, webhook idempotency) gets real unit tests; trivial CRUD pass-throughs don't.
- **Mandatory coverage:** tenant-isolation test per tenant-scoped module; AI eval set green (see 05); webhook signature + idempotency tests; billing state transitions.
- E2E: one Playwright happy-path per critical flow (signup→trial, inbox send/receive, reminder scheduling) — `packages/e2e`, run in CI (S4-5, docs/13 §E2E). They drive the real stack; a flow that needs the product mocked to pass is not an E2E test.
- TDD (superpowers:test-driven-development) for non-trivial backend logic; UI components are verified visually + by contract, not snapshot-tested to death.

## Git & PR conventions

- Branches: `feat|fix|chore/<app>-<slug>` (e.g. `feat/api-whatsapp-webhook`, `feat/web-inbox-ui`). One task = one branch = one PR. Never commit to `main`.
- Commits: Conventional Commits (`feat(api): ...`, `fix(web): ...`).
- **PR description template (mandatory, both agents):**
  1. **What** — the task, in one paragraph.
  2. **Why/decisions** — any choice made beyond the task spec, with reasoning.
  3. **How to test** — exact commands / clicks for the founder to verify locally.
  4. **Verification done** — what the agent actually ran and observed (test output, screenshots for UI).
  5. **Docs touched** — which `docs/` files were updated (or "none needed").
- A PR that changes behavior described in `docs/` MUST update those docs in the same PR — docs and code never drift.

## Definition of Done (every task)

1. Code matches the contract in `packages/shared` / `docs/api/`.
2. Lint, typecheck, tests green locally and in CI.
3. Verification actually performed (superpowers:verification-before-completion — evidence in the PR, not claims).
4. `/code-review` run and findings addressed; `/security-review` if auth/billing/webhooks/tenancy/AI touched.
5. PR description complete per template above.
