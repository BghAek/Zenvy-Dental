# S1-8 — Frontend Reviewer pass on S1-4/5/6/7

**Reviewer:** Claude Code (Frontend Reviewer persona, docs/08).
**Scope:** the merged frontend from S1-4 (auth screens), S1-5 (dashboard shell), S1-6 (patients pages), S1-7 (landing hero + pricing).
**Method:** multi-agent find → adversarial-verify workflow plus a first-hand read of every file, checked against `docs/api/*`, `packages/shared`, `docs/design/design-system.md`, and `docs/07-coding-standards.md`.
**Definition of done (docs/08):** contract compliance, accessibility basics, French copy quality, no invented endpoints.

S1-4/5/6/7 were already merged, so this ran post-merge. Per founder decision (2026-07-21): Claude fixes the objective defects in this PR; design-token calls go to Antigravity (owner of `packages/ui` + the design system).

## Fixed in this PR

| # | Sev | Area | Finding | File |
|---|-----|------|---------|------|
| 1 | major | S1-6 | List had no error state — a failed `GET /patients` rendered as the "Aucun patient trouvé." empty state | `apps/web/src/pages/patients/PatientListPage.tsx` |
| 2 | major | S1-6 | Row navigation was `onClick` on a bare `<tr>` — mouse-only, no keyboard/focus. Name is now a real `<Link>` | `PatientListPage.tsx` |
| 3 | major | S1-5 | Mobile nav was dead: hamburger had no handler, sidebar `hidden md:block`, no drawer. Added a drawer + `aria-label`s | `DashboardLayout.tsx`, `Header.tsx`, `Sidebar.tsx` |
| 4 | major | S1-5 | No auth guard; shell never called `/me`. Added `RequireAuth` (redirect to `/login` on 401, error state otherwise) | `App.tsx`, `components/auth/RequireAuth.tsx`, `lib/queries/session.ts` |
| 5 | major | S1-6 | Deep imports `@zenvy/shared/src/*` (7 sites) bypassed the package entry. Repointed to `@zenvy/shared` | patients pages, `queries/patients.ts` |
| 6 | major | S1-7 | Tailwind `content` omitted `./components/**` → hero classes purged in `next build`. Added the glob | `apps/landing/tailwind.config.ts` |
| 7 | major | S1-4 | Auth errors echoed Better Auth's English `message`. Now French-only | `RegisterPage.tsx`, `LoginPage.tsx` |
| 12 | minor | S1-4 | Login fetched `/me` then discarded it. Now seeds the session cache for `RequireAuth` | `LoginPage.tsx` |
| 13 | minor | S1-6 | Filter inputs had no accessible name. Added `aria-label`s | `PatientListPage.tsx` |
| 14 | minor | S1-5 | Dead sidebar support link `href="#"` → `mailto:` | `Sidebar.tsx` |
| 17 | minor | S1-4 | Hand-rolled spinner instead of the exported `Spinner`. Now uses `@zenvy/ui` | `VerifyEmailPage.tsx` |
| 18 | minor | S1-4 | Resend-verification had no error state — silent failure. Added one | `VerifyEmailPage.tsx` |
| 20 | minor | S1-7 | No per-page SEO metadata. Added `title`/`description` to `/tarifs`, `/demo` | landing pages |
| 21 | nit | S1-4 | Verification token not URL-encoded | `VerifyEmailPage.tsx` |

## Handed to Antigravity (design system / `packages/ui`)

| # | Sev | Finding | Where |
|---|-----|---------|-------|
| 8 | minor | Off-palette `green-*` success colors (no success token exists) — add a success token to `@zenvy/ui` | `VerifyEmailPage.tsx`, `ResetPasswordPage.tsx` |
| 9 | minor | `--accent` = `#DC2626` (same as destructive), so the shadcn `hover:bg-accent` idiom flashes red on the landing secondary button and the patient-detail back link | `apps/landing/app/page.tsx`, `PatientDetailPage.tsx`, `packages/ui/theme.css` |
| 10 | minor | DM Sans declared in `packages/ui/tailwind.config.ts` but never loaded — both apps fall back to system sans | `packages/ui`, app entrypoints |
| — | nit | French typography: narrow-NBSP before `?`/`:`, typographic apostrophes | auth pages, sidebar |
| — | nit | Hero 3D ignores `prefers-reduced-motion` | `apps/landing/components/hero-3d.tsx` |
| — | nit | Pricing uses raw `bg-slate-50`/`bg-white` instead of tokens | `apps/landing/app/tarifs/page.tsx` |

## Deferred (need a dedicated task, not S1-8)

- **Search debounce** (`PatientListPage` fires a query per keystroke) — minor perf, left out to keep this PR focused.
- **Footer legal links 404** (`/mentions-legales`, `/confidentialite`) — need real legal content (RGPD), not a stub.
- **Trial CTA → `/demo`** — routing/product call; `/demo` full build is S4-3.
- **Web bundle > 500 kB** — pre-existing; code-splitting is a later perf task.

## Considered and dismissed (adversarial verify)

- *"Trial countdown missing in shell"* — not a defect; subscription/trial UI is S3-4 scope (S1-5 = shell with placeholder routes).
- *"Auth guard absence = security blocker"* — downgraded to major: the API enforces auth/tenancy server-side, so there is no data exposure; the client guard/redirect gap is a UX/contract issue (fixed as #4).
- *Hero3D hardcoded hex* — acceptable: Three.js materials/lights need literal colors, not Tailwind tokens.
