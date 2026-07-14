# Testing strategy & plan

The single source of truth for **what we test, where it runs, and which suite is mandatory**. It is
descriptive of what exists today (verified against the tree) and prescriptive about the tiered
execution model and the "every change ships with tests" policy.

Related: `CLAUDE.md` (per-feature notes), each `specs/0XX-*/quickstart.md` (manual acceptance steps),
`tools/dev-seed/README.md` (throwaway local data).

---

## 1. Test layers

| Layer | Location | Framework | Command | Volume (approx.) |
| --- | --- | --- | --- | --- |
| Backend API / integration | `apps/backend/test/*.test.ts` | `@cloudflare/vitest-pool-workers` (Miniflare + real D1, real better-auth, real HTTP via `SELF.fetch`) | `pnpm --filter @minyanim/backend test` | 51 files |
| Backend unit / lib | same dir (e.g. `zmanim-lib`, `timezone`, `imageMeta`, `migration-*`) | Vitest | same as above | included above |
| Frontend unit / component | `apps/frontend/src/**/*.test.tsx` | Vitest + jsdom + Testing Library | `pnpm --filter @minyanim/frontend test` | ~24 files |
| E2E + accessibility | `apps/frontend/e2e/*.spec.ts` | Playwright (real backend Worker + Vite) + `axe-core` WCAG 2.1 AA | `pnpm --filter @minyanim/frontend test:e2e` | 13 specs |
| Import tools | `tools/seed-import`, `tools/places-import` | `node --test` | per tool | ~15 cases |

Aggregate commands (Turborepo): `pnpm typecheck`, `pnpm lint`, `pnpm test`.

**How the backend suite gets a database:** `test/apply-migrations.ts` calls `applyD1Migrations` into an
**isolated per-file D1** (vitest-pool-workers), so every test file starts from a fresh, fully-migrated
schema. Test env disables email verification + rate limiting and mocks geocoding (`GEO_MODE=mock`).

> Local run caveat (known): running the **entire** backend suite in one process can exhaust ports
> (`EADDRNOTAVAIL`) on macOS. Run it in small batches locally; CI (fresh Linux runner) runs it whole.

---

## 2. Execution model — mandatory vs. full (the plan)

Two tiers. **Tier A is mandatory and gates merges. Tier B is the exhaustive sweep**, run after we cut a
build to the dev environment and on a nightly schedule.

### Tier A — Mandatory (every push & PR; blocks merge)
Fast, deterministic, no external services. Must stay under a few minutes.

1. `pnpm typecheck` — all packages.
2. `pnpm lint`.
3. `pnpm test` — **all** backend integration + unit + frontend component tests. These are the primary
   correctness net; they are fast because they run in-process against Miniflare.
4. **Smoke e2e** — a tagged subset (`@smoke`) covering the critical path only: sign in → create a stay →
   host a minyan → a second user joins → discovery shows it. One project (desktop), with axe on the
   pages it visits.

### Tier B — Full (on deploy-to-dev + nightly `schedule`)
Everything Tier A runs, **plus**:

1. **Full Playwright suite** across both projects (desktop 1280×900 + mobile 375×812), with the axe
   WCAG-AA gate on every visited page.
2. **Seed-based flows** — the seed-import claim path (feature 009), driven from `tools/dev-seed/seed-claim.mjs`
   data (see §4). This is the only tier that exercises the **seed** user type end to end.
3. **Post-deploy smoke against remote dev** — a read-only health + discovery check against the deployed
   dev Worker after `pnpm db:migrate:remote` + Workers Build.

### Current CI vs. this plan
`.github/workflows/ci.yml` today runs **two jobs on every PR/push to `main`/`develop`**: `check`
(typecheck + lint + `pnpm test`) and `e2e` (migrate local D1 → full Playwright + axe). That is, the
**full** e2e already runs on every PR. The plan's change is to **split it**: keep `check` + `@smoke` e2e
mandatory on PRs, and move the *full* cross-project e2e + seed flows to a **deploy** trigger and a
**nightly `schedule:`** workflow. Skeleton:

```yaml
# .github/workflows/ci.yml (mandatory) — PRs & pushes
on: { pull_request: {}, push: { branches: [main, develop] } }
# jobs: check (typecheck+lint+test)  +  e2e-smoke (playwright --grep @smoke)

# .github/workflows/e2e-full.yml (full) — nightly + after dev deploy
on:
  schedule: [{ cron: "0 3 * * *" }]
  workflow_dispatch: {}
  workflow_run: { workflows: ["Deploy dev"], types: [completed] }
# job: playwright (all projects) + seed-claim flow
```

To tag smoke tests, mark the critical specs `test('...', { tag: '@smoke' }, ...)` and run
`playwright test --grep @smoke`.

---

## 3. Coverage by domain × user-type × flow

User types the suite must cover: **regular** (signed-in), **host** (owns an event), **guest**
(joins), **admin** (env-gated via `ADMIN_EMAILS`), **seed** (imported, no login — claim only).

| Domain | Mandatory (backend) | Full (e2e flow) | User types |
| --- | --- | --- | --- |
| Auth / session | `auth`, `me`, `config`, `redirect` | `auth.spec`, `shell.spec` | regular |
| Profile / phones | `me`, `profile-havdalah`, `minyan-contacts` | `profile.spec` | regular |
| Stays (CRUD, scope, history) | `stays`, `stay-scope`, `stay-permanent`, `stay-cascade`, `stay-history-pagination` | `stays.spec` | regular |
| Stay ↔ minyan guard (013) | `linked-minyanim` ✅ (new), `commitment` (D12 reconcile) | `stays-guard.spec` | host, guest |
| Host reassignment (013) | `host-transfer` ✅ (new) | `host-transfer-notify.spec` | host, guest |
| Events — minyan / gathering / hosting (014) | `events`, `event-edit-cancel`, `event-cascade`, `social-gathering`, `role` | `multi-type-events.spec` | host, guest |
| Attendance / RSVP / capacity | `attendance-flow`, `attendance-capacity`, `attendance-dto`, `commitment` | `gathering-rsvp.spec` ✅ (UI request→approve→address reveal + axe) + `multi-type-events.spec` (API) | host, guest |
| Discovery | `discovery`, `discovery-kinds`, `near-stay` | `discovery.spec` | regular, seed (hidden contact) |
| Folders / history | `folder`, `folder-cascade` | `folders-history.spec` | regular |
| Notifications | `notification`, `minyan-nearby-notify` | (asserted in host-transfer) | host, guest |
| Messaging (008) | `message` | `messaging.spec` ✅ (UI send/receive across two contexts + inbox + axe) | regular |
| Admin / moderation (006) | `admin-guard`, `admin-places`, `moderation-admin`, `moderation-events`, `metrics`, `flag` | `admin.spec` | admin |
| Places / layers (010/011) | `places`, `migration-0012` | `places.spec` | regular, admin |
| Media (012) | `media`, `imageMeta` | (galleries within stays/events specs) | regular |
| Zmanim / calendar | `stay-zmanim`, `minyan-zmanim`, `zmanim-lib`, `calendar` (lib **+ route** ✅ new) | `zmanim.spec` | regular |
| Location holds events (015) | (via stays/events services) | `location-events.spec` ✅ — events list on edit + count chip on card + add→KindPicker | regular (host) |
| Seed import & claim (009) | `claim`, `discovery-kinds`; `tools/seed-import` unit | `claim.spec` ✅ — seed (wrangler-flipped) → ClaimBanner → merge | seed + regular (claimer) |

✅ = added/closed by the current change.

---

## 4. Test users & seed data

**Backend tests** — no shared fixture module by design; each file inlines a `signIn()` that signs up +
signs in with a **unique random email** (`u-${crypto.randomUUID()}@example.com`). Seed users are inserted
directly via Drizzle (`claim.test.ts` → `seedUser(e164)`: `kind='seed'`, synthetic `@seed.local` email,
**no `account` row** so better-auth can never authenticate it). The "two users, same phone" claim setup
lives here: a real user adds a phone via `POST /api/me/phones`, a `seedUser` owns the same E.164, and
`/api/me/claims` matches on that equality.

**E2E** — the suite does **not** use `dev-seed`. Each spec does its own **per-test signup** (a unique
`u-${Date.now()}-…@example.com`) so it starts from zero, and seeds its domain data either through the UI
form or directly via the API request context (`/api/events`, `/api/stays`, `/api/admin/*`). Multi-actor
tests open a separate `request.newContext()` per actor for independent cookies. The only fixed identity
is the admin: `admin-e2e@example.com`, promoted because `playwright.config.ts` sets `ADMIN_EMAILS` to it.
(`tools/dev-seed/seed.mjs` is a separate **manual** local tool, not wired into the automated suite.)

**Seed-user claim (feature 009) — same-phone pair for manual/scripted testing:**
`tools/dev-seed/seed-claim.mjs` reproduces the claim scenario in a running local dev environment:

- It builds a **seed** user's data (a stay + a hosted minyan + a phone) through the real API, then flips
  that user to `kind='seed'` and removes its login (`account`/`session`) with two schema-stable SQL
  statements via `wrangler d1 execute` — the only step that needs direct D1 access, hence **local by
  default** (`--remote` opt-in for dev).
- It builds a real **claimer** (`claimer@test.local`) carrying the **same phone**.
- Signing in as the claimer surfaces the dashboard `ClaimBanner`; confirming merges the seed's stay +
  minyan into the account and deletes the seed.

```sh
# 1) start a local backend (see tools/dev-seed/README.md for the flags) and migrate local D1
pnpm --filter @minyanim/backend run db:migrate:local
# 2) create the seed + same-phone claimer
node tools/dev-seed/seed-claim.mjs               # optional: --phone +972521234567
# 3) sign in as claimer@test.local / password123 → claim the offered seed
```

---

## 5. Test data & cleanup

Cleanup is **structural, not teardown-based** — tests isolate their own data so nothing needs deleting:

- **Backend:** each test *file* gets a fresh isolated D1 (migrations re-applied per file); the pool tears
  it down automatically. Within a file, unique random emails/ids prevent collisions. A pnpm patch
  (`patches/@cloudflare__vitest-pool-workers@0.5.41.patch`) fixes a WAL-sidecar teardown crash; `retry: 2`
  covers other transients. **No manual cleanup required and none should be added.**
- **E2E:** in CI the local D1 is created fresh before the run (`db:migrate:local`) and the servers start
  clean (`reuseExistingServer: false` when `CI`). **Locally** `reuseExistingServer: true` reuses a running
  backend, so repeated local runs *accumulate* data — reset with:
  `rm -rf apps/backend/.wrangler/state && pnpm --filter @minyanim/backend run db:migrate:local`.
- **dev-seed / seed-claim:** throwaway local data. `seed-claim.mjs` uses a random email for the seed
  source so re-runs never collide; each run adds another claimable seed. Reset the same way as e2e above.

**Rule for new tests:** self-isolating data only (unique ids or the isolated per-file DB); no shared
mutable fixtures; no dependence on test execution order.

---

## 6. Policy — every change ships with tests

For any new or changed behavior:

- **New/changed API endpoint** → a backend integration test covering **authz (401/403/404), the happy
  path, and at least one validation/error path**. (This is the standard the new `host-transfer`,
  `linked-minyanim`, and `calendar` route tests follow.)
- **New user-facing flow** → an e2e spec; tag it `@smoke` only if it is on the critical path. Every e2e
  page visit keeps the axe WCAG-AA gate green.
- **New/changed shared Zod contract** → the type flows through backend + frontend typecheck; add/extend
  the i18n `parity.test.ts` when strings change.
- **New DB migration** → a `migration-XXXX.test.ts` when it transforms existing rows (see `migration-0004`,
  `migration-0012`).
- **New user type or role** → extend the §3 matrix and the seed/dev-seed users as needed.

PR checklist: `pnpm typecheck && pnpm lint && pnpm test` green locally; new endpoints/flows have the
coverage above; the §3 matrix updated.

---

## 7. Gaps (verified)

Each item below was checked against the tree, not assumed.

- **G1 — CLOSED by this change.** `POST /api/events/:id/transfer-host`, `GET /api/stays/:id/linked-minyanim`
  + `POST /api/stays/:id/unlink-minyanim`, and the `GET /api/calendar/today` **route** had no backend
  test (only the calendar *lib* and an indirect e2e existed). Added `test/host-transfer.test.ts`,
  `test/linked-minyanim.test.ts`, and route cases appended to `test/calendar.test.ts` — all passing.
- **G2 — Backend build is currently RED on this working tree.** `pnpm typecheck` fails
  (`apps/backend/src/repositories/discoveryRepository.ts` referencing `stay.bringsSeferTorah`, which the
  in-progress "location events" refactor + migration `0015_location_events.sql` removed from the Stay
  model). Consequence: `wrangler dev` cannot build, so the app can't boot and **e2e / the live
  seed-claim check can't run** until this compiles. *Verified via `pnpm typecheck`; these are uncommitted
  changes in progress, not part of this testing work.* Backend Vitest still passes because it transforms
  modules per-file (a missing named import becomes `undefined`) and Zod strips the now-unknown keys —
  another reason typecheck must stay in the mandatory tier.
- **G3 — CLOSED.** Added `e2e/claim.spec.ts` (feature 009): builds a seed via the API then flips it to
  `kind='seed'` with `wrangler d1 execute --local` (same mechanism as `seed-claim.mjs`), a claimer with
  the matching phone signs in, and the dashboard `ClaimBanner` merge is driven + asserted. Also added
  `e2e/location-events.spec.ts` (feature 015): the events-here list, the card count chip, and the
  add→KindPicker `fromStay` entry point. Both pass on the `desktop` project.
  Note: `claim.spec.ts` shells out to `wrangler` (cwd `apps/backend`) — it needs the local D1 the e2e
  backend runs on, which CI already migrates before the e2e job; it is a Tier-B (full) spec.
- **G4 — No mandatory/full tiering in CI yet.** Verified: `ci.yml` runs the full e2e on every PR. §2 is
  the proposed split; not yet implemented.
- **G5 — Local e2e data accumulation.** Verified via `reuseExistingServer: !CI` in
  `playwright.config.ts`. Mitigated by the reset command in §5; CI is unaffected.
