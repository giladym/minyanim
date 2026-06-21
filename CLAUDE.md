<!-- SPECKIT START -->
No active feature plan — 001 + 002 + 003 + 004 + 005 are complete (merged to `develop`, deployed to
dev, CI/CD via Workers Builds). Start the next feature with `/speckit-specify` (remaining v1: 006
Admin — see `specs/ROADMAP.md`). 003 introduced the generic `event` (type=`minyan`) model (ROADMAP
decision 10). 004 added folders (`stay.folder_id` FK ON DELETE SET NULL = "Unfiled") + a History view
(amended 002 FR-005/011, D1). 005 added per-Shabbat zmanim (candle-lighting + Havdalah) computed
server-side, detail-scoped (`GET /api/stays/:id/zmanim`, `GET /api/events/:id/zmanim`) + a
`user.havdalah_opinion` preference; see `specs/005-stay-zmanim/` + ADR 0007 (kosher-zmanim
server-side containment). NOTE: schema changes ship per feature — the remote dev D1 must be migrated
on deploy (`pnpm db:migrate:remote`); CI/Workers Builds do NOT auto-migrate. Product decomposition &
shared decisions: `specs/ROADMAP.md`. Design system: `design/DESIGN-SYSTEM.md`.

Architecture (constitution v1.1.0 + docs/architecture.md): **pnpm + Turborepo monorepo** —
`apps/frontend` (Vite React SPA + TanStack Router/Query on Workers Static Assets),
`apps/backend` (layered Hono: router→controller→service→repository), `packages/shared` (Zod
contracts = single source of truth). FE↔BE via **Service Binding** (first-party cookies, no
CORS). Stack: Cloudflare Workers + D1 (Drizzle; use `db.batch`, no interactive txns) + Tailwind
v4 logical properties, RTL/Hebrew-first. better-auth (Google SSO + email/password w/ verify+reset, account-linking by verified email;
D1 sessions; needs a transactional email provider — Resend rec., research D16). Contract-first:
`@hono/zod-openapi` + Swagger UI. Standards: i18n-only strings; tokens-only colors; secrets via
`env` bindings only (`.dev.vars`/`wrangler secret`, NOT `.env` — see docs/secrets.md);
structured logging via Workers Observability (**no Winston**); JSDoc on exports; KISS.
`kosher-zmanim` (LGPL) computed SERVER-SIDE ONLY (legal sign-off pending — never ship to
client). Tests: vitest-pool-workers, Vitest+Testing Library, Playwright + axe-core (WCAG AA).
Decisions: docs/adr/. No active plan — 001–005 shipped.
<!-- SPECKIT END -->
