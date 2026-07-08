<!-- SPECKIT START -->
No active feature plan — 001–005 + 007–009 are complete (merged to `develop`, deployed to dev,
CI/CD via Workers Builds); 006 Admin is specified (`specs/006-admin/`) but not yet built. Start the
next feature with `/speckit-specify` (remaining v1: 006 Admin + import steps 2–4, see below and
`specs/ROADMAP.md`). 003 introduced the generic `event` (type=`minyan`) model (ROADMAP
decision 10). 004 added folders (`stay.folder_id` FK ON DELETE SET NULL = "Unfiled") + a History view
(amended 002 FR-005/011, D1). 005 added per-Shabbat zmanim (candle-lighting + Havdalah) computed
server-side, detail-scoped (`GET /api/stays/:id/zmanim`, `GET /api/events/:id/zmanim`) + a
`user.havdalah_opinion` preference; see `specs/005-stay-zmanim/` + ADR 0007 (kosher-zmanim
server-side containment). Post-005 contact-visibility change (ADR 0008; migration 0006): contact is
reachable BEFORE joining — a new `RosterMinyanDTO` tier shows a minyan's roster + phones (of sharers)
to any signed-in viewer; the discovery travelers list shows name + phone (sharers); a `user.share_phone`
opt-out (default ON) gates phone everywhere; exact address/coords/entry-notes/email stay committed-only;
signed-out = pure public. This REVISES 003 SC-005/FR-011 + ROADMAP decision 9 (see those + ADR 0008).
NOTE: schema changes ship per feature — the remote dev D1 must be migrated on deploy
(`pnpm db:migrate:remote`); CI/Workers Builds do NOT auto-migrate. Post-005 **"Heritage Voyage"
design refresh** (branch `design/heritage-voyage`; see `design/DESIGN-SYSTEM.md` top section):
forest-green primary + terracotta accent + parchment surface + Hanken-Grotesk/Assistant fonts
(tokens.css is SoT; fonts self-hosted as woff2 in `apps/frontend/public/fonts/`, no Google hotlinking); redesigned My-Stays card (MapTiler
map-thumbnail header, one minyan-status line, `⋮` menu, collapsible zmanim, current-stay "here now"
emphasis); folder **pinning** (`folder.pinned`, migration 0007) drives a scrolling pinned-folder
quick-filter. Amends 002 FR-005a + 004 FR-004a. The Heritage-Voyage refresh continued post-007 with
a **minyan-detail redesign** (green hero + quorum progress + readiness checklist + prominent
organizer card + entrance animations) and a **forms polish pass** (primary CTAs unified to green —
terracotta is accent/destructive only; `--faint` bumped to 4.95:1 for AA; input focus rings →
primary; LocationPicker + auth + profile). See `design/DESIGN-SYSTEM.md`.

007 **phone onboarding** (`specs/007-phone-onboarding/`): a soft, one-time post-login nudge routes a
user with no phone to `/profile?onboarding=phone` (focused field + banner); frontend-only, respects
`share_phone`. 008 **in-app messaging** (`specs/008-in-app-messaging/` + ADR 0009; migration 0008):
`message` table + `user.accept_messages` opt-out; any signed-in user → any other, rate-limited
(20/5min); routes `POST/GET /api/messages`, `GET /api/messages/:userId`; `/messages` inbox+thread,
header envelope, "Message" on the minyan roster. 009 **seed import + claim** (`specs/009-seed-import-claim/`
+ ADR 0010; migration 0009): `user.kind` ('real'|'seed'); seed users (synthetic email, no account)
own visible stays/events; a real user whose profile phone matches claims+merges them
(`GET/POST /api/me/claims`, server re-verifies the match) then the seed is deleted; seed contact is
hidden in discovery until claimed (revises ADR 0008 for seeds). The **dev-only import tool**
(`tools/seed-import/`) is staged inspect→map→gate→create; **step 1 (CSV→profile.json) is built**,
steps 2–4 pending a row-semantics decision from a real sheet. Amends 002 FR-005a + 004 FR-004a.
Product decomposition & shared decisions: `specs/ROADMAP.md`. Design system: `design/DESIGN-SYSTEM.md`.

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
Latest migrations: 0008 (`message` table + `user.accept_messages`), 0009 (`user.kind`). A dev-only
import tool lives outside the workspace at `tools/seed-import/` (Node built-ins, `node --test`).
Decisions: docs/adr/ (through 0010). No active plan — 001–005 + 007–009 shipped; 006 Admin specified.
<!-- SPECKIT END -->
