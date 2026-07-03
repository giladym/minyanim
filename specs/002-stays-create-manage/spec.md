# Feature Specification: Stays — Create & Manage

**Feature Branch**: `002-stays-create-manage`

**Created**: 2026-06-18

**Status**: Clarified (2026-06-20)

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **001 Platform Foundation**.

---

## Summary

The core data unit of the product. A signed-in user registers a **Stay** (שהייה) — where
they will be, when, with how many men, and what prayer needs — using a map location
picker. They see and manage all their Stays in a dashboard sorted nearest-first, and can
edit or cancel them. After this feature, the product is usable single-player: a user can
fully record their travel-prayer plans even before the discovery/quorum layer exists.

---

## Clarifications

### Session 2026-06-20 (post-implementation reconciliation)

Surfaced from hands-on use after 002 shipped; both folded into the requirements below.

- Q: When the UI language is Hebrew, place search returned nothing for destinations outside
  Israel — is that intended? → A: **No — bug.** The geocoder was being sent a hard `country=il`
  filter for Hebrew (intended as a "bias," but the provider treats it as an exclusion). Search
  MUST be **global in every language**; `lang` only localizes the returned labels, never restricts
  which places are searchable. This is essential — Minyanim is a *travel* product whose primary
  case is Hebrew-speaking users abroad. The filter was removed (FR-002, FR-008).
- Q: Can a user set the location by clicking a point on the map, not only by name search? → A:
  **Yes — added.** Clicking the map **reverse-geocodes** the point to the nearest city-level place
  (`GET /api/geo/reverse`, same server-side/secret/cache/rate-limit contract as forward search)
  and fills city/country/coordinates. It complements — does not replace — search-first and manual
  entry. If no locality resolves at the clicked point, the UI prompts to pick another spot or enter
  manually. Click-to-pick is unavailable when the map can't load (no tile key / tile failure);
  search + manual entry remain (FR-002, FR-008a).

### Session 2026-06-19

Derived from a two-role spec review (PM/UX + Architect) and reconciled into the decisions
below. Items needing external action are listed under **Follow-ups** at the end of the spec.

- Q: A stay is in another country/timezone — relative to *whose* clock is an arrival date
  "in the past"? → A: The **destination's** local date. The map pick yields coordinates;
  the server resolves the location's IANA timezone and compares date-only values there.
  Structural invariants (departure ≥ arrival, men ≥ 1, well-formed dates) live in the shared
  Zod schema; the timezone-dependent "not in the past" check runs **server-side**. If a Stay
  has no coordinates (manual entry / geocode failed), fall back to the user's device date with
  a ±1-day tolerance so a legitimately-today stay is never wrongly rejected.
- Q: Which map/geocoding provider, and where does geocoding run? → A: **MapTiler** primary
  (its ToS permits storing resolved coordinates long-term), **Google Places** as fallback.
  Forward-geocoding/autocomplete runs **server-side** behind `/api/geo/*` with the key as a
  `wrangler secret` (never shipped to the client); map *tiles* may load client-side. The UX is
  **search-first** (type a place → choose from a result list) with the map as confirmation and
  an always-visible "enter city/country manually" fallback. ODbL attribution ("© MapTiler ©
  OpenStreetMap") is shown wherever results appear.
- Q: Is "past" a stored status or derived? → A: **Derived.** Store only `active` / `cancelled`;
  "past" is computed at read time from `departure_date < destination-local now` (no cron, no
  lazy writes — same "server derives, persists no derived entity" stance as the 001 calendar).
- Q: How is the optional folder referenced when the folder table is Feature 004? → A: A
  nullable `folder_id` text column **with no FK constraint** in 002; Feature 004 adds the FK
  (`ON DELETE SET NULL` — a Stay outlives folder deletion) in its own migration.
- Q: What does "cancel" mean, and is there a hard delete? → A: The user action is **Cancel**
  (soft): set `status = 'cancelled'`, behind a **confirmation** dialog; cancelled Stays drop
  off the active dashboard. The row is preserved (Feature 003 may reference it). Hard delete is
  reserved for the account-deletion cascade; a permanent-delete UI can come with Feature 004
  history.
- Q: How are prayer needs modeled for a stay spanning multiple Shabbatot/weekdays? → A: **One
  stay-wide set** for v1 — Shabbat tefillot always included by default; weekday tefillot
  (Shacharit / Mincha / Maariv) are optional booleans applying to the whole stay. Stored as a
  JSON column typed by a shared Zod `PrayerNeedsSchema`. Per-Shabbat / per-day selection is a
  documented limitation deferred (informs Feature 003).
- Q: How is "covers a Friday–Saturday" determined? → A: A **civil-calendar heuristic**,
  server-side: the Shabbat default turns on if `[arrival, departure]` overlaps any Friday or
  Saturday in the destination timezone. No zmanim dependency; precise candle-lighting/Havdalah
  windows arrive with Feature 005. It is a suggested default the user can override.
- Q: What does "number of men" mean and what's the default? → A: **Men in the party including
  the user**, default **1**, labelled "כמה גברים בקבוצה (כולל אותך)".
- Q: What does a first-time user with zero Stays see? → A: A calm **empty state** with a
  one-line explanation of what a Stay is and a single prominent "הוסף שהייה" CTA (no
  auto-opening forms).
- Q: How is the <90-second first-Stay goal (SC-001) met? → A: **Smart defaults + progressive
  disclosure** — pre-fill contact from the profile (name + first phone, snapshotted onto the
  Stay), `num_men = 1`, Shabbat auto-on when the range covers a Saturday; collapse optional
  fields (specific address, group members, notes, folder) behind a "פרטים נוספים" disclosure.
- Q: How is the private-address promise made trustworthy and leak-proof? → A: Two shared-Zod
  DTOs from day one — **OwnerStayDTO** (includes `address_private`, contact phone/email) vs
  **PublicStayDTO** (omits them); Feature 002 emits Owner only, so private fields are
  *structurally absent* from any public shape. Plus field-level microcopy at the address input
  and a short form-level privacy note.
- Q: Where does the user land after saving, and can a destructive action be undone? → A: Return
  to the dashboard with the new/edited Stay highlighted and a brief success toast. Cancel is
  guarded by a confirmation dialog (see above).
- Q: Do create-time date rules also apply on edit? → A: Yes — the same destination-local
  "not in the past" rule applies to create **and** edit; an in-progress stay (arrival past,
  departure future) may have its departure/details edited, but no date may be moved into the
  past.
- Q: Accessibility expectations for the form and map? → A: WCAG 2.1 AA, RTL, ≥44px targets, a
  **keyboard-operable** date picker and map/search, and Hebrew validation messages announced to
  assistive tech — restated here because the date picker and embedded map are where the 001
  global standard most easily breaks.
- Q: Dashboard scale / pagination? → A: No pagination in v1. Show upcoming Stays; past Stays are
  collapsed/quiet (full history is Feature 004).

---

## User Scenarios & Testing

### User Story 1 — Register a Stay (Priority: P1)

A traveling user records a Stay: location (map-selected), arrival and departure dates,
number of men, prayer needs, and optional details.

**Why this priority**: Without Stays there is nothing to discover or aggregate later.

**Independent Test**: A signed-in user creates a Stay and immediately sees it in their
dashboard.

**Acceptance Scenarios**:

1. **Given** the Add-Stay form, **When** the user searches a place by name on the embedded
   map and selects it, **Then** city, country, and coordinates auto-fill.
1a. **Given** the Add-Stay form with the map shown, **When** the user clicks a point on the map,
   **Then** the nearest city-level place is reverse-geocoded and city, country, and coordinates
   auto-fill (or, if none resolves, the user is prompted to pick another point or enter manually).
1b. **Given** the UI language is Hebrew, **When** the user searches for a place outside Israel,
   **Then** matching results are returned (search is global; not restricted to Israel).
2. **Given** required fields (location, arrival date, departure date, number of men),
   **When** the user submits, **Then** the Stay is saved and appears in the dashboard.
3. **Given** a missing required field, **When** the user submits, **Then** inline Hebrew
   validation messages point to each missing field, an error summary appears by the submit
   button, and keyboard focus moves to the first invalid field (revealing the optional-fields
   disclosure if the flagged field is inside it).
4. **Given** the user is bringing a Sefer Torah, **When** they toggle "מביא ס״ת",
   **Then** the Stay shows a Sefer Torah badge.
5. **Given** the user specifies prayer needs, **When** the Stay covers a Friday–Saturday,
   **Then** Shabbat tefillot are included by default; for weekdays the user may select
   Shacharit / Mincha / Maariv.
6. **Given** an arrival date in the past (destination-local), **When** the user submits,
   **Then** creation is rejected with a clear message.
7. **Given** a valid submission, **When** the Stay is saved, **Then** the user returns to the
   dashboard with the new Stay highlighted and a brief success confirmation.

**Stay fields**: location (city + country, required; specific address optional & private),
arrival date, departure date (required), number of men (required, ≥1), brings Sefer Torah,
prayer needs (Shabbat default; weekday tefillot optional), contact (name pre-filled, phone,
email optional), group members (free text), notes, folder (optional — folder management is
feature 004).

---

### User Story 2 — View & Sort My Stays (Priority: P1)

A user sees all their Stays with the nearest upcoming one at the top.

**Independent Test**: A user with three upcoming Stays sees them ordered by arrival date,
soonest first.

**Acceptance Scenarios**:

1. **Given** a user with multiple upcoming Stays, **When** they open the dashboard,
   **Then** Stays are sorted by nearest arrival date first.
2. **Given** a Stay, **When** shown in the list, **Then** it displays location, date range,
   number of men, and Sefer Torah badge if applicable.
3. **Given** a Stay whose departure date has passed, **When** the dashboard renders,
   **Then** it is visually distinguished as past (full history view is feature 004).
4. **Given** a user with zero Stays, **When** they open the dashboard, **Then** they see an
   empty state explaining what a Stay is and a single prominent "הוסף שהייה" call-to-action.

---

### User Story 3 — Edit or Cancel a Stay (Priority: P1)

A user updates or cancels a Stay they created.

**Independent Test**: A user edits a Stay's dates and man-count and sees the changes
reflected immediately; cancelling removes it from the active list.

**Acceptance Scenarios**:

1. **Given** an existing Stay, **When** the user edits any field and saves, **Then** the
   updated values are reflected immediately in the dashboard.
2. **Given** an existing Stay, **When** the user cancels it, **Then** it is marked
   cancelled and removed from the active list.
3. **Given** a Stay a user has joined to a Minyan in a later feature, **When** they edit
   it, **Then** the change is consistent with downstream commitments (interaction defined
   in feature 003).

---

### Edge Cases

- Departure date before arrival date → rejected with a clear message.
- Number of men set to 0 or negative → rejected.
- Map location search returns no result → user can still enter a city/country manually.
- Map click reverse-geocodes to no locality (open sea, remote point) → user is prompted to pick
  another point or enter a city/country manually; the prior selection is left unchanged.
- Map cannot load (no tile key / tile failure) → search-first + manual entry still work;
  click-to-pick is simply unavailable (never blocks the flow).
- Specific address entered → stored but never displayed publicly (visibility rules per
  ROADMAP; enforced where the Stay is exposed to others in feature 003).

---

## Requirements

### Functional Requirements

- **FR-001**: A signed-in user MUST be able to create a Stay with location (map-selected),
  arrival date, departure date, and number of men, plus optional Sefer Torah flag, prayer
  needs, contact, group members, notes, and folder.
- **FR-002**: The Add-Stay form MUST provide a map with search-by-name that resolves a
  selected place to city, country, and coordinates. Search MUST be **global in every UI language**
  — the language selection localizes result labels only and MUST NOT restrict which places are
  searchable (no country filter). The map MUST also support **click-to-pick** (FR-008a).
- **FR-003**: The system MUST reject Stays with an arrival date in the past, a departure
  date before arrival, or a non-positive man count, with clear Hebrew messages. "In the past"
  is evaluated against the **destination's local date** (IANA timezone resolved server-side
  from the Stay's coordinates); when coordinates are absent, the user's device date with a
  ±1-day tolerance is used. Structural rules (range, positive count, well-formed dates) are
  enforced by the shared Zod schema; the timezone-dependent check runs server-side. The same
  rules apply on edit (FR-006).
- **FR-004**: A Stay MUST support Shabbat tefillot by default and optional weekday tefilla
  selection (Shacharit / Mincha / Maariv).
- **FR-005**: The dashboard MUST list a user's Stays sorted by nearest upcoming arrival
  date first, and visually distinguish past Stays.
- **FR-005a** *(added post-005 — Heritage Voyage design refresh)*: Each Stay card leads with a
  **map thumbnail** of the place (MapTiler static map from the Stay's coordinates; token-gradient
  fallback when coordinate-less), country + city overlaid; the body shows the date range, an
  optional folder chip, a single **minyan-status line** (registered → view · minyanim nearby → join
  · none → search/organize), a **`⋮` actions menu** (edit · search minyanim · organize a minyan ·
  move to folder · cancel — *search is always present, even when already registered, so additional
  minyanim at the same place are findable*), and a collapsible **Shabbat-times** panel. A Stay whose
  dates cover **today** MUST be emphasized ("here now") and floated to the top of the list.
- **FR-006**: A user MUST be able to edit and cancel Stays they own.
- **FR-007**: A specific address on a Stay MUST be stored privately and never exposed
  publicly. Serialization MUST use distinct shape contracts — an **owner** view that includes
  the private address and contact phone/email, and a **public** view that omits them — so
  private fields are structurally absent from any non-owner response. Feature 002 emits the
  owner view only. The Add-Stay form MUST show field-level privacy microcopy at the address
  input and a short form-level privacy note.
- **FR-008**: Location selection MUST use a **search-first** flow (search a place by name →
  choose from results → coordinates + city + country resolved), with the map as confirmation
  and an always-available manual city/country entry fallback for failed/empty geocoding.
  Forward-geocoding MUST run **server-side** (provider key held as a secret, never shipped to
  the client). Required attribution for the chosen provider MUST be displayed where results
  appear.
- **FR-008a**: The map MUST support **click-to-pick**: clicking a point reverse-geocodes it to the
  nearest city-level place and fills city, country, and coordinates. Reverse-geocoding MUST run
  **server-side** under the same secret/cache/rate-limit/attribution contract as forward search,
  and MUST reject out-of-range coordinates. Click-to-pick complements — never replaces —
  search-first and manual entry; when no locality resolves, or when the map cannot load, the user
  MUST still be able to search by name or enter city/country manually.
- **FR-009**: A user with zero Stays MUST see an empty state explaining what a Stay is with a
  single prominent "הוסף שהייה" call-to-action. The Add-Stay form MUST minimize effort via
  smart defaults (contact pre-filled from the profile and snapshotted onto the Stay,
  `num_men = 1`, Shabbat tefillot auto-enabled when the range covers a Saturday) and collapse
  optional fields (specific address, group members, notes, folder) behind a "פרטים נוספים"
  disclosure, supporting SC-001.
- **FR-010**: Cancelling a Stay MUST be a soft state transition (`status = 'cancelled'`) guarded
  by an explicit confirmation; cancelled Stays leave the active dashboard but the record is
  retained. Hard deletion is reserved for the account-deletion cascade (001).
- **FR-011**: The Stay status persisted MUST be `active` or `cancelled`; the "past" state MUST
  be **derived** at read time from the destination-local departure date (not stored). The
  dashboard shows upcoming Stays and visually distinguishes past ones; no pagination in v1.
- **FR-012**: The Add-Stay/edit form, date picker, and map/search MUST meet WCAG 2.1 AA, be
  RTL-correct and keyboard-operable, use ≥44px touch targets, and announce Hebrew validation
  messages to assistive technology. After a successful save the user returns to the dashboard
  with the affected Stay highlighted and a brief success confirmation. The submit control stays
  enabled (validation runs on submit, not as a disabled-button gate); on a failed submit the form
  MUST make the errors impossible to miss — surface a top-level error summary (`role="alert"`)
  near the submit button, move keyboard focus to the first invalid field, and auto-expand the
  "פרטים נוספים" disclosure when a flagged field lives inside it. The same focus/summary behavior
  applies to field errors returned by the server. The arrival/departure date pickers MUST expose
  `min`/`max` constraints (departure ≥ arrival; arrival ≤ departure; a soft past-floor) to prevent
  an out-of-order or clearly-past range at entry — a UX affordance only, with the server remaining
  authoritative for the timezone-correct "not in the past" check and the shared schema enforcing
  `departure ≥ arrival` regardless of what the picker allows.

### Key Entities

- **Stay (שהייה)** — see [ROADMAP](../ROADMAP.md). This feature establishes the Stay record
  and its CRUD.

---

## Success Criteria

- **SC-001**: A signed-in user can register their first Stay in under 90 seconds.
- **SC-002**: A saved Stay appears in the dashboard within 2 seconds of submission.
- **SC-003**: Editing a Stay reflects in the dashboard within 2 seconds.
- **SC-004**: 100% of invalid submissions (past date, bad date range, non-positive count)
  are rejected with a field-level message.

---

## Assumptions

- Folder assignment is offered as an optional field here (nullable `folder_id`, no FK yet),
  but folder management (create / rename / delete) and the FK constraint are feature 004.
- Map/geocoding provider decided in clarification: **MapTiler primary, Google Places fallback**,
  geocoding server-side. Pending external confirmation (see Follow-ups).
- Discovery, joining, and quorum aggregation are feature 003 — this feature is single-user.
- Prayer needs are one stay-wide set in v1; per-occurrence selection is deferred.

---

## Follow-ups (flagged during clarification)

External or deferred items — none block planning, but the starred ones need owner action before
the map feature works in a deployed environment:

- ⭐ **MapTiler account + API key** (held as a `wrangler secret`) and confirmation that its ToS
  permits persisting resolved coordinates; budget ~$25/mo Flex tier at launch. Google Places is
  the fallback if MapTiler is unsuitable. Implementation can proceed against a stub until the key
  is provided. *Revert option:* swap to Google Places (requires a Place-ID + ephemeral-coords
  schema due to its 30-day caching limit).
- **Per-Shabbat / per-day prayer-needs selection** — deferred; revisit if Feature 003 quorum
  aggregation needs per-occurrence granularity.
- **"Duplicate stay"** quick action for repeat travelers — not in v1 core; candidate for a fast
  follow-up. Full recurring stays are v2 (add to ROADMAP deferred list).
- **Permanent-delete UI** for a cancelled Stay — deferred to Feature 004 history management.
- **Precise Shabbat window** via zmanim — Feature 005 refines the v1 civil-date heuristic.
