<!-- SPECKIT START -->
**015 Location holds events** is built (design brainstorm → Option B; merged to `develop`): a Stay
(location/יעד) is a clean anchor carrying 0…N events instead of baking minyan fields in. Migration
0015 dropped `stay.prayer_needs` + `stay.brings_sefer_torah` (kept `num_men` as a light group size
that still feeds discovery "potential" — which now shows men-overlap only), and added a nullable
`event.stay_id` FK (ON DELETE SET NULL). The location edit page drops the prayer/Sefer-Torah sections,
relabels group-size, and shows an "האירועים שלי כאן" list + "＋ הוסף אירוע" → the shipped KindPicker
flow (fromStay → `event.stay_id`); events surface as a chip on the Stay card. `GET /api/stays/:id/events`
(owner) = hosted (`event.stay_id`) ∪ joined (`attendance.stay_id`) events as `MyEventRow[]`; the event
mutations invalidate `["stay-events"]` so the list/chip stay reactive. Shipped alongside three UX fixes
(#59): the Google-Maps deep link is coords-only (`query=lat,lng`, was a broken `(name)` suffix), the
homepage's fabricated "travelers this week" stat became an honest value tile, and `/places` defaults to
restaurants + shops on (others off).

**014 Multi-type events** is built (`specs/014-multi-type-events/`, merged to `develop`): the event
model is generalized to a two-axis design — **behavior** (`event.type` = `minyan` quorum | `gathering`
capacity+RSVP) + an extensible **category** (`hosting`|`social`|`learning`|`celebration`; NULL for
minyan; a fixed shared enum now with an admin-managed-later seam — research R1). Independent axes
`occasion`/`rsvp_mode`/`visibility`/`capacity` on every event. Migration 0014 replaces `commitment`
with a unified **`attendance`** table (status + party_size + requested_at), adds a `gathering` 1:1
detail (per-category `attrs` JSON via `ATTRS_BY_CATEGORY`) and new `event` columns (category/occasion/
rsvp_mode/visibility/capacity/start_time/end_time/rsvp_cutoff/title). **Hosting (אירוח)** = open your
table for a seudah: request→approve→waitlist, the exact address revealing ONLY on approval (guarded by
a 13-site confirmed-predicate audit — SC-003; capacity = confirmed party-size sum via guarded
single-statement writes, no overbook — SC-006). Flagship **minyan is byte-for-byte unchanged**
(SC-005): it's the `type='minyan'` branch of a two-entry per-behavior strategy (`lib/eventStrategy.ts`);
`/commit` stays a thin alias over the attendance service. Also shipped: **My-events**
(`GET /api/me/events`) + request-flow **emails**; discovery **kind/occasion filters** + distinct pins;
social gatherings; **edit/cancel** any type; a **Shabbat zmanim panel** on hosting detail (reuses the
005 event-zmanim, generalized for Friday-eve dinners; festivals deferred). Attendance lives on the
generic `/api/events/*` surface (`/attendance`, `/requests/:id/{approve,decline}`). User-facing kinds:
מניין / אירוח / מפגש. Deferred: festivals in the zmanim panel; the admin-managed category graduation.

**012 Media uploads** is built (`specs/012-media-uploads/`): one shared R2-backed
pipeline (`mediaService` + `storageRepository` over the `IMAGES` bucket; `POST/DELETE/GET /api/media`)
for user avatars (`user.image`), Stay/Minyan galleries (`stay.images`/`event.images`, migration 0013) and
admin place photos (`place.images`). Parent-scoped keys `{kind}/{parentId}/{uuid}` drive authz + orphan
cleanup; uploads are magic-byte-sniffed + size-capped + server-side EXIF/GPS-stripped (zero-dep
`lib/imageMeta`, + client `<canvas>` downscale); images are served via a visibility-gated Worker route
(a moderation-hidden minyan / a private stay gate their images). FE media components (`features/media/`:
`ImageUploader`/`Gallery`/`Avatar`) are **provider-free** (plain `lib/media` fns + local state). Needs a
one-time R2 bucket per env (`wrangler r2 bucket create`; dev = `minyanim-images-dev`).
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
0012 (011: reconcile `beit_chabad_pin` → `place` then DROP the table), 0013 (012: `stay.images` +
`event.images`), 0014 (014: `commitment` → unified `attendance`; new `gathering` detail table; `event`
axis columns category/occasion/rsvp_mode/visibility/capacity/start_time/end_time/rsvp_cutoff/title).
Object storage: R2 bucket `IMAGES` (012; dev `minyanim-images-dev`) holds uploaded image
bytes. Dev-only import tools live outside the workspace: `tools/seed-import/` (009) +
`tools/places-import/` (010) — Node built-ins, `node --test`. Decisions: docs/adr/ (through 0012).
0015 (015: drop `stay.prayer_needs`+`stay.brings_sefer_torah`, keep `num_men` as group size; add
`event.stay_id` FK linking events to a location). 001–015 shipped; next v1 remainder: import steps 2–4
of feature 009.
<!-- SPECKIT END -->
