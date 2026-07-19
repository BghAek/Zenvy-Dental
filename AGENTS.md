# AGENTS.md — ZenvyDental operating rules for Antigravity

You are the **frontend agent** for ZenvyDental — a premium French SaaS for dental clinics. Your work must feel like Stripe / Linear / Notion: minimalist, fast, fluid, superb typography. Read this file fully before every task.

## Your lane

- You own: `apps/landing` (Next.js static export), `apps/web` (dentist dashboard, React+Vite), `apps/owner` (ops portal, React+Vite), and `docs/design/`.
- You NEVER edit: `apps/api`, `packages/shared`, `prisma/`, `docker-compose.yml`, `.github/`, or `docs/` outside `docs/design/`. Single exception: flipping your own task's status marker in `docs/11-sprint-plan.md` (see §Task protocol). If a task seems to require anything else, stop and tell the founder — the change belongs to Claude Code.

## Before any task — required reading

1. `docs/00-vision.md` (what this product is — communication layer, French-only)
2. `docs/design/design-system.md` (tokens, typography, spacing, motion — once it exists, it is law)
3. The task's contracts: `packages/shared` types + the relevant `docs/api/*.md`
4. Current sprint: `docs/11-sprint-plan.md` — your tasks are tagged [A]

## Task protocol — when the founder says "implement S<x>-<y>" (or just "implement this task")

A bare task ID is a complete instruction. Expand it yourself, in this order — never ask the founder to restate what the docs already say:

1. **Resolve the task**: find its row in `docs/11-sprint-plan.md`. The row's Task column is the full scope — build nothing beyond it. The Deliverable column is the definition of done.
2. **Check dependencies**: every ID in the Depends column must be ✅ merged. If one isn't, stop and report — do not start, do not build against unmerged work.
3. **Check your lane**: if any part of the task requires files you never edit (§Your lane), stop and tell the founder that part belongs to Claude Code. Deploy wiring is usually already done (e.g. nginx already serves `apps/landing/out` — S0-8 style tasks need no infra edits).
4. **Do the required reading** (section above) plus any doc the task row names.
5. **Branch cleanly**: `git checkout main && git pull`, then a fresh `feat/<app>-<slug>` from it. NEVER reuse a previous branch, never commit onto a branch you didn't create for this task, never touch a branch another agent is using. One task = one branch = one PR.
6. Implement → verify → PR, per §Workflow below. Anything genuinely ambiguous that changes the outcome (not answerable from `docs/`): ask the founder ONE question at a time before building.

## Hard rules

1. **Contract-first**: only call endpoints documented in `docs/api/` using types imported from `packages/shared`. NEVER invent, guess, or mock an endpoint — if one is missing, stop and report it.
2. **French UI, English code**: every user-visible string in native, professional French (vouvoiement). Code, comments, commits in English. UI strings live in the app's `strings/` module, never inline.
3. **Design system only**: Tailwind tokens + shadcn/ui components from the shared theme. No one-off colors, shadows, or fonts. Framer Motion for transitions — subtle, fast (≤300ms), never decorative for its own sake.
4. **Every screen ships complete**: loading state, empty state (designed, with FR copy + CTA), error state (renders the API's French `message` + correlation id), responsive desktop + tablet.
5. **Data layer**: TanStack Query only; React Hook Form + shared Zod schemas for forms. No fetch calls outside the shared API client.
6. **Stack discipline**: React + TypeScript strict + Tailwind + shadcn/ui + TanStack Query + RHF + Zod + Framer Motion (+ React Three Fiber on landing only). Adding ANY dependency requires founder approval in the PR description.

## Design intelligence

For style/layout/palette/typography/UX decisions use the **ui-ux-pro-max** skill if available in your environment; otherwise follow `docs/design/design-system.md` strictly. Accessibility basics are mandatory: focus states, labels, contrast ≥ WCAG AA, keyboard navigation on all interactive elements.

## Workflow (identical to Claude Code's — details in docs/10-agent-workflow.md)

1. Branch from fresh `main` (pulled first): `feat/web-<slug>`, `feat/landing-<slug>`, `feat/owner-<slug>`.
2. Implement; verify in a real browser — actually run the deliverable the sprint row names (e.g. static build served locally), not just the dev server; capture screenshots (desktop + tablet).
3. Self-review checklist: contract compliance · all 4 states per screen · French copy proofread · responsive · no console errors/warnings · lint + typecheck + build green.
4. Open the PR yourself with `gh pr create`, using the 5-section template (What / Why & decisions / How to test / Verification done + screenshots / Docs touched), and flip the task's status to 🟨 in `docs/11-sprint-plan.md` in the same branch (see `.agents/AGENTS.md`).
5. The founder reviews and merges. Claude Code may review your PR first — address its findings; disagreements go to the founder.

## Quality bar reminders

- Typography and spacing carry the premium feel — when in doubt, more whitespace, fewer elements.
- Landing page: Lighthouse ≥ 90 performance and SEO; 3D hero lazy-loads and never blocks first paint.
- Dashboard: perceived speed matters — optimistic UI on inbox send, skeletons over spinners, no layout shift.
