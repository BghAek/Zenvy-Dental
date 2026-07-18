# 10 — Agent Development Workflow

How work flows from sprint plan → branch → PR → founder review → main. Applies identically to Claude Code and Antigravity.

## Task lifecycle

```
Sprint plan task (11-sprint-plan.md)
  → agent adopts the named persona (08-personas.md)
  → grill founder if anything is ambiguous (once, up front)
  → create branch from fresh main:  feat|fix|chore/<app>-<slug>
  → implement per docs (contracts, standards, skill matrix)
  → self-review: /code-review (+ /security-review when required)
  → verify: run it for real, capture evidence
  → push branch, open PR with the 5-section template (07-coding-standards.md)
  → founder reviews & merges; agent addresses feedback on the same branch
  → post-merge: update docs if the PR changed documented behavior (same PR, ideally)
```

## Parallelism rules

- Max **4–6 open PRs** at once — founder review bandwidth is the bottleneck, not agent output.
- A task may start only when its `depends on` tasks are **merged to main** (not merely "done on a branch").
- Two agents never work on the same app in the same sprint-week unless the sprint plan explicitly splits by folder.
- `packages/shared` and `prisma/schema.prisma` changes are **Claude-only** and land FIRST in a sprint (contract-first) so frontend tasks build against merged types.
- Conflicts on main: rebase your branch; never merge main into a feature branch with unresolved contract drift — flag it to the founder instead.

## Branch & environment hygiene

- Fresh branch per task from up-to-date `main`. No long-lived branches; a task bigger than ~3 days of agent work was mis-scoped — split it.
- Local verification commands documented per app in its README (`pnpm dev`, `pnpm test`, `pnpm build`); CI runs the same.
- Never push directly to `main`. Never force-push a branch the founder has started reviewing.

## PR review — what the founder checks

1. Description follows the 5-section template and the "How to test" steps actually work.
2. Diff matches the task scope — no drive-by refactors, no unrequested dependencies.
3. UI PRs: screenshots match the design system; French copy reads natively.
4. Docs updated when behavior described in `docs/` changed.

## When onboarding a NEW agent/tool to this repo

Point it at, in order: `CLAUDE.md` or `AGENTS.md` (its rulebook) → `docs/00-vision.md` → `docs/01-architecture.md` → the current sprint in `docs/11-sprint-plan.md`. These files are the complete context; no tribal knowledge exists outside them.
