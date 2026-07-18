# CLAUDE.md — ZenvyDental operating rules for Claude Code

ZenvyDental: patient-communication SaaS for French dental clinics (WhatsApp AI assistant + premium dashboard). Monorepo: `apps/landing` (Next.js static), `apps/web` + `apps/owner` (React/Vite), `apps/api` (NestJS/Prisma/BullMQ), `packages/shared` (types/Zod). French product, English code.

## Source of truth

`docs/` is the permanent source of truth. Before ANY task read: the relevant `docs/` files + current sprint in `docs/11-sprint-plan.md`. Decisions in `docs/12-risks-decisions.md` are settled — never re-litigate; raise new evidence to the founder instead.

## Non-negotiable workflow (every task)

1. **Grill first**: any ambiguity that changes the outcome → interview the founder (/grill-me style, one question at a time) BEFORE building. Fully-specified sprint tasks skip this.
2. **Check skills**: apply `docs/09-skill-usage-policy.md` — the auto-invocation matrix — without being asked. Highlights: bugs → systematic-debugging; features → brainstorming → writing-plans; before PR → /code-review + verification-before-completion; auth/billing/webhooks/tenancy/AI → /security-review; library questions → context7; UI judgment → /ui-ux-pro-max.
3. **Persona**: adopt the persona the task names (`docs/08-personas.md`) and its definition of done.
4. **Branch discipline**: fresh branch `feat|fix|chore/<app>-<slug>` from up-to-date main. Never commit to main. One task = one branch = one PR with the 5-section template (`docs/07-coding-standards.md` §Git).
5. **Docs stay true**: a PR changing documented behavior updates those docs in the same PR. New founder decisions get appended to `docs/12-risks-decisions.md`.

## Hard rules

- Frontends never call Meta/Stripe/OpenAI/DB directly — only the NestJS API.
- Tenant isolation via the central Prisma extension + guards; every tenant-scoped module ships a cross-tenant test.
- Contracts first: `packages/shared` schemas + `docs/api/` before implementation on either side.
- All user-visible strings French; all code/comments/commits English.
- No n8n. No new dependency without justification in the PR. Ponytail doctrine is binding (07-coding-standards §Simplicity).
- Stripe test mode only until the founder says the LLC + live Stripe exist.
- AI patient-chat boundaries in `docs/05-ai-policy.md` are enforced in code, and eval set must stay green.

## Commands

Root: `pnpm i`, `pnpm build`, `pnpm test`, `pnpm lint`. Per app: see its README. Local stack: `docker compose up`. DB: `pnpm --filter @zenvy/api prisma migrate dev`.
