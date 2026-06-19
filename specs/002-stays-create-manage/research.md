# Phase 0 Research — Stays: Create & Manage

Date: 2026-06-19 · Builds on 001. Each entry: **Decision / Rationale / Alternatives**.

---

## D1. Map / geocoding provider — LICENSING DECISION ⚠️

**Decision**: **MapTiler** for forward-geocoding/autocomplete (primary), **Google Places** as
fallback. Geocoding runs **server-side** behind `/api/geo/search` with the provider key held as
a `wrangler secret`; results are normalized to `{ city, country, lat, lng, label }` and the
city/country/coordinates are **persisted** on the Stay.

**Rationale**: The decisive constraint is ToS permission to *store* resolved coordinates
long-term. MapTiler's terms permit persisting geocoding results, which fits a schema where
`lat`/`lng` are first-class columns. Hebrew autocomplete is supported (`language=he`,
`country=il` bias). Running server-side keeps the key secret and lets us normalize provider
output to one internal shape (provider-swappable). Same licensing rigor the project applied to
kosher-zmanim (server-only) per 001 D7.

**Alternatives**:
- **Google Places** (fallback): best Israel/Hebrew quality, but only the **Place ID** is
  storable indefinitely — raw lat/lng caching is capped (~30 days), forcing a Place-ID +
  ephemeral-coords schema and refresh logic. Kept as fallback if MapTiler quality is
  insufficient (revert path documented in spec Follow-ups).
- **Nominatim/Photon (public)**: autocomplete forbidden / rate-limited on public instances;
  viable only self-hosted (ops burden) — rejected for v1.

**Open confirmation** (spec Follow-up ⭐): create the MapTiler account/key and confirm the
storage clause before go-live; implement against a mockable `geoService` until the key exists.

## D2. Client map renderer

**Decision**: **MapLibre GL JS** (OSS fork of Mapbox GL, no API-key lock-in) for the confirmation
map; tiles from MapTiler (tile key is public-scoped, separate from the secret geocoding key).

**Rationale**: The map is only *confirmation* (search-first UX); MapLibre is dependency-light,
RTL-capable, and avoids Mapbox/Google client SDK licensing. If tiles fail to load, the flow still
works (search results + manual entry). Lazy-loaded so it doesn't bloat the dashboard route.

**Alternatives**: Google Maps JS SDK (key lock-in + attribution coupling), Leaflet (raster only,
weaker vector/RTL) — rejected.

## D3. Coordinates → timezone (the "past date" authority)

**Decision**: Resolve the destination's **IANA timezone from its coordinates** using
**`tz-lookup`** (offline, embedded dataset — no network call) in a backend helper
(`lib/timezone.ts`). Validate "arrival not in the past" against the **destination-local civil
date**. When a Stay has no coordinates (manual entry / geocode failure), fall back to the
client-reported date with a ±1-day tolerance.

**Rationale**: A stateless shared Zod schema cannot resolve a timezone, so the temporal check
must run server-side (the structural checks stay in Zod). `tz-lookup` is offline and edge-safe
(no per-request API call, no rate limit). Mirrors 001's "server is authoritative for
date/time derivation" stance.

**Alternatives**: `geo-tz` (larger dataset), validate in UTC (wrong near date boundaries — the
exact international-travel bug this feature must avoid), trust the browser TZ only (server must
re-check). **Check**: confirm `tz-lookup` bundle size fits the Worker limit; if not, swap to a
coords→TZ lookup served from a small KV/asset table.

## D4. Date storage shape

**Decision**: Store `arrival_date` and `departure_date` as **date-only**, epoch-ms at **UTC
midnight of the civil date** (integer columns, consistent with 001's epoch-ms timestamps).

**Rationale**: Stays are day-granular (a date range), not instants; storing date-only removes
time-of-day ambiguity. Comparisons happen against the destination-local civil date (D3).

**Alternatives**: full timestamps (false precision, TZ ambiguity), ISO text (loses integer
index efficiency) — rejected.

## D5. Stay status — stored vs derived

**Decision**: Persist `status ∈ {active, cancelled}` (free `text`, validated by a shared Zod
enum — not a DB CHECK, so 003/004 can extend). **"past" is derived** at read time from
`departure_date < destination-local now`; never stored.

**Rationale**: KISS + no new infrastructure (no cron / lazy-write). Identical to 001 deriving the
calendar at request time and persisting no derived entity.

**Alternatives**: store `past` + nightly Cron Trigger to flip (infra + TZ-correctness burden);
lazy flip on read (write amplification) — rejected.

## D6. Prayer-needs storage

**Decision**: A single **JSON column** (`prayer_needs`) typed by a shared Zod
`PrayerNeedsSchema` (Drizzle `mode:'json'`): `{ weekday: { shacharit: bool, mincha: bool,
maariv: bool } }`. Shabbat is always-on by default and **not stored** (it's the baseline);
weekday tefillot are the optional booleans. One set per Stay (v1).

**Rationale**: The set is small and never *queried/filtered* in 002 (filtering is 003, which
aggregates Minyanim, not Stays), so a typed JSON blob is the KISS fit and keeps the SSOT in
`packages/shared`. Per-occurrence selection deferred (spec Follow-up).

**Alternatives**: three boolean columns (rigid, harder to extend for 003), `stay_prayer_need`
child table (overkill for a single-user flat set) — rejected.

## D7. Shabbat-default detection

**Decision**: **Civil-calendar heuristic, server-side**: the Shabbat default is suggested ON if
`[arrival, departure]` overlaps any Friday or Saturday in the **destination timezone** (D3). No
zmanim dependency. It is a suggested default the user can override.

**Rationale**: "Covers a Friday–Saturday" is a civil-date overlap question — pure date math once
the TZ is known. Keeps 005 (precise candle-lighting) decoupled, as the ROADMAP intends (005 is
parallel, not a dependency).

**Alternatives**: zmanim-precise windows (couples 002→005 prematurely) — deferred to 005.

## D8. Owner vs Public serialization

**Decision**: Two shared-Zod DTOs from day one — **`OwnerStayDTO`** (includes `address_private`,
`contact_phone`, `contact_email`) and **`PublicStayDTO`** (omits them). 002 emits Owner only; the
controller picks the DTO by ownership. Private fields are *structurally absent* from the public
schema.

**Rationale**: Enforce non-exposure at the contract layer (SSOT) so a private field can never
leak by a missed runtime branch — pre-builds the seam 003 needs when it exposes others' Stays
(ROADMAP §9 visibility).

**Alternatives**: single DTO with runtime field-stripping by viewer relationship (one missed
branch = leak) — rejected.

## D9. `folder_id` — deferred FK

**Decision**: Add a **nullable `folder_id text`** column with **no FK constraint** in 002.
Feature 004 adds the FK with `ON DELETE SET NULL` (a Stay outlives folder deletion) in its own
migration.

**Rationale**: Satisfies FR-001's optional-folder field with zero coupling to a table that
doesn't exist yet; 004 layers the constraint via the same drizzle pipeline.

**Alternatives**: defer the column (breaks FR-001's optional field now); ship a minimal folder
table (scope creep into 004) — rejected.

## D10. Listing — sort & pagination

**Decision**: `GET /api/stays` sorts **nearest-first server-side**
(`ORDER BY arrival_date ASC` over the `(user_id, arrival_date)` index). **No pagination in v1**;
include past Stays flagged (derived) so the dashboard renders them distinctly.

**Rationale**: "Nearest" semantics live in one place (server); a single traveler has tens of
Stays, not thousands. Add cursor pagination only if 004 history proves it necessary (KISS).

## D11. Migrations, cascade & testing

**Decision**: Generate the `stay` migration via `drizzle-kit generate` → `wrangler d1 migrations
apply` (001's single pipeline). Extend 001's cascade-orphan integration test: create user +
stays → `deleteUser` → assert zero orphan stays. Use `db.batch` for any multi-statement write.
Mock `geoService` and `tz-lookup` boundaries in CI (no live provider calls); add a
non-CI-blocking smoke test for Hebrew autocomplete + attribution.

**Rationale**: Direct continuity with 001's *verified* (not assumed) D1 cascade requirement and
no-interactive-transactions rule.

## D12. Contact: snapshot vs live reference

**Decision**: Pre-fill contact (`contact_name`, `contact_phone`, `contact_email`) in the form
from the existing `/api/me` profile (name + first phone), and **store the snapshot** on the Stay.

**Rationale**: Later profile edits must not silently mutate historical Stays. Contact phone/email
inherit the D8 visibility rule (OwnerStayDTO only).

**Alternatives**: live-join to profile at read (mutates history; couples Stay rendering to
profile) — rejected.

---

## Resolved unknowns

All spec Clarifications + ROADMAP "geocoding provider" open item are resolved above. Remaining
items are **external Follow-ups** (MapTiler key/ToS confirmation, cost) tracked in the spec — they
do not block design or implementation against a mocked provider.
