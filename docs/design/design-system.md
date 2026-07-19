# Design System Master File

> **LOGIC:** This document defines the exact tokens, Tailwind setup, shadcn theme, and motion language used across ZenvyDental.
> ZenvyDental follows a premium SaaS aesthetic similar to Stripe, Linear, or Notion.

---

**Project:** ZenvyDental
**Generated:** 2026-07-19
**Category:** Premium SaaS (Dashboard & Landing)

---

## 1. Style Guidelines

**Style:** Flat Design / Minimalist
**Keywords:** 2D, minimalist, bold colors, no shadows, clean lines, simple shapes, typography-focused, modern, icon-heavy.
**Best For:** Web apps, SaaS dashboards, patient-facing tools.
**Key Effects:** No gradients/shadows (flat), simple hover (color/opacity shift), fast loading, clean transitions (150-200ms ease), minimal icons.

## 2. Color Palette (shadcn theme tokens)

| Role | Hex | Tailwind Variable |
|------|-----|--------------|
| Primary | `#1E293B` (Slate 800) | `bg-primary` / `text-primary` |
| On Primary | `#FFFFFF` | `text-primary-foreground` |
| Secondary | `#334155` (Slate 700) | `bg-secondary` |
| Accent/CTA | `#DC2626` (Red 600) | `bg-accent` |
| Background | `#F8FAFC` (Slate 50) | `bg-background` |
| Foreground | `#0F172A` (Slate 900) | `text-foreground` |
| Muted | `#E9EDF1` | `bg-muted` |
| Border | `#E2E8F0` (Slate 200) | `border-border` |
| Destructive | `#DC2626` (Red 600) | `bg-destructive` |
| Ring | `#1E293B` (Slate 800) | `ring-ring` |

*Notes: The default dark mode should not be enabled by default. The design heavily relies on whitespace and the premium contrast of Slate 800 against Slate 50.*

## 3. Typography

- **Primary Font:** DM Sans (provides the Satoshi / General Sans look)
- **Mood:** premium, modern, clean, sophisticated, versatile, balanced.
- **Rules:** 
  - Use `font-sans` for everything.
  - Large headings (`text-3xl`, `text-4xl`), strong font weights (`font-semibold`, `font-bold`).
  - Readability is key (base `16px`).

## 4. Motion Language (Framer Motion)

ZenvyDental uses **Framer Motion** for React transitions. Keep them subtle and fast.

- **Duration:** 150ms – 200ms for UI interactions.
- **Easing:** `easeOut` or `easeInOut`.
- **Guidelines:** Do not use decorative-only animation. Do not animate width/height when it causes layout shift. Respect `prefers-reduced-motion`.

## 5. Anti-Patterns (Do NOT Use)

- ❌ **Excessive animation**
- ❌ **Emojis as icons** — Use `lucide-react` icons.
- ❌ **Missing cursor:pointer** — All clickable elements must have `cursor-pointer`.
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout.
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio (WCAG AA).
- ❌ **Instant state changes** — Always use transitions (150-300ms) for hover/focus.

## 6. Architecture (Packages)

All UI configuration lives in the `@zenvy/ui` workspace package (`packages/ui`).
Apps (`landing`, `web`, `owner`) consume the Tailwind config preset, CSS variables, and shared components from this package.

## 7. Pre-Delivery Checklist

Before delivering any UI code, verify:
- [ ] No emojis used as icons (use `lucide-react` instead).
- [ ] Light mode text contrast 4.5:1 minimum.
- [ ] Focus states visible for keyboard navigation.
- [ ] `prefers-reduced-motion` respected (handled by Tailwind/Framer).
- [ ] Responsive behavior working down to 375px.
- [ ] Empty states and Loading states are present.
- [ ] All user-facing strings are in French (no inline English).
