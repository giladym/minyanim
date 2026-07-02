<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0  (MINOR — new standards section + expanded tech stack)

Added:
  - Section "Architecture & Engineering Standards" (two-app monorepo, layered backend,
    shared package, contract-first, secrets policy, logging, error handling, comments, KISS)
Modified:
  - "Tech Stack Constraints" expanded: two-app split, TanStack, Hono, Drizzle, service
    binding, Tailwind v4. Detailed HOW + rationale recorded in docs/adr/.

Templates reviewed:
  - .specify/templates/plan-template.md  ✅ aligned
  - .specify/templates/spec-template.md  ✅ aligned
  - .specify/templates/tasks-template.md ✅ aligned

Companion docs (non-binding HOW / rationale):
  - docs/architecture.md, docs/adr/*, docs/secrets.md, docs/integrations/*

Prior report (1.0.0): initial ratification — Core Principles, Tech Stack, Branching,
Governance. RATIFICATION_DATE 2026-06-17.
-->

# Minyanim Constitution

## Core Principles

### I. Hebrew-First & RTL

All user-facing UI MUST render correctly in right-to-left (RTL) layout with Hebrew
as the primary language. English or other languages are secondary. Specifically:

- Every component MUST be tested in RTL mode before being considered complete.
- All strings MUST be externalized (i18n-ready) — no hard-coded display text in JSX.
- Layout MUST NOT rely on `left`/`right` CSS properties; use `start`/`end` logical
  properties or Tailwind's RTL utilities throughout.
- Typography MUST use a Hebrew-appropriate font stack with correct line-height and
  letter-spacing defaults.

### II. Accessibility (a11y — NON-NEGOTIABLE)

Every feature shipped MUST meet WCAG 2.1 AA conformance. This is a non-negotiable
gate, not a post-launch concern.

- All interactive elements MUST have accessible names (aria-label or visible text).
- Keyboard navigation MUST be fully functional — no mouse-only interactions.
- Color contrast ratios MUST meet 4.5:1 for normal text, 3:1 for large text.
- Focus indicators MUST be visible and not suppressed globally.
- Screen reader announcements MUST be verified for dynamic content (prayer time
  updates, location results).

### III. Mobile-First

Design and implement for mobile viewports first; desktop is an enhancement layer.

- All components MUST be built at the smallest breakpoint first, then scaled up.
- Touch targets MUST be ≥ 44×44 px.
- The app MUST be fully usable with one hand on a 375 px-wide screen.
- Network assumptions MUST be conservative: target functional experience at 3G speeds.

### IV. Edge-First Performance

All server-side logic MUST run on Cloudflare Workers (edge runtime). No traditional
origin servers.

- API response time MUST target < 200 ms p95 globally.
- All static assets MUST be served via Cloudflare CDN with appropriate cache headers.
- Database access MUST use Cloudflare D1 (SQLite at the edge); avoid patterns that
  require high-latency round trips.
- Cold-start overhead MUST NOT affect user-perceived latency — Workers are always warm.

### V. Simplicity & Maintainability (YAGNI)

Every dependency and abstraction MUST be justified by a concrete, present need.

- Prefer Cloudflare-native primitives (D1, KV, R2, Queues) over third-party services.
- No abstraction layers introduced speculatively — three similar lines of code are
  better than a premature helper.
- React state MUST live as close to its consumer as possible; global state requires
  explicit justification.
- A feature is not done until it can be deleted easily — avoid tight coupling.

## Tech Stack Constraints

The following stack is fixed for this project. Deviations require a constitution amendment.
Detailed rationale and alternatives live in `docs/adr/`.

- **Structure**: a **pnpm + Turborepo monorepo** with two deployable applications —
  `apps/frontend` and `apps/backend` — plus `packages/shared`.
- **Frontend**: React (latest stable) as a Vite SPA on **Cloudflare Workers Static Assets**;
  **TanStack Router** (routing) + **TanStack Query** (server-state/caching). No meta-framework
  (no TanStack Start / SSR framework) unless justified in a feature spec.
- **Backend / API**: **Hono** on Cloudflare Workers (edge runtime, no Node.js APIs).
- **FE↔BE wiring**: the frontend Worker calls the backend Worker via a **Service Binding**
  (same origin to the browser → first-party cookies, no CORS).
- **Database**: Cloudflare D1 (SQLite) via **Drizzle ORM** (use `db.batch` — D1 has no
  interactive transactions). Cloudflare KV for ephemeral data.
- **Styling**: **Tailwind CSS v4** with logical properties (RTL-first).
- **Language**: TypeScript throughout — `strict` mode, no `any` escapes without comment.

## Architecture & Engineering Standards

Binding standards for both applications. The "how" (specific config) lives in `docs/`.

- **Backend layering**: requests flow **router → controller → service → repository**
  (data access via Drizzle). Services hold business logic; controllers do I/O mapping;
  repositories isolate the ORM. Keep layers thin — do not add a layer a route does not need.
- **Contract-first**: request/response payloads are **Zod schemas in `packages/shared`** —
  the single source of truth. The backend exposes them via **`@hono/zod-openapi`** and serves
  **Swagger UI** (`@hono/swagger-ui`); the frontend imports the shared types directly.
- **Internationalization**: NO hard-coded user-facing strings — every string MUST come from
  the i18n layer (Hebrew primary). (Reinforces Principle I.)
- **Theming**: NO hard-coded colors — use design tokens / CSS variables only
  (see `design/DESIGN-SYSTEM.md`). Themes MUST be layered and extensible.
- **Secrets**: secrets are accessed only via the Worker **`env` binding** — `.dev.vars`
  locally, `wrangler secret put` / Secrets Store in production. Secrets MUST NOT live in
  `.env`, in `wrangler.jsonc` `[vars]`, or in client code. Frontend public config uses
  `VITE_`-prefixed `.env` values only (these are public). See `docs/secrets.md`.
- **Logging**: structured JSON via a shared logger util → Cloudflare Workers Logs /
  Observability (Logpush optional). **Winston/Node loggers are forbidden** (incompatible with
  the Workers runtime).
- **Error handling**: a centralized error handler + a typed application-error hierarchy;
  responses use the shared error schema. No swallowed errors; every error is logged with a
  request id.
- **Comments**: **JSDoc on exported symbols only**, concise — explain *why*, not *what*
  (types and good names carry the *what*). No long narration.
- **KISS**: prefer the simplest design that meets the need; let trivial endpoints stay thin.
- **Testing**: backend via `@cloudflare/vitest-pool-workers`; frontend via Vitest +
  Testing Library; e2e + the WCAG AA gate via Playwright + `@axe-core/playwright`.

## Branching & Development Workflow

- **`main`** — production-ready at all times. Direct commits are forbidden.
- **`develop`** — integration branch. All feature branches merge here first.
- **Feature branches** — named `###-short-description` (e.g., `001-minyan-finder`).
  Created from `develop`, merged back via PR with at least one review.
- **Hotfix branches** — named `hotfix/description`. Created from `main`, merged into
  both `main` and `develop`.
- PRs MUST pass all checks (type-check, lint, a11y audit) before merge.
- Squash-merge preferred to keep `develop` history readable.

## Governance

This constitution supersedes all other practices. Any change requires:

1. A PR that amends this file with a version bump and updated `Last Amended` date.
2. A brief rationale in the PR description.
3. At least one explicit approval.

All PRs and code reviews MUST verify compliance with the five core principles.
Complexity that violates a principle MUST be documented in the plan's Complexity
Tracking table with a justification.

**Version**: 1.1.0 | **Ratified**: 2026-06-17 | **Last Amended**: 2026-06-18
