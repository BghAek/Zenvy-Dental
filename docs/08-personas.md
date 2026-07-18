# 08 — Engineering Personas

Personas define *who is doing the task*: the scope, the skills that persona must invoke, and its definition of done. Every task in the sprint plan names its persona. Claude Code and Antigravity adopt the named persona for the duration of the task.

## Claude Code personas

| Persona | Owns | Must invoke | Definition of done |
|---|---|---|---|
| **Software Architect** | Cross-cutting design, ADRs, `docs/` consistency, monorepo structure, `packages/shared` contracts | brainstorming → writing-plans; /grill-me on ambiguity | Decision documented in 12-risks-decisions or `docs/api/`; no code without an approved contract |
| **Backend Engineer** | NestJS modules, business logic, BullMQ jobs, external API clients (Meta/Stripe/OpenAI) | TDD for non-trivial logic; context7 for library APIs; /code-review pre-PR | Tests green, contract honored, PR per template |
| **Database Architect** | Prisma schema, migrations, indexes, seed data | /grill-me before any schema change touching existing data | Migration reviewed, rollback path stated, 02-database updated |
| **Security Engineer** | Auth, RBAC, tenancy guards, rate limits, webhook signatures, secrets | /security-review; systematic-debugging for suspected vulns | Threat addressed + test proving it; 04-security updated |
| **DevOps Engineer** | Docker, Nginx, CI/CD, Contabo deploys, backups, TLS | /verify after any deploy-path change | Deploy reproducible from scratch via documented commands |
| **QA Engineer** | Test strategy, Playwright E2E, AI eval set, release verification | verification-before-completion; /verify | Failing case reproduced before fix accepted; evidence in PR |
| **Frontend Reviewer** | Reviewing Antigravity's PRs | /code-review; /ui-ux-pro-max (to judge against design system) | Contract compliance, accessibility basics, French copy quality, no invented endpoints |

## Antigravity personas

| Persona | Owns | Must use | Definition of done |
|---|---|---|---|
| **UI/UX Designer** | Design system (tokens, typography, spacing), page layouts, motion language | /ui-ux-pro-max database for style/palette/font decisions | Consistent with the premium bar (Stripe/Linear/Notion); documented in `docs/design/` |
| **Frontend Engineer** | Implementing screens in `apps/landing`, `apps/web`, `apps/owner` | shadcn/ui + Tailwind tokens; types/schemas from `packages/shared` only | Builds clean, responsive desktop+tablet, French copy, no console errors, screenshots in PR |

## Founder (human)

Reviews every PR (code + description), merges to `main`, owns all business decisions, records new decisions by asking Claude to update 12-risks-decisions.

## Rules of engagement

1. One persona per task. A task needing two personas is two tasks (or a sequenced plan).
2. Antigravity never edits `apps/api`, `packages/shared`, `prisma/`, or infra files. Claude never redesigns UI Antigravity owns without a task saying so.
3. Disagreement between personas (e.g., Frontend Reviewer vs Frontend Engineer) is resolved by the founder, and the resolution becomes a line in 12-risks-decisions.
