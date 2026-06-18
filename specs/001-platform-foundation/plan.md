# Implementation Plan: Platform Foundation

**Branch**: `001-platform-foundation` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-platform-foundation/spec.md`

## Summary

Establish the skeleton every other feature builds on: Google SSO with 30-day (and
shared-device short) sessions, the RTL app shell + Jerusalem Stone design system, the
marketing homepage, a basic profile (name, email, language, theme, multiple phones), the
Hebrew-date + holidays header widget, and self-service account+data deletion. Technical
approach (per constitution v1.1.0 + [docs/architecture.md](../../docs/architecture.md)): a
**pnpm + Turborepo monorepo** with a **frontend app** (Vite React SPA + TanStack Router/Query
on Workers Static Assets) and a **backend app** (layered Hono API), wired via a **Service
Binding**, sharing Zod contracts in `packages/shared`; better-auth (Google + D1 sessions),
Drizzle ORM over D1, react-i18next + Tailwind v4 logical properties, structured Workers-native
logging, and server-side Jewish-calendar computation. See [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (strict), React 18+, **Node 20 LTS** toolchain

**Primary Dependencies**: pnpm + Turborepo (monorepo); Vite + `@cloudflare/vite-plugin`;
React + **TanStack Router** + **TanStack Query**; **Hono** + `@hono/zod-openapi` +
`@hono/swagger-ui`; `better-auth` (Google + D1 adapter); Drizzle ORM + drizzle-kit;
react-i18next + i18next; Tailwind CSS v4; Zod (shared contracts); **email/password via
better-auth** + a transactional email provider (Resend, recommended — research D16);
`kosher-zmanim` (LGPL — server-side only, pending legal sign-off; see research D7)

**Storage**: Cloudflare D1 (SQLite) for users/sessions/accounts/phones; Workers KV optional
for ephemeral data; localStorage for client theme/language cache

**Testing**: `@cloudflare/vitest-pool-workers` (Worker unit/integration); Playwright +
`@axe-core/playwright` (e2e + WCAG 2.1 AA)

**Target Platform**: Cloudflare Workers (edge runtime) + browser (mobile-first, ≥375 px)

**Project Type**: Web application — two-app monorepo (frontend Worker + backend Worker via
Service Binding) + `packages/shared`

**Performance Goals**: API p95 < 200 ms globally (constitution IV); landing→signed-in < 30 s
(SC-001); language/theme switch < 1 s (SC-006/SC-008)

**Constraints**: WCAG 2.1 AA (hard gate, enforced in CI); Hebrew-first RTL; API returns error
**codes** not localized strings; strict **CSP** + **self-hosted fonts** (GDPR); native
**rate limiting** on auth/writes; **per-env** D1 + OAuth client + secrets; ≥30-day sessions;
no calendar/zmanim library bytes shipped to the client; D1 has no interactive transactions
(use `batch`) and FK **cascade must be verified** on D1

**Scale/Scope**: Foundation only — ~6 user stories, a handful of API routes, ~5 D1 tables

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Hebrew-First & RTL | ✅ PASS | react-i18next + Tailwind logical properties; default Hebrew; RTL-tested |
| II. Accessibility (AA, non-negotiable) | ✅ PASS | axe-core gate enforced by **GitHub Actions** on PRs; AA-corrected tokens; reduced-motion; decorative globe `aria-hidden`; SPA route-change announcements + skip-link |
| III. Mobile-First | ✅ PASS | 375 px first; ≥44 px targets; responsive split→single column |
| IV. Edge-First Performance | ✅ PASS | Workers + D1; session cookie cache limits D1 reads; calendar computed at edge |
| V. Simplicity / YAGNI | ✅ PASS (deps justified) | better-auth/Drizzle/Hono/react-i18next each replace substantial hand-rolled code; no speculative abstractions |

**Post-Phase-1 re-check**: ✅ no new violations. One **non-architectural risk** (not a gate
violation): the calendar/zmanim library license (D7) — mitigated by server-only use + legal
sign-off before ship.

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 (decisions D1–D16)
├── data-model.md        # Phase 1 (entities + schema)
├── quickstart.md        # Phase 1 (setup + validation)
├── contracts/           # Phase 1 (API contracts)
│   └── api.md
└── checklists/
    └── requirements.md  # Spec quality (passing)
```

### Source Code (monorepo root) — see [docs/architecture.md](../../docs/architecture.md)

```text
apps/frontend/              # React SPA (Vite) on Workers Static Assets
├── src/
│   ├── routes/             # TanStack Router (home, dashboard shell, profile)
│   ├── components/         # base/shared components, app shell, theme toggle, lang switcher
│   ├── features/           # feature-scoped UI + hooks
│   ├── lib/                # api client, TanStack Query client, auth client
│   ├── i18n/               # he/en resources (no hard-coded strings)
│   └── theme/              # token CSS vars, no-flash script, ThemeProvider
├── public/                 # prerendered marketing homepage HTML
└── wrangler.jsonc          # Service Binding → backend

apps/backend/               # layered Hono API on Workers (private, behind Service Binding)
├── src/
│   ├── routes/             # router layer (@hono/zod-openapi)
│   ├── controllers/        # I/O mapping
│   ├── services/           # business logic
│   ├── repositories/       # Drizzle data access (use db.batch)
│   ├── middleware/         # auth, security, rate-limit, error, request-id
│   ├── db/{schema,client}.ts
│   ├── lib/{logger,errors,calendar}.ts   # calendar = server-side kosher-zmanim
│   └── openapi/            # OpenAPI doc + Swagger UI
├── migrations/             # drizzle-kit generated SQL (applied via wrangler)
└── wrangler.jsonc

packages/shared/            # Zod schemas + inferred types + error shapes + constants (SSOT)

tests/  (per app)           # vitest-pool-workers (backend), Vitest+Testing Library (frontend),
                            # Playwright + axe-core (e2e + WCAG AA)
pnpm-workspace.yaml · turbo.json · drizzle.config.ts · tailwind v4 css
```

**Structure Decision**: Two deployable Workers — a public **frontend** (SPA + static) and a
private **backend** (Hono API) reached via a **Service Binding** (first-party cookies, no
CORS) — plus `packages/shared` as the single source of truth for payload contracts. Per
constitution v1.1.0; rationale in [docs/adr/](../../docs/adr/).

## Complexity Tracking

No constitution gate violations require justification. Dependency choices are recorded in
[research.md](./research.md) with rationale; each replaces materially more hand-rolled code
than it costs (auth/session/revocation, ORM/migrations, i18n, routing).

One tracked risk (not a complexity violation): **calendar/zmanim library licensing (D7)** —
use `kosher-zmanim` (LGPL) server-side only, obtain legal sign-off, fall back to the Hebcal
REST API (CC BY, with attribution) if required.
