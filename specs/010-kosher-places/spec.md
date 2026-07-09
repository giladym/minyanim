# Feature Specification: Kosher Places & Map Layers (+ Admin Foundation)

**Feature Branch**: `010-kosher-places`

**Created**: 2026-07-09

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays** (a Stay's
coordinates anchor "nearby") and **003 Discovery** (the geo/bbox radius query pattern + the existing
`beit_chabad_pin` entity this feature generalizes). Establishes a reusable **admin foundation**
(role + guard + management surface) that the specified-but-unbuilt **006 Admin** (moderation,
metrics) will build on. Hebrew-first/RTL, WCAG 2.1 AA, tokens-only colors, i18n-only strings; all
geocoding stays server-side.

---

## Summary

Being an observant Jewish traveler is about more than finding a minyan. When a user is at a place,
the app should also help them find the **kosher/Jewish infrastructure** around them — synagogues and
other worship places, kosher restaurants, Chabad houses, mikvehs (extensible). Users see these as a
**list and a toggleable map layer** anchored to a Stay (or an entered location); selecting a place
shows its details and one-tap **navigation** (Google Maps / Waze). Admins **manage** the data
through a new admin surface — defining layers and adding/editing places — and a **staged, re-runnable
import tool** bulk-populates places from open worldwide sources (primarily OpenStreetMap), with
licensing/attribution tracked per record.

---

## Clarifications

### Session 2026-07-09 (decisions carried in from planning)

- **D1 — Admin-managed layers.** Layers (e.g. "worship", "restaurants", "Chabad houses", "mikvehs")
  are **admin-managed entities**, not a fixed code enum: an admin can add/rename/reorder/retire a
  layer without a code change. Each place belongs to exactly one layer.
- **D2 — Build the admin foundation now.** The app has no admin capability today. This feature
  introduces a minimal, reusable foundation: an **admin role** on the user, an **admin guard** for
  protected routes, and an **admin/management surface** (shell + navigation) meant to host future
  controls. The **first** admin is bootstrapped from an **environment allowlist** (no
  self-promotion). Moderation, user sanctions, and metrics remain **006 Admin** and are out of scope.
- **D3 — All viable data sources, source-pluggable.** **OpenStreetMap (Overpass)** is the primary
  **pullable open-data base** (synagogues, kosher-tagged restaurants, mikvehs). **Google Places** may
  be used for **live/on-demand lookups only** — its terms forbid storing/caching place records, so it
  MUST NOT seed the database. **Proprietary directories** (OU Kosher, Shamash, GoDaven, Chabad.org)
  are used **only with explicit permission** (Chabad.org licensing is already unresolved). **Manual
  admin entry** is always available.
- **D4 — Staged, manually-run ingestion.** Import is a re-runnable script that proceeds in reviewable
  stages: **fetch → save raw JSON → schema-validate → check alignment with the place model →
  resolve/flag data issues → dry-run report → upsert into the database**. It runs **manually against
  dev** for now; **production writes require explicit authorization**; scheduled/automatic runs
  (cron) are a later option.
- **D5 — Licensing/attribution is mandatory.** Every place stores its **source + source id + license**,
  and the UI renders any **required attribution** (e.g. "© OpenStreetMap contributors" for
  ODbL-sourced data). A place whose license does not permit display is not shown.
- **D6 — Generalize `beit_chabad_pin`.** The existing Chabad-pin data becomes rows in the new generic
  **Place** model under a "Chabad houses" layer; the old table is retired after migration.
- **D7 — Accessible list alongside the map.** The map layer is an enhancement; a keyboard- and
  screen-reader-operable **list** of the same places is always present (WCAG 2.1 AA). Markers are
  **clustered** so dense areas stay usable/performant.
- **D8 — Navigation via deep links.** "Navigate" opens **Google Maps** and **Waze** via public URL
  schemes (coordinates/name) — no map-provider API, key, or cost.
- **D9 — Rich fields, best-effort.** Capture whatever a source provides: coordinates, name,
  description, images, layer/category, **kosher metadata** (certification/hechsher + certifying
  agency, meat/dairy/parve), phone, address, opening hours — plus source provenance. Missing fields
  degrade gracefully; they never block showing a place that has at least a name + coordinates.
- **D10 — Visibility.** Places are **public institutional data** shown to any **signed-in** viewer
  (consistent with discovery being an authenticated surface). No per-user privacy concerns (unlike
  seed users, 009).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover kosher places near me (Priority: P1)

A signed-in user viewing a Stay (or an entered location) sees the kosher/Jewish places around it —
as a **list** and as a **toggleable map layer** — filters by layer, opens a place for details, and
launches navigation to it.

**Why this priority**: This is the core religious value the feature adds; it is what the user
actually experiences. It is viable as an MVP the moment any places exist (seeded or admin-entered).

**Independent Test**: With at least one place present near a location, open that location's
places view: the place appears in the list and on the map; toggling its layer hides/shows it;
selecting it reveals name/description/address/details; "navigate" opens Google Maps and Waze at the
right coordinates.

**Acceptance Scenarios**:

1. **Given** a Stay with coordinates and kosher places within its radius, **When** the user opens the
   places view, **Then** those places appear in a list and as map markers grouped by layer.
2. **Given** the places view with multiple layers, **When** the user toggles a layer off, **Then**
   its places disappear from both the map and the list; toggling on restores them.
3. **Given** a place selected (from the list or a marker), **When** its detail opens, **Then** it
   shows the available fields (name, description, address, hours, kosher metadata, images) and
   **Google Maps** + **Waze** navigation links pointing at the place's coordinates.
4. **Given** a dense area with many places, **When** the map renders, **Then** markers are clustered
   and remain responsive; the accompanying list is fully keyboard/screen-reader operable.
5. **Given** a location with no places nearby, **When** the user opens the places view, **Then** a
   clear empty state explains none are known there (not an error).

---

### User Story 2 — Admin manages layers & places (Priority: P1)

An admin signs in, reaches the admin/management surface, defines the layers, and adds/edits/removes
places, assigning each to a layer.

**Why this priority**: Without curated data and the layers to hold it, User Story 1 has nothing to
show. This also establishes the reusable admin foundation the product needs generally.

**Independent Test**: An allowlisted admin opens the admin surface, creates a layer, adds a place
with coordinates + fields under that layer, and sees it appear in User Story 1's view; a
non-admin is denied access to the admin surface and its routes.

**Acceptance Scenarios**:

1. **Given** a user whose account is on the admin allowlist, **When** they open the admin surface,
   **Then** they can reach the layers & places manager; a non-admin is refused (both UI and API).
2. **Given** the layers manager, **When** the admin creates/renames/retires a layer, **Then** the
   change is reflected in the place editor and in the user-facing layer toggles.
3. **Given** the places manager, **When** the admin creates/edits/deletes a place and assigns a
   layer, **Then** the change is persisted and visible in User Story 1.
4. **Given** the previously separate Chabad pins, **When** the feature is deployed, **Then** they
   appear as places under a "Chabad houses" layer with their original details preserved.

---

### User Story 3 — Bulk-import places from open sources (Priority: P2)

An operator runs the staged import tool to populate places worldwide (for an area) from
OpenStreetMap, reviewing each stage's artifact before anything is written.

**Why this priority**: Manual entry (US2) does not scale to worldwide coverage; the import provides
breadth. It builds on the layer/place model from US2, so it follows it.

**Independent Test**: Run the tool against a bounded area: it writes a raw JSON pull, a validated
+ issue-flagged records file, and a dry-run report of what would be created/updated; running the
upsert then creates/updates exactly those places with source + license recorded, and re-running is
idempotent (no duplicates).

**Acceptance Scenarios**:

1. **Given** an area, **When** the operator runs the fetch stage, **Then** raw source records are
   saved to a reviewable JSON file with source + source id.
2. **Given** a raw pull, **When** the validate/gate stage runs, **Then** each record is
   schema-validated and mapped to the place model, with **flagged** issues (missing coordinates,
   duplicate by source id or proximity, unresolvable location) separated from **accepted** records.
3. **Given** accepted records, **When** the operator runs `--dry-run`, **Then** a report lists what
   would be created vs. updated **without** writing to the database.
4. **Given** a confirmed run, **When** the upsert stage runs, **Then** accepted places are
   created/updated with source + license stored; **re-running is idempotent** (matched by source id).
5. **Given** the same operator without production authorization, **When** they target production,
   **Then** the write is refused (dev-scoped by default).

---

### Edge Cases

- A place has only a name + coordinates (no description/hours/images) → shown with graceful blanks,
  never hidden.
- A source record lacks coordinates or fails geocoding → flagged, excluded from creation, surfaced in
  the issues report.
- Two sources (or two pulls) describe the same place → deduplicated by source id and by proximity so
  the user sees one entry.
- A layer is retired while places still reference it → those places are hidden/relabelled rather than
  orphaned or deleted.
- A data source's license does not permit display/storage → those records are not imported (Google
  Places is live-lookup only; never stored).
- Required attribution cannot be rendered for a record → the record is not shown.
- The user has no network / the map tiles fail → the accessible list still works (the map is an
  enhancement).
- A user's Stay has no coordinates (manual city) → the places view degrades to a clear "add a precise
  location to see nearby places" state (mirrors 005 zmanim's coordinate-less handling).
- A non-admin calls an admin API directly → denied by the guard (not merely hidden in the UI).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST store **places** as a generic model carrying (at minimum) name and
  coordinates, plus optional description, images, address, phone, opening hours, **kosher metadata**
  (certification/agency, meat/dairy/parve), and source provenance (source, source id, license).
- **FR-002**: The system MUST support **admin-managed layers** (create, rename, reorder, retire); each
  place belongs to exactly one layer (a place cannot exist without a layer).
- **FR-003**: A signed-in user MUST be able to view the places near a Stay (or an entered location)
  within a radius, as both a **list** and a **map layer**, grouped by layer.
- **FR-004**: The user MUST be able to **toggle layers** on/off, affecting both the map and the list.
- **FR-005**: The user MUST be able to **filter** places by layer (and by kosher type where present).
- **FR-006**: Selecting a place MUST reveal its available details and provide **Google Maps** and
  **Waze** navigation links targeting the place's coordinates.
- **FR-007**: The map MUST **cluster** markers in dense areas and MUST be accompanied by an
  equivalent **keyboard/screen-reader-operable list** (WCAG 2.1 AA); the feature MUST remain usable
  with the map unavailable.
- **FR-008**: The system MUST expose an **admin role** and MUST **guard** all admin routes/actions
  server-side; non-admins MUST be refused (not merely hidden). The first admin MUST be bootstrapped
  from an **environment allowlist**, with no self-service promotion.
- **FR-009**: An admin MUST be able to **create, edit, and delete places** and **assign a layer**,
  through an admin management surface.
- **FR-010**: The system MUST **migrate** existing Chabad pins into the place model under a "Chabad
  houses" layer, preserving their details, and retire the old representation.
- **FR-011**: The system MUST provide a **staged, re-runnable import tool** that fetches from a
  configured source, saves raw JSON, schema-validates + maps to the place model, **flags** data
  issues (missing coordinates, duplicates by source id/proximity, unresolvable location), produces a
  **dry-run** report, and only then upserts.
- **FR-012**: Imports MUST be **idempotent** by source id (re-running updates rather than
  duplicates) and MUST **deduplicate** near-identical places across sources by proximity.
- **FR-013**: Every stored place MUST record its **source + license**, and the UI MUST render any
  **required attribution**; records whose license forbids display/storage MUST NOT be imported/shown.
- **FR-014**: Import writes MUST default to **dev**; **production** writes MUST require explicit
  authorization.
- **FR-015**: All user-facing strings MUST be i18n (he/en), all colors MUST be design tokens, and the
  UI MUST be RTL-correct and WCAG 2.1 AA.

### Key Entities *(include if feature involves data)*

- **Place**: a physical kosher/Jewish location. Attributes: name, coordinates, layer, optional
  description/images/address/phone/hours, kosher metadata (certification + agency, meat/dairy/parve),
  and source provenance (source, source id, license). Belongs to one Layer.
- **Layer**: an admin-managed category grouping places (e.g. worship, restaurants, Chabad houses,
  mikvehs). Attributes: name, display order, active/retired, icon/label. Has many Places.
- **Admin role**: an elevated capability on a user account (allowlist-bootstrapped) that unlocks the
  admin management surface + protected actions. Foundation reused by 006 Admin.
- **Import artifacts** (tooling, not persisted app data): the staged JSON files — raw pull, mapped +
  validated records, flagged issues, dry-run report — that make each ingestion reviewable before it
  touches the database.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a Stay with coordinates, a user can see nearby kosher places (list + map) and open
  one's details in **under 5 seconds** and **≤ 2 interactions**.
- **SC-002**: Selecting a place and reaching turn-by-turn navigation (Google Maps or Waze) takes **1
  tap** from the place detail.
- **SC-003**: The places view meets **WCAG 2.1 AA** (axe-clean) with the map present, and remains
  fully operable via the list alone when the map is unavailable.
- **SC-004**: A map view of an area with **200+ places** stays responsive (clustered) with no
  perceptible interaction lag.
- **SC-005**: An admin can add a new layer and a new place and see it appear in the user view in
  **under 2 minutes**, with **no code change or deploy**.
- **SC-006**: A non-admin cannot reach any admin route or perform any admin action (**0** successful
  admin API calls by non-admins in testing).
- **SC-007**: Re-running the importer over the same area produces **0 duplicate** places.
- **SC-008**: **100%** of displayed places carry a recorded source + license and render required
  attribution.

## Assumptions

- Places are **public institutional data**; they are shown to signed-in users (the places view lives
  on authenticated surfaces alongside discovery). No per-user privacy handling is needed.
- "Nearby" reuses the existing **003 discovery radius/bbox** convention rather than introducing a new
  distance model.
- Kosher/dietary tags from open sources (e.g. OSM `diet:kosher`) are **community-contributed** and may
  be incomplete or unverified; they are shown **with source attribution**, and an admin can correct or
  augment them. The app does not itself certify kashrut.
- The existing server-side **geocoder** (MapTiler, 002) is reused for coordinate validation/resolution
  during import; no new provider is required for the base pullable source (OSM records carry coords).
- The admin allowlist is configured via an environment binding (secret), consistent with the project's
  secrets policy; there is exactly one privilege level ("admin") in this feature.
- Scheduled/automatic imports (cron) are **out of scope for v1** — the importer is run manually; a
  Cloudflare Cron Trigger or scheduled CI job is a documented later option.

## Dependencies

- **002 Stays** — a Stay's coordinates anchor the "near me" query.
- **003 Discovery** — the geo/bbox radius query pattern; the `beit_chabad_pin` entity being
  generalized into Place.
- **006 Admin** (specified, unbuilt) — this feature builds the admin foundation 006 will extend
  (moderation/metrics stay in 006).

## Out of Scope

- Moderation queue, user sanctions/bans, and platform metrics (**006 Admin**).
- Google Places / proprietary directories as **stored** data sources (Google is live-lookup only per
  its terms; proprietary sources need explicit permission — Chabad.org licensing unresolved).
- Automatic/scheduled ingestion (cron) — manual runs only in v1.
- User-submitted places or reviews/ratings (admin-curated + imported only in v1).
- Certifying kashrut or guaranteeing data accuracy — the app surfaces sourced data with attribution.
