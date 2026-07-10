<!-- SPECKIT START -->
Active plan: **012 Media uploads** (`specs/012-media-uploads/plan.md`) — one shared R2-backed pipeline
(`mediaService` + `storageRepository` over an `IMAGES` bucket; `POST/DELETE/GET /api/media`) for user
avatars (`user.image`), Stay/Minyan galleries (new `stay.images`/`event.images`, migration 0013) and
admin place photos (`place.images`). Parent-scoped keys `{kind}/{parentId}/{uuid}` drive authz + orphan
cleanup; magic-byte sniff + size cap + server-side EXIF/GPS strip (zero-dep); served via a
visibility-gated Worker route (hidden/contact-tier parents gate their images). Ready for `/speckit-tasks`.
**011 Beit Chabad → Places consolidation** is built
(`specs/011-beit-chabad-consolidation/`): the legacy `beit_chabad_pin` table + bespoke discovery overlay
are retired; the generic `place`/`layer` model (010) is the single source of truth for Chabad houses
(migration 0012 reconciles then drops the table). Discovery now sources Chabad houses (and any active
layer's places) via the generic `placesInBbox`/`PlaceDTO` path — `DiscoveryResult` dropped
`beitChabad`/`BeitChabadPinDTO` and gained `places: PlaceDTO[]` + `layers: LayerDTO[]`; the discovery map
renders per-layer toggles (mirroring the `/places` view). 001–010 are complete (merged to `develop`,
deployed to dev, CI/CD via Workers Builds). 006 **Admin** is built (`specs/006-admin/`): US1/US2 flag-with-reason +
auto-hide at 3 distinct reporters (#43); US3 moderation queue + user sanctions (warn/suspend/ban/
reinstate, FR-009 last-admin guard) + `assertUserActive` enforcement on create-stay/host-minyan/
commit; US5 metrics dashboard (`GET /api/admin/metrics` → counts + form→host→quorum funnel +
top locations). All moderation/metrics endpoints live on the existing `/api/admin/*` router behind
`requireAdmin`. US4 (Beit Chabad curation) is DELIVERED VIA 010's places manager — no 006 endpoint;
the destructive `beit_chabad_pin` retirement + discovery fold shipped in 011 (migration 0012). Migration
0011 (`flag` reshape to polymorphic `{contentType, contentId, reason, reportedUserId}` + `stay.hidden` +
`user.status`/`suspended_until`) shipped with #43. Start the next feature with `/speckit-specify`
(remaining v1: import steps 2–4 of feature 009, see below and `specs/ROADMAP.md`). 003 introduced the generic `event` (type=`minyan`) model (ROADMAP
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
steps 2–4 pending a row-semantics decision from a real sheet. 010 **kosher places & map layers**
(`specs/010-kosher-places/` + ADR 0011; migration 0010): a generic `place` model grouped by
**admin-managed `layer`**s; a reusable **admin foundation** (`user.is_admin`, `input:false`;
`requireAdmin` guard; first admin via the `ADMIN_EMAILS` env allowlist, idempotently promoted;
`/api/admin/*` + an `/admin` UI shell — 006 will extend it); a user **places view** (`GET /api/places`
bbox scan → accessible list + clustered MapLibre layer + Google Maps/Waze deep links, reachable from a
Stay's ⋮ menu); and a **dev-only OSM/Overpass importer** (`tools/places-import/`, staged → reviewable
`upsert.sql` applied via wrangler; idempotent on unique `(source, source_id)`). Additive: it COPIES
`beit_chabad_pin` into a "Chabad houses" layer; 011 then reconciled + dropped it (migration 0012) and
folded the discovery Chabad overlay into the generic places layer path.
Amends 002 FR-005a + 004 FR-004a. Product decomposition & shared decisions: `specs/ROADMAP.md`.
Design system: `design/DESIGN-SYSTEM.md`.

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
Latest migrations: 0009 (`user.kind`), 0010 (`place` + `layer` tables + `user.is_admin`), 0011 (006:
`flag` reshaped polymorphic + reason + reportedUser; `stay.hidden`; `user.status` + `suspended_until`),
0012 (011: reconcile `beit_chabad_pin` → `place` then DROP the table). Dev-only import tools live outside
the workspace: `tools/seed-import/` (009) + `tools/places-import/` (010) — Node built-ins, `node --test`.
Decisions: docs/adr/ (through 0011). 001–011 shipped; next v1 remainder: import steps 2–4 of feature 009.
<!-- SPECKIT END -->
