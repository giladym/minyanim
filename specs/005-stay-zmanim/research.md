# Phase 0 Research — Per-Stay Zmanim

Date: 2026-06-21. Resolves the spec Clarifications (D1–D10) into concrete technical decisions,
**verified against shipped 001/002/003 code and the actual `kosher-zmanim@0.9.0` API**. Format:
Decision · Rationale · Alternatives rejected.

## R1 — Compute engine: `kosher-zmanim` server-side, offline (D1)

**Decision**: Compute zmanim in-process with the already-installed `kosher-zmanim`
(`ComplexZmanimCalendar` + `GeoLocation` from `util/GeoLocation`). No external API, no network on
the read path, no secret, no quota. 001's `lib/calendar.ts` already imports the package
(`JewishCalendar`, `HebrewDateFormatter`) — 005 imports two more symbols from the same package, so
bundle/cold-start cost is ~zero (the monolithic lib is already paid for). **Verified**:
`ComplexZmanimCalendar.d.ts` exposes `getCandleLighting()`, `setCandleLightingOffset(double)`,
`getTzaisGeonim8Point5Degrees()`, `getTzais72()`, and `getSunset()` (inherited). **Rationale**: the
draft's "Hebcal-class API" assumption was false; the offline engine is faster, dependency-free, and
already in the bundle. **Alternatives rejected**: a third-party zmanim API (network + quota + secret
on a read path, and re-introduces an external dep we don't need).

## R2 — `GeoLocation` inputs + Friday/Saturday pairing (D8/D10)

**Decision**: `new GeoLocation(name, lat, lng, elevation, timeZoneId)` with `elevation = 0` and
`timeZoneId = tzFromCoords(lat, lng)` (the shipped 002 helper). For each **Saturday** civil date `S`
returned by `shabbatSaturdaysInRange(arrival, departure, arrival, departure)`:
- **candle-lighting** = compute on **Friday** = `S − 1 day` (the calendar's date set to Friday) →
  `getCandleLighting()` (sunset minus the offset).
- **Havdalah** = compute on **Saturday** `S` → both `getTzaisGeonim8Point5Degrees()` and
  `getTzais72()`.
`kosher-zmanim`'s time getters return a **UTC-zoned** luxon `DateTime` (verified: `getDateFromTime`
builds `DateTime.utc(...)`), so format with **`dt.setZone(tzFromCoords(lat,lng)).toFormat("HH:mm")`** —
NOT `dt.toFormat(...)`, which would emit UTC (a silent wrong time). luxon is re-exported by
`kosher-zmanim` (no new dep; pinned v1.28 — `setZone`/`toFormat` exist). `shabbatSaturdaysInRange`
returns `string[]` (`YYYY-MM-DD`); parse each to a UTC-midnight Date, derive Friday via `−1 day`, and
note `coversShabbat(arr,dep,tz)` takes a tz arg. **Rationale**: candle-lighting is Friday-sunset-based,
Havdalah is Saturday-night — the helper enumerates Saturdays, so the Friday is derived per entry.
`elevation 0` + sea-level sunset is what candle-lighting uses by default and we hold no per-Stay
elevation. **Alternatives rejected**: device-tz formatting (FR-003 violation); storing elevation
(no source).

## R3 — Candle-lighting offset (D3)

**Decision**: `setCandleLightingOffset(18)` globally; **40** when the location is Jerusalem.
Jerusalem detection: a small bounded-box / known-coords check in `lib/zmanim.ts` (Jerusalem ≈
31.78 N, 35.21 E) — if within ~0.15° treat as Jerusalem → offset 40. Fixed, not user-configurable
(v1). **Rationale**: matches the prevalent custom; a coordinate box is simple and needs no city
string. **Alternatives rejected**: per-user offset (deferred to v2, D3); city-string match (Stays
may be coordless or named differently).

## R4 — Havdalah: both opinions, user-selectable, Geonim default (D4)

**Decision**: Always compute **both** `havdalahGeonim` (`getTzaisGeonim8Point5Degrees()`) and
`havdalahRabbeinuTam` (`getTzais72()`) and return both in the payload (cheap). The **display** is
chosen by the FE from the user's `havdalahOpinion` profile preference
(`geonim | rabbeinu_tam | both`, default `geonim`); `both` shows both, labeled. **Rationale**: the
owner asked for both data with a personal setting and the most common as default; computing both is
trivial and lets the FE switch without a refetch. **Alternatives rejected**: compute only the
selected opinion (forces a refetch on preference change; loses the "both" view).

## R5 — `havdalahOpinion` profile field (D4) — ADD COLUMN migration

**Decision**: Add `havdalahOpinion` to the **001 `user`** table (`text("havdalah_opinion")
.notNull().default("geonim")`), mirroring `language`/`theme`. **VERIFY** `drizzle-kit generate`
emits a single `ALTER TABLE user ADD COLUMN` and NOT a PRAGMA-wrapped rebuild (0003 proves it does for
a simple column; if not, hand-author the one-line ALTER per the 0004 precedent — `user` has many FK
children and a rebuild would hit the D1 PRAGMA rejection). **Round-trip touch-points (ALL required,
or the field silently drops — the 004 hand-built-shape trap):** (1) `common.ts` `havdalahOpinionSchema`
enum; (2) `profile.ts` `updateProfileSchema` + the `Profile` interface (the shipped type is `Profile`,
NOT `ProfileDTO`); (3) `auth.ts` better-auth `additionalFields` registration; (4) `schema.ts` column;
(5) `userRepository.updateUser` field-type widening (currently `Partial<{name,language,theme}>` — drops
the key); (6) `profileService.getProfile` explicit field map (it does not spread). **Rationale**: a
portable per-user preference like language/theme. **Alternatives rejected**: a separate prefs table
(overkill); localStorage (not portable; the owner wanted a *setting*).

## R6 — Detail-scoped endpoints, NOT list reads (D5) — the cost fix

**Decision**: Two dedicated reads — `GET /api/stays/:id/zmanim` (owner-scoped) and
`GET /api/minyan/:id/zmanim` (public). Zmanim are **NOT** added to `OwnerStayDTO` and **NOT** computed
in `toOwnerDTO`/`listStays`/`listStayHistory`. The dashboard card already has `coversShabbat: boolean`
(shipped in `OwnerStayDTO`) to decide whether to render the "Shabbat times" affordance; the FE
**lazy-fetches** the endpoint when the section is expanded. **Rationale**: computing N stays × M
Shabbatot × (sunset+tzeit) on every dashboard load is wasteful; SC-002 is itself detail-scoped.
Mirrors the `routes/calendar.ts` shape (compute → `c.json` → `cache-control`). **Alternatives
rejected**: embedding zmanim in the stays list (N×M on a hot path, ARC concern); a single
batch-all-stays endpoint (premature).

## R7 — Coordless degradation = conversion nudge (D6)

**Decision**: The service returns `hasCoordinates: false` (no `shabbatot` computed) when
`lat == null || lng == null`. The FE renders an "add a map location to see Shabbat times" state with
a CTA into 002's edit/map-pick flow. **No on-read geocoding** of the stored city string.
**Rationale**: 002 deliberately allows coordless manual entry; geocoding on a read path re-introduces
a networked/quota'd/ambiguous dependency (ARC). Turning the gap into an edit nudge is better UX.
**Alternatives rejected**: server geocode city→coords on read (cost, ambiguity, re-adds external dep).

## R8 — Uncomputable (high-latitude) handling (D7)

**Decision**: Every `kosher-zmanim` time getter returns `DateTime | null` (no sunset/tzeit above the
polar circles). The lib function returns each field as `string | null`; a Shabbat entry with any
null carries a `note: "uncomputable"` flag. The FE shows a "cannot be computed at this location"
note — **never a fabricated time**. **Rationale**: confidently-wrong halachic times destroy trust;
null is a legitimate astronomical result. **Alternatives rejected**: a fixed-clock polar fallback
(contested halacha, out of scope); blank/crash.

## R9 — Yom-Tov-adjacency guard (D2)

**Decision**: v1 is Shabbat-only (matches civil `coversShabbat`). Before emitting a Havdalah for a
Saturday, check via `JewishCalendar` (already used in `calendar.ts`) whether **motzaei Shabbat runs
into Yom Tov** (the next civil day is Yom Tov) — if so, **suppress the Havdalah** and annotate the
entry (Havdalah is deferred to motzaei Yom Tov). Candle-lighting on a Friday that is Erev Yom Tov is
still the correct Shabbat candle-lighting, so it is shown. **Rationale**: a plain wrong Havdalah is
worse than omission (PM CRITICAL). **Alternatives rejected**: ignoring Yom Tov entirely (shows wrong
motzaei time); full Yom Tov zmanim (deferred to v2, D2).

## R10 — Minyan zmanim: public, fuzzed-coords, active-only (D9)

**Decision**: `GET /api/events/:id/zmanim` is **public** — the shipped public minyan read is
`GET /api/events/:id` (`routes/events.ts`, `optionalUserId` → genuinely unauthenticated; there is **no
`/api/minyan` namespace**). Add the zmanim read to the existing `events` router. A Minyan has a
**single `eventDate`, not a range** → gate on `isSaturday(eventDate)` and emit **at most one**
`ShabbatZmanim` (no range enumeration). Use `getMinyanById(db,id)` which returns **exact** stored
`lat`/`lng` — compute from those directly (do **not** route through the fuzzed `PublicMinyanDTO`; the
sub-second difference is immaterial, so the result is identical for all viewers anyway). **Active-only**:
cancelled/past events and past Stays (History, 004) get no zmanim — derive past-ness from `eventDate`
(no stored `isPast` on events). Zmanim are informational, independent of the host's manual tefilla
times. **Rationale**: zmanim reveal nothing private; consistency across viewers > coordinate precision.
**Alternatives rejected**: a `/api/minyan` path (doesn't exist); participant-only (no privacy reason);
fuzzed-coord routing (unnecessary indirection).

## R11 — Testing strategy

- **lib unit tests** (no Worker bindings, mirror `calendar.test.ts`): fixed coords + fixed Saturday
  → assert known `HH:mm` candle-lighting + both Havdalah times within ±1 min of a published luach
  (Jerusalem, Kraków, NYC, London). High-latitude (Tromsø, June) → null/uncomputable. Jerusalem →
  40-min offset applied. A Yom-Tov-adjacent Saturday → Havdalah suppressed.
- **endpoint tests** (vitest-pool-workers): owner-scope on stay zmanim (404 for non-owner),
  public access on minyan zmanim, coordless stay → `hasCoordinates:false`, weekday minyan → empty,
  profile `havdalahOpinion` round-trip + default `geonim`.
- **frontend** (Vitest+TL): expandable section gated by `coversShabbat`, coordless CTA, "cannot
  compute" note, opinion-aware Havdalah display, preference control.
- **e2e** (Playwright+axe): zmanim section + preference WCAG AA, RTL, keyboard (SC-008); assert
  `kosher-zmanim` absent from the FE bundle (SC-006).

## R12 — ADR + i18n + route registration

- **ADR** `docs/adr/0007-zmanim-server-side.md`: `kosher-zmanim` (LGPL) computed server-side; only
  formatted strings + opinion labels cross to the FE; confirmed zero FE imports today; folds under
  the existing "legal sign-off pending" note (no new obligation).
- **Route registration**: mount `zmanim` in `apps/backend/src/index.ts` (`app.route("/", zmanim)`).
- **i18n (he+en parity)**: `zmanim.{title,candleLighting,havdalah,havdalahGeonim,havdalahRabbeinuTam,
  cannotCompute,addLocation,addLocationCta,shabbatOf}`, `profile.havdalah.{label,geonim,rabbeinuTam,
  both}` (parity test guards it).
- **Structured logs**: `zmanim.computed` (optional, low-value) — skip unless useful; the compute is
  pure. No new error codes (reuse `resource.not_found`, `auth.required`).

## Planning constants

candle-lighting 18 min (40 Jerusalem) · Havdalah Geonim 8.5° + Rabbeinu Tam 72 · default opinion
`geonim` · elevation 0 / sea-level · times `HH:mm` in location IANA tz · detail-scoped + cache-control
· active Stays/Minyanim only · no new table (one ADD COLUMN) · no cron, derived at read.
