<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
New constitution — initial ratification.

Added sections:
  - Core Principles (5 principles)
  - Tech Stack Constraints
  - Branching & Development Workflow
  - Governance

Templates reviewed:
  - .specify/templates/plan-template.md  ✅ aligned (no changes needed)
  - .specify/templates/spec-template.md  ✅ aligned (no changes needed)
  - .specify/templates/tasks-template.md ✅ aligned (no changes needed)

Deferred TODOs:
  - RATIFICATION_DATE set to today (2026-06-17); no prior date exists.
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

- **Frontend**: React (latest stable) — no meta-framework lock-in unless justified in
  a feature spec.
- **Server / API**: Cloudflare Workers (edge runtime, no Node.js APIs).
- **Database**: Cloudflare D1 (SQLite). Cloudflare KV for ephemeral / session data.
- **Hosting / CDN**: Cloudflare Pages for static assets; Workers for API routes.
- **Styling**: Tailwind CSS with RTL plugin enabled.
- **Language**: TypeScript throughout — `strict` mode, no `any` escapes without comment.

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

**Version**: 1.0.0 | **Ratified**: 2026-06-17 | **Last Amended**: 2026-06-17
