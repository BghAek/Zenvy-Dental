# ZenvyDental

Patient-communication platform for French dental clinics: premium dashboard + AI-powered WhatsApp assistant (reminders, follow-ups, lead capture) in French. B2B SaaS — Premium €399/mo, 14-day trial.

## Documentation — start here

Everything about this project lives in [docs/](docs/). Agents and humans alike:

| Doc | What |
|---|---|
| [00-vision](docs/00-vision.md) | Product, positioning, pricing, v1 scope |
| [01-architecture](docs/01-architecture.md) | Monorepo, apps, runtime topology, infra |
| [02-database](docs/02-database.md) | Entities, tenancy enforcement, conventions |
| [03-api-conventions](docs/03-api-conventions.md) | REST conventions, error envelope, webhooks |
| [04-security](docs/04-security.md) | Auth, RBAC, tenant isolation, hardening |
| [05-ai-policy](docs/05-ai-policy.md) | AI patient-chat boundaries + engine design |
| [06-observability](docs/06-observability.md) | Correlation IDs, logging, ErrorLog |
| [07-coding-standards](docs/07-coding-standards.md) | Style, testing, git/PR conventions, DoD |
| [08-personas](docs/08-personas.md) | Which agent persona does which work |
| [09-skill-usage-policy](docs/09-skill-usage-policy.md) | Which skills fire automatically, when |
| [10-agent-workflow](docs/10-agent-workflow.md) | Branch → PR → review → merge process |
| [11-sprint-plan](docs/11-sprint-plan.md) | v1 sprints S0–S4, parallel task tables |
| [12-risks-decisions](docs/12-risks-decisions.md) | Decision log (append-only) + risk register |
| [13-local-dev](docs/13-local-dev.md) | Running the stack locally (Docker + pnpm) |

Agent rulebooks: [CLAUDE.md](CLAUDE.md) (Claude Code) · [AGENTS.md](AGENTS.md) (Antigravity).

## Status

Sprint 0 in progress — monorepo scaffold (S0-1) and local Docker stack (S0-2) merged; CI in PR (S0-3). See [11-sprint-plan](docs/11-sprint-plan.md) for live task status.
