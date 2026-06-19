# Phase 0 Research — Stays: Create & Manage

Date: 2026-06-19 · Builds on 001. Each entry: **Decision / Rationale / Alternatives**.
Updated 2026-06-19 after a two-role plan validation (architect + expert dev) — see
[Validation outcomes](#validation-outcomes-2026-06-19) at the end for the reconciliation log.

---

## D1. Map / geocoding provider — LICENSING DECISION ⚠️

**Decision**: **MapTiler** for forward-geocoding/autocomplete. Runs **server-side** behind
`GET /api/geo/search` with the geocoding key as a `wrangler secret`; results normalized to
`{ city, country, lat, lng, label }` and city/country/coordinates **persisted** on the Stay.
**Cached** with the Cloudflare **Cache API** (`caches.default`, key = normalized `q+lang`, ~24h
TTL) to control cost/quota. **Rate-limited** by reusing 001's `RATE_LIMITER` binding + middleware
(this is the first app-level rate-limited route) plus client-side debounce. Google Places is a
**documented revert option** (see below), **not** a hot runtime fallback.

**Rationale**: The decisive constraint is ToS permission to *store* resolved coordinates
long-term. MapTiler's terms permit it, fitting a schema where `lat`/`lng` are first-class
columns. Hebrew autocomplete supported (`language=he`, `country=il` bias). Server-side keeps the
key secret, normalizes provider output, and enables edge caching.

**Privacy** (egress): the search text is sent to MapTiler — so the form sends **only the city
search box** to the geocoder; the **`address_private` field is NEVER auto-geocoded**. Privacy
microcopy notes that the typed city is used for map search.

**Google as revert (not hot fallback)**: Google only allows storing a **Place ID** long-term
(lat/lng caching ~30 days), which would require a `place_id` column + ephemeral-coords + refresh
logic — a *different schema*. So Google is a re-plan/revert path if MapTiler fails ToS/quality,
not a drop-in fallback into the same columns. We do **not** add a `place_id` column now (YAGNI).

**Open confirmation** (spec Follow-up ⭐): create the MapTiler account/key and confirm the
storage clause before go-live; implement against a mockable provider (see D14) until the key
exists.

## D2. Client map renderer + tile key

**Decision**: **MapLibre GL JS** (OSS, no key lock-in) for the confirmation map; tiles from
MapTiler. The **tile key is public** (inherently shipped in tile URLs) — expose it as a
build-time **`VITE_MAPTILER_TILE_KEY`** (Vite `import.meta.env`, a `vars` value in the frontend
`wrangler.jsonc`, **not** a secret) and **restrict it by HTTP referrer** on the MapTiler account.
The secret **geocoding** key stays backend-only. Import MapLibre's CSS
(`maplibre-gl/dist/maplibre-gl.css`) or the map renders broken; lazy-load the map so it doesn't
bloat the dashboard route.

**Rationale**: The map is only confirmation (search-first UX); tile failures never block the
flow. Separating the public tile key from the secret geocoding key matches 001's secret rigor.

**CSP note**: 001 *planned* a strict CSP (research D11) but the SPA currently ships none. If/when
the strict CSP lands, MapLibre needs `worker-src blob:` + `child-src blob:` (it spawns blob Web
Workers) and `connect-src`/`img-src https://api.maptiler.com` (tiles, sprites, glyphs). Tracked
as a task so CSP hardening doesn't silently break the map.

**Alternatives**: Google Maps JS SDK (key lock-in + attribution coupling), Leaflet (weaker
vector/RTL) — rejected.

## D3. Coordinates → timezone + the "past date" authority

**Decision**: Resolve the destination's IANA timezone from coordinates using
**`@photostructure/tz-lookup`** (offline, embedded dataset, no `fs`/native deps — verified to run
on workerd; ~88KB, actively maintained / fresher zone boundaries than `tz-lookup`). The temporal
"arrival not in the past" check runs in the **service layer** against the **destination-local
civil date**. When a Stay has **no coordinates** (manual entry / geocode failure), the timezone
comes from a **client-supplied `X-Client-Timezone`** header (`Intl.DateTimeFormat().resolvedOptions().timeZone`),
falling back to a ±1-day tolerance only if even that is absent.

**Exact comparison algorithm** (no epoch subtraction — avoids the off-by-one this feature exists
to prevent):
- destination-local today = `new Intl.DateTimeFormat("en-CA", { timeZone: ianaTz, year:"numeric",
  month:"2-digit", day:"2-digit" }).format(new Date())` → `"YYYY-MM-DD"`.
- a stored date's civil date = same formatter with `timeZone:"UTC"` over the stored UTC-midnight
  epoch (D4).
- compare the two `YYYY-MM-DD` strings lexicographically (`arrivalCivil < todayCivil` ⇒
  `date.in_past`). `isPast` and `coversShabbat` use the same string/UTC-day logic. workerd's
  `Intl.DateTimeFormat` with `timeZone` is verified to work (V8/ICU).

**Rationale**: A stateless shared Zod schema cannot resolve a timezone, so the temporal check is
server-side (structural checks stay in Zod). Offline tz lookup = no per-request API/rate limit.
Using the client tz for no-coords cases is more correct than a blind ±1-day fuzz.

**Alternatives**: `tz-lookup` (works but stale DarkSky data), `geo-tz` (reads multi-MB GeoJSON
via `fs` — won't run on Workers), UTC-only compare (the boundary bug), trust browser only (server
must re-check). The earlier "swap to a KV/asset tz table" contingency is **dropped** — the lib
fits the Worker comfortably.

## D4. Date storage shape

**Decision**: Store `arrival_date`/`departure_date` as **date-only**, epoch-ms at **UTC midnight
of the civil date** (integer columns, consistent with 001). Compared only via the D3 civil-date
string algorithm, never numerically against `Date.now()`.

**Rationale**: Stays are day-granular; date-only removes time-of-day ambiguity.

**Alternatives**: full timestamps (false precision/TZ ambiguity), ISO text (loses index
efficiency) — rejected.

## D5. Stay status — stored vs derived

**Decision**: Persist `status ∈ {active, cancelled}` (free `text`, validated by a shared Zod
enum — not a DB CHECK). **"past" is derived** at read from `departure_date < destination-local
now` (D3); never stored. Cancelled rows are **retained as the referential anchor** Feature 003
commitments will reference.

**Rationale**: KISS, no cron/lazy-write; mirrors 001's calendar (derive, persist nothing).

**Note**: 004's "attended" tag is a **separate dimension/column**, not a `status` value; `status`
stays {active,cancelled} unless a genuine new lifecycle state appears.

**Alternatives**: store `past` + nightly Cron flip (infra + TZ burden); lazy flip on read (write
amplification) — rejected.

## D6. Prayer-needs storage

**Decision**: One **JSON column** (`prayer_needs`, Drizzle `text({mode:'json'}).$type<PrayerNeeds>()`)
typed by shared Zod `PrayerNeedsSchema`: `{ weekday: { shacharit, mincha, maariv } }`. Shabbat is
the always-on baseline (not stored). **Validate with `PrayerNeedsSchema.parse()` on both write and
read** (Drizzle's JSON round-trip is not schema-validated); default-fill missing booleans so old
rows never throw.

**Rationale**: Small set, never queried/filtered in 002 (filtering is 003 over Minyanim) — typed
JSON is the KISS fit, SSOT in `packages/shared`. Per-occurrence selection deferred (spec
Follow-up).

**Alternatives**: three boolean columns (rigid for 003), child table (overkill) — rejected.

## D7. Shabbat-default detection

**Decision**: A **civil-calendar heuristic** in a named shared/server helper
`coversShabbat(arrival, departure, tz)`: suggest Shabbat-on if any civil date in `[arrival,
departure]` is a Friday or Saturday in the destination tz (UTC-day of the stored midnight ∈
{5,6}). A suggested, override-able default — **not persisted**.

**Rationale**: "Covers a Friday–Saturday" is civil-date math once the tz is known; no zmanim
dependency, keeping 005 decoupled (ROADMAP: 005 parallel, not a dependency).

**Known coarseness**: date-only granularity can't tell that a Saturday-night (post-Havdalah)
arrival doesn't really "do" Shabbat — a tolerable false-positive for an override-able default.
**Feature 005 supersedes** this helper (same UI affordance) with precise candle-lighting/Havdalah
windows — the named signature is the seam 005 reimplements (no duplicate "has Shabbat" answer).

## D8. Owner vs Public serialization

**Decision**: Two shared-Zod DTOs from day one — **`OwnerStayDTO`** (includes `address_private`,
`contact_phone`, `contact_email`) and **`PublicStayDTO`** (those keys structurally absent). 002
emits Owner only; the controller pipes the repository row through `OwnerStayDTO.parse()` /
`PublicStayDTO.parse()` **before** `c.json()` so private fields can't leak even when responses are
built by hand. A test asserts a public response's `Object.keys()` excludes the private fields.

**Rationale**: Enforce non-exposure at the contract layer (SSOT) — pre-builds the 003 visibility
seam (ROADMAP §9). Best forward-compat decision in this plan.

**Alternatives**: single DTO with runtime field-stripping (one missed branch = leak) — rejected.

## D9. `folder_id` — deferred FK

**Decision**: Nullable **`folder_id text`**, **no FK** in 002. Feature 004 adds the FK
(`ON DELETE SET NULL` — a Stay outlives folder deletion) in its own migration.

**Rationale**: Satisfies FR-001's optional folder with zero coupling to a 004 table.

**Migration note**: SQLite/D1 **cannot add an FK to an existing column via `ALTER TABLE`** — 004's
FK addition is a **table-rebuild** (create-new → copy → drop → rename) that drizzle-kit generates;
it must be verified against the existing `user` cascade + `defer_foreign_keys`. Heavier than a
simple ALTER; flagged so 004 isn't surprised.

## D10. Listing — sort & pagination

**Decision**: `GET /api/stays` sorts **nearest-first server-side** (`WHERE user_id=? AND
status='active' ORDER BY arrival_date ASC`) on the `(user_id, arrival_date)` index. `status` is a
residual filter (fine at tens of rows); active-vs-**past** is computed in **app code** (derived
`isPast`, can't filter a tz-derived value in SQL). **No pagination in v1**; include past Stays
flagged.

**Rationale**: "Nearest" lives in one place; a traveler has tens of Stays. Add a partial index
`WHERE status='active'` / cursor pagination only if 004 history grows the table (deferred).

## D11. Migrations, cascade & testing

**Decision**: Generate the `stay` migration via `drizzle-kit generate` → `wrangler d1 migrations
apply` (001's single pipeline; the vitest harness auto-picks it up via
`readD1Migrations`/`applyD1Migrations`). Extend 001's **cascade-orphan** integration test to
`stay` (create user + stays → `deleteUser` → assert zero orphans — verify, don't assume D1
cascade). 002 has **no genuine multi-row atomic write** (all writes are single-row) — `db.batch`
applies only if a future multi-row write is added.

## D12. Contact: snapshot vs live reference

**Decision**: Pre-fill contact from `/api/me` (name + first phone) and **store the snapshot** on
the Stay; later profile edits don't mutate historical Stays. Contact phone/email inherit D8
(OwnerStayDTO only).

**Alternatives**: live-join at read (mutates history; couples rendering to profile) — rejected.

## D13. API routing & error shape — match the REAL 001 code

**Decision**: Stay routes use the **actual 001 pattern**: plain `new Hono<{Bindings:Env}>()` +
manual `schema.safeParse(await c.req.json())`, mapping Zod issues to
`{ errors: [{ field: issue.path.join("."), code: issue.message }] }` (Zod **message string is the
error code**). DTOs enforced by `OwnerStayDTO.parse()` at the controller before responding.
Service-layer temporal errors throw **`AppError(400, code, field)`** (`src/lib/errors.ts`),
verified to render as `{ errors: [{ field, code }] }`. The OpenAPI doc is **not** auto-generated
from routes today (only the app shell uses `OpenAPIHono` + Swagger) — do **not** claim otherwise;
shared Zod still guarantees one validation SSOT for FE+BE.

**Error-envelope rule** (state once, inherited by 003+): **field/validation** errors use the
`{ errors: [{ field, code, params? }] }` envelope; **operational/auth** errors use bare
`{ code }` (e.g. `auth.required`, `rate.limited`, `geo.unavailable`).

**New error codes** added to `packages/shared/src/errors.ts` (currently 5 codes): `location.required`,
`date.in_past`, `date.range_invalid`, `num_men.too_low`, `confirm.required`, `geo.unavailable` —
with matching `errors.*` i18n keys in `he.ts` + `en.ts`.

## D14. Testing & mocking seam (geocoding is server-side)

**Decision**:
- **Backend** (vitest-pool-workers): `geoService` takes an **injectable `fetch`/provider** so
  tests pass a stub (no live calls). Temporal tests use `vi.setSystemTime(...)` + **real**
  `@photostructure/tz-lookup` with coordinates that cross the date line (e.g. New York vs
  Jerusalem) to assert destination-local rejection — mock the *coords input*, not the pure
  lib. Cascade-orphan test extends 001.
- **e2e** (Playwright): `page.route()` **cannot** intercept a server-side fetch, so add a backend
  **`GEO_MODE=mock`** env (returns canned results) for e2e, mirroring how 001's e2e backend uses
  `REQUIRE_EMAIL_VERIFICATION=false`/`RATE_LIMIT_DISABLED=true` vars.
- **Frontend unit tooling**: `apps/frontend` currently has **only Playwright** (no Vitest /
  Testing Library / jsdom). For 002, cover form-validation + dashboard behavior in **Playwright
  e2e** (what's wired). Adding `vitest` + `@testing-library/react` is an **optional** setup task,
  not assumed to exist.

## D15. Forward seam for Feature 003 (geospatial)

**Decision**: `lat`/`lng` are stored as first-class columns **specifically so 003** can do
cross-user "potential aggregation" near a location. **D1/SQLite has no geospatial type** — 003
will use a `(status, arrival_date)` index + a `lat`/`lng` **bounding-box range predicate** +
app-side **haversine** distance (no PostGIS). **Do not build that index in 002** (single-user,
tens of rows). Recorded so the seam is a deliberate decision, not a silent gap. Manual-entry
(null-coords) Stays are **second-class in 003** (not plottable until geocoded) — a documented
limitation.

---

## Validation outcomes (2026-06-19)

Two-role plan validation (architect: FIX-MINOR; expert dev: FIX-MAJOR) reconciled into the
decisions above. Notable corrections applied: routing/OpenAPI claim fixed to match real 001 code
(D13); **client-timezone header** added for no-coords validation (D3); exact civil-date compare
algorithm pinned (D3); `@photostructure/tz-lookup` chosen, KV contingency dropped (D3); geocoding
Cache API + rate-limit reuse + `GEO_MODE=mock` + injectable provider (D1/D14); never auto-geocode
the private address (D1); Google reframed as revert-with-schema-change (D1); `coversShabbat` named
seam 005 supersedes, Saturday-night coarseness documented (D7); prayer_needs Zod-validated on
read/write (D6); 003 geospatial seam + null-coords limitation recorded (D15); "attended" is a 004
dimension + cancelled rows are the 003 anchor (D5); 004 folder FK = table-rebuild (D9); FE has only
Playwright today (D14). No structural redesign was required; the Owner/Public DTO split (D8) was
endorsed as the key forward-compat decision.
