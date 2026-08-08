# S4-7 (part 1) — Copy & polish audit: landing / web / owner

**Reviewer:** Claude Code, Frontend Reviewer persona (`docs/08-personas.md`).
**Scope:** every `.tsx` in `apps/landing`, `apps/web`, `apps/owner` (47 files) plus `packages/ui` and `packages/shared` where they are the root cause of an app-level defect.
**Method:** first-hand read of every file, checked against `docs/design/design-system.md`, `docs/07-coding-standards.md` §Language, `docs/api/*`, the real NestJS route table, and the `/ui-ux-pro-max` UX rule set (accessibility → empty/error/loading → forms → navigation, priority 1–9).
**Status:** audit only. No files edited. Nothing here has been fixed.

### Founder decisions taken during this review (2026-08-08)

| # | Question | Decision | Consequence |
|---|---|---|---|
| **D1** | `/tarifs` Premium CTA says « Commencer l'essai gratuit de 14 jours » but links to `/demo` | **Keep the copy, point it at signup** (`app.zenvydental.fr/register`) | Self-serve trial becomes a real path → **R4 is now a launch blocker**: [Step2WhatsApp.tsx:24-26](apps/web/src/pages/onboarding/Step2WhatsApp.tsx#L24-L26) must reach the founder, not `localStorage`, or every self-serve signup stalls unnoticed |
| **D2** | Unsourced « Réduisez l'absentéisme de 40% » on the home page | **Drop the number, keep the benefit** — « Réduisez les rendez-vous manqués. ZenvyDental envoie des rappels sur WhatsApp, avec confirmation ou annulation en un message. » | No sourcing burden; removes DGCCRF exposure |
| **D3** | Does the French-only rule apply to `apps/owner` (internal ops tool)? | **Same bar as the clinic app** — no carve-out | *thread* → « conversation »; severities → Info / Avertissement / Erreur / Critique; « Stack Trace » → « Trace d'appels »; `OPEN`/`CLOSED` → Ouvert / Résolu |
| **D4** | Inbox filter tabs « Actifs » / « Archives » (wrong gender agreement) | **« En cours » / « Archivées »** | Also fixes the empty-state wording per §2.3 |
| **D5** | Three contact addresses in the product | **One address: `contact@zenvydental.fr`** | `support@` (sidebar) and `founder@` (onboarding) both become `contact@`. In-app support UI on `POST /support-threads` stays a v2 idea, not this sprint |
| **D6** | « Charger plus » ×3 | **« Afficher plus »** — one shared string | Goes in the `strings/` module (R7), not inline in three files |

Per `CLAUDE.md` rule 5, D1–D6 are appended to `docs/12-risks-decisions.md` in the S4-7 fix PR.

**Categories:** `copy-EN` = English in user-visible copy · `copy-FR` = French wording/typography/register · `dead-end` = empty/error/loading/404/403 path with no way forward, or a control that does nothing · `drift` = design-system violation.

**Owner:** `A` = Antigravity (design system, `packages/ui`, visual/layout, copy voice inside screens they own) · `C` = Claude (data layer, routes/guards, `packages/shared`, contract wiring, objective defects per the founder decision of 2026-07-21).

---

## 0. Read this first — 7 root causes produce ~60 of the 96 findings

Fixing these seven costs far less than fixing the rows they generate. Every row below that traces to one is tagged `→ R#`.

| # | Root cause | Where | Rows it kills | Owner |
|---|---|---|---|---|
| **R1** | `--accent` = `#DC2626`, identical to `--destructive`. `Button` variants `outline` and `ghost` are `hover:bg-accent hover:text-accent-foreground`. **Every outline/ghost button and back-link in all three apps flashes red on hover.** | [theme.css:31](packages/ui/theme.css#L31), [button.tsx:20-24](packages/ui/src/components/button.tsx#L20-L24) | ~14 | A |
| **R2** | No French label map for the Prisma/Zod enums. `AppointmentStatusBadge` hand-rolls one; nothing else does, so raw `SCHEDULED` / `PENDING` / `TRIALING` / `OPEN` / `FATAL` leak to screen. | [enums.ts](packages/shared/src/enums.ts) has none | 9 | C |
| **R3** | No success/info/warning tokens exist, so every success state invents `green-*` / `blue-*` / `amber-*` / `emerald-*` / `indigo-*` raw Tailwind. | [theme.css](packages/ui/theme.css) | ~22 | A |
| **R4** | `apps/web/src/lib/queries/settings.ts` is **100 % localStorage mock** — clinic profile, AI config, staff, invites. It never calls the API. The endpoints it would need (`PATCH /clinics/:id`, `GET/DELETE /staff`, `DELETE /staff-invites/:id`) **do not exist** in `apps/api`. The whole Paramètres section and onboarding steps 2–3 write to the browser and vanish on cache clear. | [settings.ts](apps/web/src/lib/queries/settings.ts) | 11 | C |
| **R5** | `useMe()` swallows any `/me` failure and returns a hardcoded fake session (*Dr Claire Fontaine, Cabinet Dentaire Lumière*). `RequireAuth` therefore can never see a 401 — a logged-out visitor lands inside a fake clinic, and every downstream error state is unreachable. | [session.ts:18-48](apps/web/src/lib/queries/session.ts#L18-L48) | 6 | C |
| **R6** | Design system says flat, **no shadows** (§1, §5). `shadow-sm/md/lg/xl` appears in 21 places across all three apps. | — | 21 | A |
| **R7** | `docs/07` §Language requires French strings in per-app `strings/` modules. **No app has one.** Every string is inline, which is why the same concept is worded three different ways across screens. | all three apps | structural | A + C |

---

## 1. `apps/landing`

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [out/404.html](apps/landing/out/404.html) (no `app/not-found.tsx`) | **copy-EN + dead-end** | Shipped 404 reads `404 — This page could not be found.`, system font, no header/footer, no link home | Add `app/not-found.tsx`: « Page introuvable — Cette page n'existe pas ou a été déplacée. » + `<Link href="/">Retour à l'accueil</Link>` + `/tarifs`, `/demo`. Must use the app shell and tokens | A |
| [layout.tsx:36-37](apps/landing/app/layout.tsx#L36-L37) | **dead-end** | Footer links `/mentions-legales` and `/confidentialite` — neither route exists → the English 404 above | Ship both pages (RGPD content required, not a stub), or remove the links until the content exists. **Founder call: a French health-adjacent SaaS needs both live before launch** | A (pages) / founder (content) |
| [layout.tsx:23](apps/landing/app/layout.tsx#L23) | **dead-end** | `href="http://app.zenvydental.local"` — dev hostname hardcoded in the "Connexion" nav link. Broken in production | `process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.zenvydental.fr'` | C |
| [demo-cta.tsx:13](apps/landing/components/demo-cta.tsx#L13) | **dead-end** | `whatsappNumber = "33600000000"` — placeholder. The **primary CTA of the demo page** opens a chat with a non-existent number | Real founder E.164 number, no `+`. Blocking: `/demo` is the only conversion path on the site | founder → C |
| [demo-cta.tsx:6](apps/landing/components/demo-cta.tsx#L6) | copy-FR | `contact@zenvydental.fr` — while [Sidebar.tsx:40](apps/web/src/components/layout/Sidebar.tsx#L40) uses `support@` and [Step2WhatsApp.tsx:75](apps/web/src/pages/onboarding/Step2WhatsApp.tsx#L75) uses `founder@`. Three addresses for one company | **D5** — `contact@zenvydental.fr` everywhere. This file is already correct; fix the other two | C |
| [demo-cta.tsx:28](apps/landing/components/demo-cta.tsx#L28) | **copy-EN** | `Par Email` | `Par e-mail` — the rest of the product already says « Adresse e-mail » | A |
| [video-placeholder.tsx:9-14](apps/landing/components/video-placeholder.tsx#L9-L14) | **dead-end** | `role="button" tabIndex={0} cursor-pointer aria-label="Lire la vidéo : …"` with **no onClick and no onKeyDown**. Announced to screen readers as a play button, does nothing. 3 instances on `/demo` | Either wire a real video, or drop `role`/`tabIndex`/`cursor-pointer`/`aria-label` and label it « Démo vidéo — bientôt disponible ». Never ship a focusable no-op | A |
| [tarifs/page.tsx:46-48](apps/landing/app/tarifs/page.tsx#L46-L48) | **dead-end** | Standard plan CTA is a disabled button reading « Indisponible ». A visitor interested in Standard has no next step | « Bientôt disponible » + a link to `/demo` (« Prévenez-moi »). Standard checkout is v2 per `docs/11` — say so, don't just grey it out | A |
| [tarifs/page.tsx:84-85](apps/landing/app/tarifs/page.tsx#L84-L85) | copy-FR | CTA « Commencer l'essai gratuit de 14 jours » links to `/demo`, a mailto/WhatsApp page — not a signup | **D1** — keep the copy, repoint to `${NEXT_PUBLIC_APP_URL}/register`. **Do not ship this without R4 fixed** (see D1 consequence) | C |
| [tarifs/page.tsx:33,63](apps/landing/app/tarifs/page.tsx#L33) | copy-FR | `20€` / `399€` — no space. [SubscriptionSettings.tsx:171](apps/web/src/pages/settings/SubscriptionSettings.tsx#L171) writes `399 €` | `20 €` / `399 €` with a narrow NBSP (`&#8239;`). French typography is non-negotiable at this price point | A |
| [tarifs/page.tsx](apps/landing/app/tarifs/page.tsx) | copy-FR | No mention of HT/TTC, while the app says « TVA non incluse » | Add « HT » next to the price on both surfaces, worded identically | A |
| [page.tsx:64](apps/landing/app/page.tsx#L64) | copy-FR | « Réduisez l'absentéisme de 40%. » — unsourced figure, and no NBSP before `%` | **D2** — « Réduisez les rendez-vous manqués. ZenvyDental envoie des rappels sur WhatsApp, avec confirmation ou annulation en un message. » | A |
| [page.tsx:62](apps/landing/app/page.tsx#L62) | copy-FR | « Rappels Automatisés » — English title case | « Rappels automatisés ». French uses sentence case in headings | A |
| [page.tsx:26](apps/landing/app/page.tsx#L26) | drift → R1 | Secondary hero CTA « Voir les tarifs » turns **red** on hover | R1 | A |
| [page.tsx:38,50,59,68](apps/landing/app/page.tsx#L38) | drift | `bg-slate-50`, `bg-white` raw | `bg-muted`, `bg-card` | A |
| [page.tsx:20,26,50,59,68](apps/landing/app/page.tsx#L20) | drift → R6 | `shadow`, `shadow-sm` | R6 | A |
| [tarifs/page.tsx:25,52-53](apps/landing/app/tarifs/page.tsx#L25) | drift | `shadow-sm`/`shadow-lg`, `bg-white`, `text-white` raw | `bg-card`, `text-accent-foreground`, R6 | A |
| [hero-3d.tsx](apps/landing/components/hero-3d.tsx) | drift | Continuous three.js animation, **no `prefers-reduced-motion` check**. Design system §4 requires it; §7 of the UX ruleset makes it a hard accessibility item | `useReducedMotion()` → render a static sphere (or the `hero-wrapper` skeleton). Also `aria-hidden` the canvas — it is decorative | A |
| [demo-whatsapp-showcase.tsx:~60](apps/landing/components/demo-whatsapp-showcase.tsx) | drift | Avatar loaded from `https://ui-avatars.com/api/?…` — a third-party request from a French health-adjacent marketing page | Inline SVG or a local asset. No external calls from the landing page (RGPD posture + `docs/01` hard rule) | A |
| [demo-timeline-showcase.tsx](apps/landing/components/demo-timeline-showcase.tsx) | **copy-FR (factual)** | Advertises a **J-7 / J-2 / J-1** reminder cadence. The product ships `REMINDER_24H`, `REMINDER_2H`, `FOLLOWUP` ([enums.ts:57-64](packages/shared/src/enums.ts#L57-L64)) | Rewrite to the real cadence: « J-1 : rappel », « J : rappel 2 h avant », « J+1 : suivi ». Marketing must not promise a schedule the product cannot send | A |
| [demo-timeline-showcase.tsx](apps/landing/components/demo-timeline-showcase.tsx) | copy-FR | « Séquence de Rappels », « Rappel Doux », « Demande de Confirmation » — English title case | « Séquence de rappels », « Rappel doux », « Demande de confirmation » | A |
| [demo-timeline-showcase.tsx](apps/landing/components/demo-timeline-showcase.tsx) | copy-FR | `\"Oui\"` — straight double quotes in French copy | « Oui » (guillemets + NBSP) | A |
| [demo-timeline-showcase.tsx](apps/landing/components/demo-timeline-showcase.tsx) | drift → R3 | `text-blue-500`, `text-amber-500`, `text-green-500`, `bg-white` | R3 | A |
| [demo-inbox-showcase.tsx](apps/landing/components/demo-inbox-showcase.tsx) | drift → R3 | `bg-emerald-100/700`, `bg-blue-100/200`, `bg-amber-50/200/600`, `bg-slate-*`, `shadow-md` | R3, R6 | A |
| [demo-inbox-showcase.tsx](apps/landing/components/demo-inbox-showcase.tsx) | **dead-end** | The mock « Répondre » button is a real focusable `<button>` inside a static mockup — tabbable, does nothing | `aria-hidden="true"` + `tabIndex={-1}`, or render as a `<span>` | A |
| [demo-inbox-showcase.tsx](apps/landing/components/demo-inbox-showcase.tsx) | copy-FR | « Dr. Martin » | « Dr Martin » — no period after `Dr` in French | A |
| [demo/page.tsx:31,52](apps/landing/app/demo/page.tsx#L31) | drift | Video placeholders are `hidden lg:block` — the mobile demo page loses two of three visual anchors | Show them below the copy on mobile, or drop them from the layout entirely | A |
| [layout.tsx:33](apps/landing/app/layout.tsx#L33) | copy-FR | `new Date().getFullYear()` in a statically exported page — frozen at build year | Harmless now, will read `2026` in 2027. Hardcode or rebuild annually | A |

---

## 2. `apps/web` — the clinic dashboard

### 2.1 Blockers — these make the product look fake

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [session.ts:18-48](apps/web/src/lib/queries/session.ts#L18-L48) | **dead-end (R5)** | Any `/me` failure → hardcoded fake session. `RequireAuth`'s 401 branch is unreachable; a logged-out visitor sees *Dr Claire Fontaine*'s clinic; the « Impossible de charger votre session » state can never render | Delete the fallback. Let the error propagate — `RequireAuth` already handles 401 → `/login` and non-401 → retry card, correctly | C |
| [settings.ts (whole file)](apps/web/src/lib/queries/settings.ts) | **dead-end (R4)** | Clinic profile, AI config, staff and invites all read/write `localStorage`. « Enregistrer » shows a success alert and persists nothing to the server | Needs **API work first**: `PATCH /clinics/:id`, `GET /staff`, `DELETE /staff/:id`, `DELETE /staff-invites/:id` do not exist. Contract in `packages/shared` + `docs/api/auth.md`, then wire the queries. This is a sprint task, not a polish fix | C |
| [settings.ts:226-228](apps/web/src/lib/queries/settings.ts#L226-L228) | **dead-end** | Stripe checkout failure falls back to redirecting to `?checkout=success`, and [SubscriptionSettings.tsx:34-42](apps/web/src/pages/settings/SubscriptionSettings.tsx#L34-L42) then writes a fake `ACTIVE` subscription to localStorage and congratulates the user | Delete both. A failed checkout must say « Impossible de démarrer la session de paiement. Veuillez réessayer. » — never fake a payment | C |
| [settings.ts:246](apps/web/src/lib/queries/settings.ts#L246) | **dead-end** | Portal failure redirects to `https://billing.stripe.com/p/session/mock_<random>` — a fabricated Stripe URL that 404s on Stripe's domain | Delete the fallback; surface the existing French error | C |
| [App.tsx:51-86](apps/web/src/App.tsx#L51-L86) | **dead-end** | **No catch-all route.** `/nimportequoi` renders a blank white page — no 404, no nav, no way back | `<Route path="*" element={…}/>` → « Page introuvable » + « Retour au tableau de bord ». Same fix in `apps/owner` | C |
| [Header.tsx](apps/web/src/components/layout/Header.tsx) + repo-wide | **dead-end** | **There is no logout anywhere in the product.** `grep -rn "logout\|signOut\|Déconnexion"` across `apps/web`, `apps/owner`, `packages/ui` returns nothing. The avatar at [Header.tsx:22-24](apps/web/src/components/layout/Header.tsx#L22-L24) is a decorative `<div>`, not a menu | User menu on the avatar: clinic name, « Paramètres », « Déconnexion » → `POST /api/v1/auth/sign-out` (endpoint exists, `docs/api/auth.md:13`) | C |
| [App.tsx:66](apps/web/src/App.tsx#L66) | **dead-end** | `/` — the first screen after login — is a `PlaceholderPage` whose CTA reads « **Nouvelle action** » and has no `onClick` | Either a real dashboard, or an honest holding screen: « Tableau de bord — Vos indicateurs arriveront prochainement. » with real links to « Boîte de réception » and « Rendez-vous ». Remove the dead button | A (layout) / C (links) |
| [Header.tsx:19-21](apps/web/src/components/layout/Header.tsx#L19-L21) | **dead-end** | Bell / « Notifications » button with no handler. Notification centre is v2 (`docs/11` backlog) | Remove it until v2. A visible control that does nothing costs more trust than a missing one | A |
| [App.tsx:56](apps/web/src/App.tsx#L56) | drift | `/sample` → `SampleDesignPage`, a design-scratchpad route shipped in the production bundle, publicly reachable, no auth | Delete the route and the file | C |

### 2.2 Raw English enums reaching the screen (all → R2)

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [AppointmentForm.tsx:125-127](apps/web/src/pages/appointments/components/AppointmentForm.tsx#L125-L127) | **copy-EN** | Status `<select>` renders `SCHEDULED`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `DONE` | Planifié / Confirmé / Annulé / Non présenté / Terminé — the exact map already exists 40 lines away in [AppointmentStatusBadge.tsx:5-9](apps/web/src/pages/appointments/components/AppointmentStatusBadge.tsx#L5-L9). Promote it to `packages/shared` | C |
| [AiSettings.tsx:259](apps/web/src/pages/settings/AiSettings.tsx#L259) | **copy-EN** | « Seul le propriétaire du cabinet (CLINIC_OWNER) est autorisé… » | Drop the parenthetical. « Seul le propriétaire du cabinet peut modifier la configuration de l'assistant. » | A |
| [ProfileSettings.tsx:165](apps/web/src/pages/settings/ProfileSettings.tsx#L165) | **copy-EN** | Same `(CLINIC_OWNER)` leak | « Seul le propriétaire du cabinet peut modifier ces informations. » | A |
| [PatientDetailPage.tsx:89](apps/web/src/pages/patients/PatientDetailPage.tsx#L89) | **copy-EN** | « Opt-out (STOP WhatsApp) » | « Désabonnement WhatsApp » — value « Oui »/« Non » stays | A |
| [PatientListPage.tsx:123](apps/web/src/pages/patients/PatientListPage.tsx#L123), [PatientDetailPage.tsx:86](apps/web/src/pages/patients/PatientDetailPage.tsx#L86) | copy-FR | `source === 'MANUAL' ? 'Manuel' : 'Système'` — the real other value is `WHATSAPP_INBOUND` | « Saisie manuelle » / « WhatsApp » — from the shared label map, not a ternary | C |
| [MessageBubble.tsx:54-58](apps/web/src/pages/inbox/MessageBubble.tsx#L54-L58) | **dead-end + a11y** | Delivery status is icon-only with no label, and a `FAILED` message offers **no way to resend** | `aria-label` per state (« Envoyé », « Distribué », « Lu », « Échec »); on `FAILED` show « Échec de l'envoi — Réessayer » | C |

### 2.3 Missing / dead states

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [PatientListPage.tsx:95-99](apps/web/src/pages/patients/PatientListPage.tsx#L95-L99) | **dead-end** | « Aucun patient trouvé. » is shown both for *no results* and for *a brand-new clinic with zero patients* — and offers no action either way | Split: with a filter → « Aucun patient ne correspond à votre recherche. » + « Effacer les filtres ». Empty base → « Votre base patients est vide. » + « Ajouter un patient ». Use `EmptyState` from `@zenvy/ui` | C |
| [PatientListPage.tsx:89-94](apps/web/src/pages/patients/PatientListPage.tsx#L89-L94) | **dead-end** | Error text says « Veuillez réessayer. » with no retry control | Add a « Réessayer » button calling `refetch()` | C |
| [ThreadList.tsx:53-56](apps/web/src/pages/inbox/ThreadList.tsx#L53-L56) | **dead-end** | « Erreur de chargement » — bare text, no retry, not the `EmptyState` component | « Impossible de charger les conversations. » + « Réessayer » | C |
| [MessageList.tsx:30-36](apps/web/src/pages/inbox/MessageList.tsx#L30-L36) | **dead-end** | Error state, no retry | Add « Réessayer » | C |
| [ConversationView.tsx:30-38](apps/web/src/pages/inbox/ConversationView.tsx#L30-L38) | **dead-end** | Error state, no retry; also conflates a 500 with a 404 (« Elle a peut-être été supprimée ») | Split 404 vs error; add « Réessayer » on error | C |
| [ConversationView.tsx:65,74,87](apps/web/src/pages/inbox/ConversationView.tsx#L65) | **dead-end** | Takeover / release / archive mutations have **no error branch**. A failed « Prendre la main » looks like nothing happened | `onError` → « Impossible de prendre la main. Veuillez réessayer. » on all three | C |
| [SendBox.tsx:24-29](apps/web/src/pages/inbox/SendBox.tsx#L24-L29) | **dead-end** | Send failure is silent — the message just stays in the box with no explanation | « Message non envoyé. Réessayer. » inline under the field | C |
| [Step2WhatsApp.tsx:30-34](apps/web/src/pages/onboarding/Step2WhatsApp.tsx#L30-L34) | **dead-end** | `catch { console.error(err) }`. « Demander la connexion » failing does **nothing visible** — the user is stuck mid-onboarding with no message | Alert: « Impossible d'envoyer la demande. Veuillez réessayer ou nous contacter. » | C |
| [Step2WhatsApp.tsx:24-26](apps/web/src/pages/onboarding/Step2WhatsApp.tsx#L24-L26) | **dead-end (R4)** | « Demander la connexion » writes `onboardingStatus: 'IN_PROGRESS'` to localStorage. **No request ever reaches the founder.** The owner portal's onboarding queue will never see this clinic | Must hit a real endpoint. `POST /ops/onboarding-requests` does not exist (only `GET`/`PATCH` — [ops.controller](apps/api/src/ops)). Needs API work | C |
| [Step3AiConfig.tsx:79-93](apps/web/src/pages/onboarding/Step3AiConfig.tsx#L79-L93) | **dead-end (R4)** | « Terminer la configuration » marks onboarding `COMPLETED` in localStorage only. Clear the browser cache → the clinic is thrown back to step 1 | Same as R4 | C |
| [Step1/2/3](apps/web/src/pages/onboarding/) | **dead-end** | The 3-step wizard has **no back link** on any step and no visual stepper — only the text « Étape N sur 3 » | « ← Étape précédente » on steps 2 and 3, plus a 3-dot progress indicator | A |
| [AiSettings.tsx:41-46](apps/web/src/pages/settings/AiSettings.tsx#L41-L46) | **dead-end** | `useState(aiConfig.services \|\| [defaults])` initialises **once, before `me` resolves**, so the services list can show the hardcoded demo defaults instead of the clinic's saved values | Derive from query data, or key the component on `clinic.id`. Silent data-loss risk: the user saves what they see | C |
| [SubscriptionSettings.tsx:83-89](apps/web/src/pages/settings/SubscriptionSettings.tsx#L83-L89) | **dead-end** | « Aucun abonnement trouvé pour ce cabinet. » — terminal, no action | Add « Contacter le support » | A |
| [StaffSettings.tsx:106-114](apps/web/src/pages/settings/StaffSettings.tsx#L106-L114) | **dead-end** | Staff-load error, no retry | Add « Réessayer » | C |
| [PatientDetailPage.tsx:123-133](apps/web/src/pages/patients/PatientDetailPage.tsx#L123-L133) | **dead-end** | « Derniers rendez-vous — Les rendez-vous seront disponibles prochainement. » **Appointments shipped in S2/S3.** Stale placeholder on the patient record | Show the patient's real appointments, or at minimum « Voir les rendez-vous de ce patient » → `/appointments` | C |
| [AppointmentForm.tsx:21,56-59](apps/web/src/pages/appointments/components/AppointmentForm.tsx#L21) | **dead-end** | Patient `<select>` is empty for a clinic with no patients — no way to create one from here. Also `limit: 100` **silently truncates**: a clinic with 300 patients cannot select the other 200 | Empty case → « Aucun patient. Créez-en un d'abord. » + link. Replace the capped select with a searchable field backed by `?search=` | C |
| [AppointmentDetailPage.tsx:21-30](apps/web/src/pages/appointments/AppointmentDetailPage.tsx#L21-L30) | **dead-end** | A 500 renders « Rendez-vous introuvable » — wrong diagnosis, and the user retries nothing | Split 404 vs error (the pattern in `PatientDetailPage` is correct — copy it) | C |
| [AppointmentDetailPage.tsx:34-39](apps/web/src/pages/appointments/AppointmentDetailPage.tsx#L34-L39), [PatientDetailPage.tsx:43-48](apps/web/src/pages/patients/PatientDetailPage.tsx#L43-L48) | **dead-end** | Delete mutations have no `onError`. A failed delete looks like a successful one | « Impossible de supprimer. Veuillez réessayer. » | C |
| [AppointmentListPage.tsx:46](apps/web/src/pages/appointments/AppointmentListPage.tsx#L46) | drift | Retry is `window.location.reload()` — a full page reload as an error affordance | `refetch()` | C |
| [ThreadList.tsx:57-60](apps/web/src/pages/inbox/ThreadList.tsx#L57-L60) | copy-FR | « Aucune conversation trouvée. » in the *Archives* tab too, where nothing was searched | Filtered → « Aucune conversation archivée. » Unfiltered → « Aucune conversation pour l'instant. Elles apparaîtront ici dès qu'un patient vous écrira. » | A |

### 2.4 Accessibility (UX ruleset priority 1–2, and design-system §5/§7)

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [StaffSettings.tsx:120-127](apps/web/src/pages/settings/StaffSettings.tsx#L120-L127) | drift | `bg-destructive/5 text-destructive-foreground` — `--destructive-foreground` is **white**, on a near-white background. « Accès refusé » is invisible | `text-destructive`. Fails WCAG AA outright (§5 anti-pattern « Low contrast text ») | A |
| [button.tsx:8](packages/ui/src/components/button.tsx#L8) | drift | Base `Button` has **no `cursor-pointer`** — design-system §5 lists this as an explicit anti-pattern. Three screens patch it inline ([SubscriptionSettings:248](apps/web/src/pages/settings/SubscriptionSettings.tsx#L248), [StaffSettings:226](apps/web/src/pages/settings/StaffSettings.tsx#L226), …), proving the gap | Add `cursor-pointer` to `buttonVariants` base. One line, kills every inline patch | A |
| [AppointmentListPage.tsx:59-70](apps/web/src/pages/appointments/AppointmentListPage.tsx#L59-L70) | drift | List/calendar view toggle: icon-only, no `aria-label`, no `aria-pressed`, no tooltip | `aria-label="Vue liste"` / `"Vue calendrier"` + `aria-pressed` | C |
| [SendBox.tsx:63-69](apps/web/src/pages/inbox/SendBox.tsx#L63-L69), [ConversationView.tsx:84-92](apps/web/src/pages/inbox/ConversationView.tsx#L84-L92) | drift | Icon-only Send / Archive buttons with no accessible name (`title` is not a substitute) | `aria-label="Envoyer"` / `aria-label="Archiver la conversation"` | C |
| [StaffSettings.tsx:220-229,272-281](apps/web/src/pages/settings/StaffSettings.tsx#L220-L229) | drift | Icon-only remove/revoke buttons use `title` only | Add `aria-label` | C |
| [ThreadList.tsx:76-83](apps/web/src/pages/inbox/ThreadList.tsx#L76-L83) | drift | Thread buttons have no `focus-visible` ring and no `aria-current` on the active thread | `focus-visible:ring-2 focus-visible:ring-ring` + `aria-current="true"` | A |
| [PatientForm.tsx:66-118](apps/web/src/pages/patients/components/PatientForm.tsx#L66-L118) | drift | Field errors are plain `<p>` — no `role="alert"`, no `aria-invalid`, no `aria-describedby`. Screen readers never announce them (UX ruleset: **High**) | Wire all three. `FormMessage` in `@zenvy/ui` already does this — this form bypasses it | A |
| [AppointmentCalendarLite.tsx:20](apps/web/src/pages/appointments/components/AppointmentCalendarLite.tsx#L20) | drift | `grid-cols-7` with no breakpoint — unusable at 375 px. Design system checklist requires 375 px | Stack to a day list below `md` | A |
| [PatientForm.tsx:113-115](apps/web/src/pages/patients/components/PatientForm.tsx#L113-L115) | drift | Free-text « Notes » (2 000 chars per the schema) uses a single-line `<Input>` | `<textarea>` | A |

### 2.5 Design-system drift

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [PatientDetailPage.tsx:54](apps/web/src/pages/patients/PatientDetailPage.tsx#L54) | drift → R1 | Back arrow flashes **red** on hover (`hover:bg-accent`) | R1 | A |
| [SubscriptionSettings.tsx:104,136,141,146,151,163,171,178,211,258](apps/web/src/pages/settings/SubscriptionSettings.tsx#L104) | drift → R3 | ~20 raw colours: `green-50/100/500/600/800`, `blue-50/100/200/600/800/900`, `red-*`, `amber-500`, `slate-50/100/200/800` | R3 — needs `--success`, `--info`, `--warning` tokens | A |
| [AiSettings.tsx:104](apps/web/src/pages/settings/AiSettings.tsx#L104), [Step3AiConfig.tsx:106](apps/web/src/pages/onboarding/Step3AiConfig.tsx#L106) | drift → R3 | `text-indigo-500 fill-indigo-100` — indigo is not in the palette at all | R3 | A |
| [AiSettings.tsx:114](apps/web/src/pages/settings/AiSettings.tsx#L114), [ProfileSettings.tsx:83](apps/web/src/pages/settings/ProfileSettings.tsx#L83), [StaffSettings.tsx:150](apps/web/src/pages/settings/StaffSettings.tsx#L150), [VerifyEmailPage.tsx:119,168](apps/web/src/pages/auth/VerifyEmailPage.tsx#L119), [ResetPasswordPage.tsx:130,228](apps/web/src/pages/auth/ResetPasswordPage.tsx#L130) | drift → R3 | Seven success alerts, all `green-*` | R3 | A |
| [MessageBubble.tsx:57](apps/web/src/pages/inbox/MessageBubble.tsx#L57), [AppointmentReminderList.tsx:19](apps/web/src/pages/appointments/components/AppointmentReminderList.tsx#L19) | drift → R3 | `text-blue-400`, `text-green-500` | R3 | A |
| [AiSettings.tsx:148,190](apps/web/src/pages/settings/AiSettings.tsx#L148), [Step3AiConfig.tsx:140,177](apps/web/src/pages/onboarding/Step3AiConfig.tsx#L140) | drift | `hover:bg-slate-200/300` raw | `hover:bg-muted` | A |
| [Step1/2/3](apps/web/src/pages/onboarding/), [SampleDesignPage.tsx:22](apps/web/src/SampleDesignPage.tsx#L22) | drift → R6 | `shadow-lg`, `shadow-sm` on the onboarding cards | R6 | A |
| [AppointmentForm.tsx:52,122](apps/web/src/pages/appointments/components/AppointmentForm.tsx#L52), [ProfileSettings.tsx:127](apps/web/src/pages/settings/ProfileSettings.tsx#L127), [OnboardingPage.tsx:124](apps/owner/src/pages/OnboardingPage.tsx#L124) | drift | Four hand-rolled `<select>` elements, each duplicating ~15 shadcn classes, one carrying `shadow-sm` | One `Select` in `@zenvy/ui`. Third copy-paste means it belongs in the package | A |
| [PatientDetailPage.tsx:42](apps/web/src/pages/patients/PatientDetailPage.tsx#L42), [AppointmentDetailPage.tsx:33](apps/web/src/pages/appointments/AppointmentDetailPage.tsx#L33), [StaffSettings.tsx:79,89](apps/web/src/pages/settings/StaffSettings.tsx#L79) | drift | Four native `window.confirm()` and two `window.alert()` for destructive actions — OS chrome, off-brand, unstyleable. `alert()` on a €399/month product is the single loudest premium-bar violation in the app | A shared `ConfirmDialog` in `@zenvy/ui` | A |

### 2.6 Copy & French typography

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [AiSettings.tsx:238](apps/web/src/pages/settings/AiSettings.tsx#L238), [Step3AiConfig.tsx:219](apps/web/src/pages/onboarding/Step3AiConfig.tsx#L219) | **copy-FR (bug)** | `placeholder="Q: … ?\nR: Oui…"` — in a double-quoted JSX string `\n` is a **literal backslash-n**, so the user reads `…handicapé ?\nR: Oui…` | Use a template literal, or a real newline | A |
| [AiSettings.tsx:105](apps/web/src/pages/settings/AiSettings.tsx#L105), [Step3AiConfig.tsx:107](apps/web/src/pages/onboarding/Step3AiConfig.tsx#L107) | copy-FR | « Configuration de l'Assistant IA » — English title case | « Configuration de l'assistant IA » | A |
| [AppointmentDetailPage.tsx:126](apps/web/src/pages/appointments/AppointmentDetailPage.tsx#L126) | copy-FR | « Suivi et Rappels » | « Suivi et rappels » | A |
| [SampleDesignPage.tsx:15](apps/web/src/SampleDesignPage.tsx#L15) | copy-FR | « Système de Design ZenvyDental » | Moot — delete the page (§2.1) | C |
| repo-wide (1 exception: [Sidebar.tsx:39](apps/web/src/components/layout/Sidebar.tsx#L39)) | copy-FR | French requires a narrow NBSP before `? ! : ; %` and inside `« »`. **Exactly one string in the entire product does this.** Everything else is `Anglo-spaced` | Systematic pass with `&#8239;`. This is the difference between "translated" and "French" to a Paris dentist | A |
| repo-wide | copy-FR | Straight apostrophes `'` dominate; typographic `’` appears only in a handful of newer strings (e.g. [Sidebar.tsx:39](apps/web/src/components/layout/Sidebar.tsx#L39), [RegisterPage.tsx:65](apps/web/src/pages/auth/RegisterPage.tsx#L65)) | Normalise to `’` everywhere | A |
| [PatientListPage.tsx:144](apps/web/src/pages/patients/PatientListPage.tsx#L144), [AppointmentListPage.tsx:158](apps/web/src/pages/appointments/AppointmentListPage.tsx#L158), [ThreadList.tsx:136](apps/web/src/pages/inbox/ThreadList.tsx#L136) | copy-FR | « Charger plus » ×3 — a calque of *Load more* | **D6** — « Afficher plus », one shared string | A |
| [ThreadList.tsx:35,43](apps/web/src/pages/inbox/ThreadList.tsx#L35) | copy-FR | Filter « Actifs » / « Archives » — wrong gender agreement (*conversations*) | **D4** — « En cours » / « Archivées » | A |
| [RegisterPage.tsx:108](apps/web/src/pages/auth/RegisterPage.tsx#L108) | copy-FR | Placeholder « Dr. Dupont » | « Dr Dupont » | A |
| [SubscriptionSettings.tsx:172](apps/web/src/pages/settings/SubscriptionSettings.tsx#L172) | copy-FR | « par mois / cabinet (TVA non incluse) » | « 399 € HT / mois / cabinet » — « HT » is the standard French B2B form | A |
| [MessageBubble.tsx:12](apps/web/src/pages/inbox/MessageBubble.tsx#L12), [ThreadList.tsx:69](apps/web/src/pages/inbox/ThreadList.tsx#L69) | copy-FR | Timestamps render `HH:mm` only — a message from three weeks ago reads « 10:14 » | Today → `HH:mm`; this week → « lun. 10:14 »; older → « 12 juil. » | C |

---

## 3. `apps/owner` — the founder ops portal

| file:line | category | current | proposed FR copy or fix | owner |
|---|---|---|---|---|
| [App.tsx:22-30](apps/owner/src/App.tsx#L22-L30) | **dead-end** | **No auth guard and no login page anywhere in the app.** A non-`SUPER_ADMIN` (or logged-out) visitor gets four screens all reading « Impossible de charger… », with no explanation and no way to sign in | 401 → a login route; 403 → « Accès réservé à l'équipe ZenvyDental. » The API enforces the role server-side, so this is UX, not a data leak — but it is a total dead end | C |
| [App.tsx:22-30](apps/owner/src/App.tsx#L22-L30) | **dead-end** | No catch-all route → blank shell on any unknown URL | `<Route path="*">` → « Page introuvable » + « Retour aux clients » | C |
| [App.tsx](apps/owner/src/App.tsx) | **dead-end** | No `ErrorBoundary`. `apps/web` has a good one ([ErrorBoundary.tsx](apps/web/src/components/layout/ErrorBoundary.tsx)) — a render crash here is a white screen | Promote `ErrorBoundary` to `@zenvy/ui` and wrap `OwnerLayout` | C |
| [OwnerLayout.tsx](apps/owner/src/components/layout/OwnerLayout.tsx) | **dead-end** | No logout, no signed-in identity, no support link anywhere in the shell | Same user menu as `apps/web` | C |
| [ClientsPage.tsx:62,67,68](apps/owner/src/pages/ClientsPage.tsx#L62) | **copy-EN → R2** | Badges render raw `PENDING` / `IN_PROGRESS` / `COMPLETED`, `TRIALING` / `ACTIVE` / `PAST_DUE` / `CANCELED`, `PREMIUM` | En attente / En cours / Terminé · Essai / Actif / Impayé / Résilié · Premium | C |
| [OnboardingPage.tsx:53-55](apps/owner/src/pages/OnboardingPage.tsx#L53-L55) | **copy-EN → R2** | Status badge renders raw enum | En attente / Appel programmé / Terminé / Annulé | C |
| [OnboardingPage.tsx:128-131](apps/owner/src/pages/OnboardingPage.tsx#L128-L131) | **copy-EN → R2** | The status `<select>` options are literally `PENDING`, `CALL_SCHEDULED`, `DONE`, `CANCELLED` | Same French labels; keep the enum as the `value` | C |
| [SupportThreadsPage.tsx:54-56](apps/owner/src/pages/SupportThreadsPage.tsx#L54-L56) | **copy-EN → R2** | `OPEN` / `CLOSED` badge | « Ouvert » / « Résolu » | C |
| [ErrorsPage.tsx:74-76](apps/owner/src/pages/ErrorsPage.tsx#L74-L76) | **copy-EN → R2** | `INFO` / `WARN` / `ERROR` / `FATAL` | Info / Avertissement / Erreur / Critique | C |
| [ErrorsPage.tsx:132](apps/owner/src/pages/ErrorsPage.tsx#L132) | **copy-EN (bug)** | `format(new Date(…), 'dd MMM yyyy HH:mm:ss')` — **`{ locale: fr }` omitted**, so the modal renders « 08 Aug 2026 » while the table beside it renders « 08 août 2026 » | Add `{ locale: fr }` | C |
| [ErrorsPage.tsx:154](apps/owner/src/pages/ErrorsPage.tsx#L154) | copy-EN | Heading « Stack Trace » | **D3** — « Trace d'appels ». No technical-term carve-out; the owner portal holds the same French bar as the clinic app | C |
| [ErrorsPage.tsx:70,124](apps/owner/src/pages/ErrorsPage.tsx#L70) | copy-FR | `N/A` | « — » or « Non renseigné » | C |
| [SupportThreadsPage.tsx:37,79,121](apps/owner/src/pages/SupportThreadsPage.tsx#L37) | copy-FR | « Aucun thread », « Aucun thread sélectionné », « Thread introuvable » — *thread* is English | **D3** — « Aucune conversation », « Sélectionnez une conversation pour l'afficher », « Conversation introuvable » | C |
| [SupportThreadsPage.tsx:13](apps/owner/src/pages/SupportThreadsPage.tsx#L13) | **dead-end** | Query destructures `isLoading` only, **no `isError`** — a failed list renders the « Aucun thread » empty state. The founder sees "no support requests" when the API is down | Add an error branch with « Réessayer » | C |
| [SupportThreadsPage.tsx:91,121](apps/owner/src/pages/SupportThreadsPage.tsx#L91) | **dead-end** | Same: no `isError`; a 500 reads « Thread introuvable » | Split error vs 404 | C |
| [SupportThreadsPage.tsx:96-103](apps/owner/src/pages/SupportThreadsPage.tsx#L96-L103) | **dead-end** | Reply mutation has no `onError` — a failed reply to a paying client vanishes silently | « Message non envoyé. Réessayer. » | C |
| [SupportThreadsPage.tsx:105-112](apps/owner/src/pages/SupportThreadsPage.tsx#L105-L112) | **dead-end** | Status mutation, same silent failure | Same | C |
| [SupportThreadsPage.tsx:46](apps/owner/src/pages/SupportThreadsPage.tsx#L46) | drift | `focus:outline-none` with **no replacement** on the thread buttons — the design system's §5 anti-pattern verbatim, and the keyboard user's only navigation cue | `focus-visible:ring-2 focus-visible:ring-ring` | A |
| [OnboardingPage.tsx:95-102](apps/owner/src/pages/OnboardingPage.tsx#L95-L102) | **dead-end** | Save mutation has no `onError`. « Enregistrer » on a failure re-enables the button and says nothing | « Impossible d'enregistrer. Veuillez réessayer. » | C |
| [OnboardingPage.tsx:92](apps/owner/src/pages/OnboardingPage.tsx#L92) | **dead-end (bug)** | `new Date(scheduledCallAt).toISOString().slice(0,16)` feeds a **UTC** string into a `datetime-local` input, which interprets it as local — a call scheduled at 14:00 Paris displays as 12:00, and re-saving shifts it again each time | Format in local time before binding | C |
| [ErrorsPage.tsx:58-62](apps/owner/src/pages/ErrorsPage.tsx#L58-L62) | drift | Row opens the detail modal via `onClick` on a bare `<TableRow>` — mouse-only, no keyboard, no focus. **This is S1-8 finding #2 reintroduced** | Make the message cell a real `<button>`, or add `role="button" tabIndex={0} onKeyDown` | C |
| [ErrorsPage.tsx:106](apps/owner/src/pages/ErrorsPage.tsx#L106), [OnboardingPage.tsx:114](apps/owner/src/pages/OnboardingPage.tsx#L114) | **dead-end** | Both modals: no `Escape` to close, no backdrop click, no focus trap, no `role="dialog"`/`aria-modal`. A keyboard user who opens one is trapped | One `Dialog` in `@zenvy/ui` (Radix is already a dependency via shadcn) | A |
| [ErrorsPage.tsx:110](apps/owner/src/pages/ErrorsPage.tsx#L110), [OnboardingPage.tsx:118](apps/owner/src/pages/OnboardingPage.tsx#L118) | drift | Icon-only close buttons, no `aria-label` | `aria-label="Fermer"` | C |
| [ErrorsPage.tsx:114,162](apps/owner/src/pages/ErrorsPage.tsx#L114), [SupportThreadsPage.tsx:120-121](apps/owner/src/pages/SupportThreadsPage.tsx#L120-L121) | drift | Bare `<div>Chargement...</div>` instead of the exported `Spinner`; bare text instead of `EmptyState` | Use `@zenvy/ui` | C |
| [ClientsPage.tsx:37](apps/owner/src/pages/ClientsPage.tsx#L37), [ErrorsPage.tsx:40](apps/owner/src/pages/ErrorsPage.tsx#L40), [OnboardingPage.tsx:30](apps/owner/src/pages/OnboardingPage.tsx#L30) | **dead-end** | Three error states titled « Erreur » with no retry action | « Réessayer » on all three | C |
| [ClientsPage.tsx:39](apps/owner/src/pages/ClientsPage.tsx#L39) | copy-FR | « Aucun client trouvé pour cette recherche. » shows even with an empty search box | Split no-results from no-data, as in §2.3 | C |
| [ClientsPage.tsx:76](apps/owner/src/pages/ClientsPage.tsx#L76) | drift → R3 | `bg-green-100 text-green-800` for the WhatsApp badge | R3 | A |
| [ClientsPage.tsx:19,57,58](apps/owner/src/pages/ClientsPage.tsx#L19) + all owner pages | drift | `text-slate-900/700/600/500/400`, `bg-white`, `bg-slate-50/100/200` used throughout instead of `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`. `apps/web` uses tokens; `apps/owner` largely does not | Token pass across the four pages + layout | A |
| [ErrorsPage.tsx:107](apps/owner/src/pages/ErrorsPage.tsx#L107), [OnboardingPage.tsx:115](apps/owner/src/pages/OnboardingPage.tsx#L115), [SupportThreadsPage.tsx:132](apps/owner/src/pages/SupportThreadsPage.tsx#L132) | drift → R6 | `shadow-xl`, `shadow-sm` | R6 | A |
| [OwnerLayout.tsx](apps/owner/src/components/layout/OwnerLayout.tsx) | drift | Fixed `w-64` sidebar, no responsive treatment, no `<nav aria-label>` | Desktop-only is a defensible call for an internal tool — but state it in `docs/12`, don't leave it implicit. **Question 7 below** | A |
| [OwnerLayout.tsx:18](apps/owner/src/components/layout/OwnerLayout.tsx#L18) | copy-FR | « Zenvy Admin » | « Zenvy Ops » — matches `index.html`'s `<title>ZenvyDental — Ops</title>` and the wording in `docs/11` | A |
| [OnboardingPage.tsx:122,135,143](apps/owner/src/pages/OnboardingPage.tsx#L122) | drift | Three `<Label>` with no `htmlFor`, and the controls have no `id` — labels are not programmatically associated (UX ruleset: **High**) | Pair `htmlFor`/`id` | C |
| [index.css](apps/owner/src/index.css) | drift | Re-declares the `@layer base` block that `@zenvy/ui/theme.css` already provides (both are imported in [main.tsx](apps/owner/src/main.tsx)) | Delete the file; keep the theme import | C |

---

## 4. Structural

| item | category | current | proposed fix | owner |
|---|---|---|---|---|
| all three apps | drift → R7 | `docs/07` §Language mandates per-app `strings/` modules. None exists; ~600 strings are inline. That is why « Charger plus » is duplicated three times and one concept has three wordings | Introduce `apps/*/src/strings/` as part of the S4-7 copy pass — doing the copy fixes inline would bake the problem in | A + C |
| [docs/design/design-system.md](docs/design/design-system.md) §2 | drift | The palette has no success / info / warning tokens, so 22 sites invent their own greens and blues (R3); and `--accent` is defined as identical to `--destructive` (R1), which the shadcn `hover:bg-accent` idiom then weaponises | Add `--success`, `--info`, `--warning`; give `--accent` its own value. Update the doc in the same PR (`CLAUDE.md` rule 5) | A |

---

## 5. Counts

| Category | Count |
|---|---|
| `copy-EN` — English in user-visible copy | 14 |
| `copy-FR` — wording, register, French typography | 22 |
| `dead-end` — no way forward | 38 |
| `drift` — design-system violation | 22 |
| **Total** | **96** |

Blocking for a paid launch, in order: **R5** (fake session), **R4** (fake settings + fake Stripe success — now doubly blocking under **D1**, since self-serve signup routes every new clinic through the onboarding wizard that persists nothing), the missing **logout**, the **placeholder WhatsApp number** on the demo CTA, and the **English 404** two footer links away from every page.

### Open, still needs a founder call

- **`apps/owner` responsiveness** — fixed `w-64` sidebar, no breakpoints, unusable under ~768 px. Defensible as desktop-only for a single-user internal tool, but it should be a recorded decision in `docs/12`, not an accident.
- **Legal pages** — `/mentions-legales` and `/confidentialite` need real RGPD content before launch. Content is yours to write; the routes are Antigravity's to build.

## 6. Deliberately not in scope

- Search debounce on `PatientListPage` / `ClientsPage` (perf, carried over from S1-8).
- Web bundle > 500 kB (pre-existing; code-splitting is its own task).
- `apps/landing` hero three.js weight — flagged only for `prefers-reduced-motion`, not for replacement.
