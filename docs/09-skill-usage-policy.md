# 09 — Skill Usage Policy (auto-invocation matrix)

The founder does not name skills in requests. Agents apply this matrix automatically. "Claude" = Claude Code; Antigravity's equivalents are in AGENTS.md (§Design intelligence and §Workflow).

## Every task, always (Claude)

1. **/grill-me** (interview mode): if the request has any ambiguity that changes the outcome, interview the founder BEFORE building — one question at a time. Skip only when the task is fully specified by the sprint plan.
2. **/find-skills**: quick check — does an installed or installable skill fit this task better than doing it by hand? (`npx skills find <topic>` when the domain is new.)
3. **ponytail** (active via hook): laziest solution that works; the ladder before every implementation choice.
4. **claude-mem / memory**: consult recalled context and `docs/`; never re-decide what 12-risks-decisions already records.

## By task type (Claude)

| Trigger | Skill(s) — in order |
|---|---|
| New feature / behavior change | superpowers:brainstorming → superpowers:writing-plans → (execution) superpowers:subagent-driven-development or executing-plans |
| Any implementation of planned work | superpowers:test-driven-development (non-trivial logic); superpowers:using-git-worktrees when parallel branches are active |
| Bug, test failure, weird behavior | superpowers:systematic-debugging — always before proposing a fix |
| Before claiming anything done | superpowers:verification-before-completion, then /verify (drive the real flow) |
| Before every PR | /code-review (self), fix findings; superpowers:requesting-code-review for major features |
| PR touches auth / billing / webhooks / tenancy / AI output | **/security-review — mandatory** |
| Reviewing Antigravity's PR | /code-review + superpowers:receiving-code-review discipline (verify, don't rubber-stamp) |
| Any UI/UX judgment (reviewing frontend, building owner-portal UI, emails) | /ui-ux-pro-max (styles/palettes/fonts/UX guidelines database) |
| Charts/analytics UI (v2) | dataviz — before writing any chart code |
| Library/API question (NestJS, Prisma, Stripe, Meta, Next.js…) | context7 (`resolve-library-id` → `query-docs`) — never answer from memory |
| Claude API / LLM integration work | claude-api skill for current models & pricing |
| Deployment / app running / screenshots | /run; /verify after changes |
| Repo bloat / over-engineering worry | /ponytail-review (diff) or /ponytail-audit (repo) |
| "Did we solve this before?" | claude-mem /mem-search |
| Session produced decisions/lessons worth keeping | /obsidian-log or /obsidian-decide into the founder's vault; project docs updated in the same PR |
| CLAUDE.md drift after a big session | claude-md-management:revise-claude-md |

## Antigravity (mirror — details in AGENTS.md)

- Every UI task: consult ui-ux-pro-max design database (or the exported design-system doc in `docs/design/`).
- Contract-first: read `packages/shared` + `docs/api/` before building a screen; never invent endpoints.
- Before PR: self-review checklist in AGENTS.md (responsive, French copy, loading/error/empty states, no console errors).

## Priority rules

Process skills (brainstorming, systematic-debugging) come BEFORE implementation skills. Founder's explicit instructions override this matrix. When two skills conflict, the more specific one wins; log the conflict in 12-risks-decisions if it recurs.
