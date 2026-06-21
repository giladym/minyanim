<!-- SPECKIT START -->
Active plan: `specs/004-folders-history/plan.md` (+ research.md, data-model.md,
contracts/api.md, quickstart.md). 001 + 002 + 003 are complete (merged to `develop`, deployed to
dev, CI/CD via Workers Builds). 003 introduced the generic `event` (type=`minyan`) model (ROADMAP
decision 10). 004 adds folders (`stay.folder_id` FK ON DELETE SET NULL = "Unfiled") + a History view
(past Stays move off the active dashboard — amends 002 FR-005/011, D1). Product decomposition &
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
Decisions: docs/adr/. Active plan: specs/004-folders-history/plan.md.
<!-- SPECKIT END -->
