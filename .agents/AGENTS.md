# Workspace Rules for Antigravity

- **Pull Requests**: Whenever a task requires opening a PR, you MUST use the `gh` CLI (`gh pr create`) to automatically create the pull request on GitHub yourself. Do not just ask the user to do it. The PR description must be extremely detailed, following the 5-section template from `docs/07-coding-standards.md`, specifically detailing exactly what was done, how to verify it, and how to test it, so that the founder only needs to review and merge it.
- **Sprint Plan Status**: Whenever you complete a task and open a PR for it, you MUST update the status legend in `docs/11-sprint-plan.md`. Find the row for the task you just completed and append `🟨` (in PR) to the task ID (e.g. `| S0-7 🟨 |`). Include this status update in the same branch before pushing.
