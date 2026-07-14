# Feature Specification: A location holds events

**Feature Branch**: `015-location-events`

**Created**: 2026-07-13

**Status**: Shipped (merged to develop — PRs #60/#61; migration 0015 applied local + remote)

**Input**: A design brainstorm (delivered as an artifact) that separated two concerns the Stay
(location / **יעד**) form had conflated: *where a traveler is* (a clean anchor: city, dates, address,
contact, group size) and *what Jewish life they want there* (prayer needs, a Sefer Torah, a meal, a
gathering). The **chosen direction is Option B**: a location is a pure anchor that carries **0…N
events**; events attach to it via `event.stay_id`; adding one routes into the already-shipped
multi-type-event flow (014); the location shows an "האירועים שלי כאן" list and the Stay card shows an
"N אירועים" chip. This spec documents the feature **as built** — see [design/decision.md](./design/decision.md)
for the options weighed and [../014-multi-type-events/](../014-multi-type-events/) for the generic event
model this builds on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A location is a clean anchor, not a minyan form (Priority: P1)

A host or traveler creating/editing a location (יעד) describes *where they are and who is with them* —
city/country, arrival/departure dates, private address, contact, an optional folder, photos, and a light
**group size** ("מי מגיע — כמה אנשים בקבוצה") — with **no** prayer-service checkboxes and **no**
"brings a Sefer Torah" toggle on the location itself. Those minyan-specific intents no longer live on
the location; they live on actual minyan events attached to it.

**Why this priority**: The location form had grown to conflate a place with a single implied minyan.
Removing the minyan-shaped fields makes the location a reusable anchor that can carry a minyan, a Shabbat
meal (014 hosting), and a social gathering at once — the whole point of Option B.

**Independent Test**: Open the location edit form — the Sefer-Torah and prayer-needs controls are gone,
the group-size field reads "מי מגיע", and saving persists only anchor fields.

**Acceptance Scenarios**:

1. **Given** the location create/edit form, **When** a user fills it in, **Then** it captures only
   anchor fields + group size — no prayer/Sefer-Torah inputs.
2. **Given** an existing location saved before this change, **When** it is read back, **Then** its former
   `brings_sefer_torah`/`prayer_needs` values are simply gone (migration 0015 dropped the columns) and
   the location still loads with its group size intact.

---

### User Story 2 — Add events to a saved location (Priority: P1)

From a **saved** location's edit page, a user sees an **"האירועים שלי כאן"** ("My events here") section
listing every event attached to that location, and a **"＋ הוסף אירוע"** button. Tapping it routes into
the shipped 014 kind picker (`/event/new?fromStay=…`), pre-linked so the created event attaches back to
this location. The list carries any kind — a minyan, a hosting/seudah event, or a social gathering — each
row showing its kind badge, date, and the viewer's status, and links to the event's own page.

**Why this priority**: Attaching events to a location is the feature's core loop — it turns the anchor
into a hub for everything the traveler is organizing or joining there.

**Independent Test**: On a saved location, add a minyan and a hosting event via "＋ הוסף אירוע"; both
appear in "האירועים שלי כאן" with correct kind badges and link out to their pages.

**Acceptance Scenarios**:

1. **Given** a saved location with no events, **When** the user opens its edit page, **Then** the events
   section shows an empty-state hint and a "＋ הוסף אירוע" button.
2. **Given** the events section, **When** the user taps "＋ הוסף אירוע", **Then** they land in the 014
   kind picker with `fromStay` set, and the event they create is linked to this location
   (`event.stay_id`).
3. **Given** a location that hosts a minyan the user created **and** a hosting event the user joined from
   this location, **When** the section loads, **Then** both appear, deduplicated (one row per event),
   earliest-first.
4. **Given** a *fresh, unsaved* location (create mode), **When** the form renders, **Then** the events
   section is **hidden** — an event needs a saved location id to attach to.

---

### User Story 3 — A location's events surface on the dashboard (Priority: P2)

On the Stays dashboard, an active location's card shows a compact **"N אירועים"** chip when the location
has one or more attached events, so the traveler sees at a glance that a location is a hub, without
opening it. The chip disappears when the location has no events (or is past).

**Why this priority**: A light, glanceable signal that the anchor carries life — low cost, reuses the
same read as US2.

**Independent Test**: Add an event to a location; its dashboard card gains a "1 אירוע" chip; cancel the
event and the chip clears.

**Acceptance Scenarios**:

1. **Given** an active location with 2 attached events, **When** the dashboard renders, **Then** its card
   shows a "2 אירועים" chip.
2. **Given** a location with no events, **When** the dashboard renders, **Then** no events chip appears.
3. **Given** an event added/cancelled from a location, **When** the mutation settles, **Then** the chip
   count and the "האירועים שלי כאן" list update without a manual refresh (reactivity — FR-006).

---

### Edge Cases

- **A location is deleted while it still carries events** → `event.stay_id` is `ON DELETE SET NULL`, so
  the events survive as standalone (unfiled) events — deleting a location never cascades away its events.
- **A minyan hosted "from" a location** → both the event (`event.stay_id`) and the host's
  self-attendance (`attendance.stay_id`, from 013) point at the location; the location's events read
  deduplicates the two into one row (hosted precedence).
- **An event joined from a location the user does not own** → the events read is **owner-gated** (404 if
  the location is not the caller's); a location's events list is a private, owner-only surface.
- **A standalone event** (created without `fromStay`) → `event.stay_id` is `NULL`; it never appears in
  any location's events list, only in the global "My events" (014 FR-017).
- **Discovery potential after the Sefer-Torah drop** → per-Shabbat potential can no longer count Sefer
  Torahs (that datum lived on `stay.brings_sefer_torah`); it now surfaces **men-overlap only**.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A location (Stay / יעד) MUST be a pure anchor: city/country, coordinates, private address,
  arrival/departure dates, contact, folder, photos, and a light **group size** (`numMen`). The location
  MUST NOT carry minyan-specific intent — the former `brings_sefer_torah` and `prayer_needs` fields were
  REMOVED from the location (schema + create/update inputs + owner DTO + form). Migration **0015** drops
  the two columns.
- **FR-002**: `numMen` is retained on the location as a generic **group size** ("מי מגיע — כמה אנשים
  בקבוצה, כולל אותך"), feeding discovery potential-matchmaking; it is no longer framed as
  minyan-quorum-specific men-counting.
- **FR-003**: An event MUST be attachable to a location via a nullable `event.stay_id` FK
  (`ON DELETE SET NULL`, indexed). A location carries **0…N** events; an event belongs to at most one
  location (or none). Creating an event with `fromStay=<id>` stamps `event.stay_id` at creation, for
  every event type (minyan and gathering alike).
- **FR-004**: The system MUST expose a location's events via **`GET /api/stays/:id/events`** →
  `{ events: MyEventRow[] }`, **owner-gated** (404 when the Stay is not the caller's). The list is the
  UNION of events the caller **hosts** attached to the location (`event.stay_id = :id`) and events the
  caller **joined** from it (`attendance.stay_id = :id`), deduplicated by event id (hosted precedence),
  earliest-first, each carrying the derived status, the viewer's `myStatus`, and — on hosted
  approval-mode events — a `pendingRequestCount` badge (reusing the 014 "My events" row shape).
- **FR-005**: The location edit page MUST render an "האירועים שלי כאן" section (the FR-004 list) with a
  "＋ הוסף אירוע" button that routes into the shipped 014 kind picker with `fromStay` set. The section
  MUST appear only for a **saved** location (an unsaved create-mode form hides it — an event needs an id
  to attach to).
- **FR-006**: A location's events views (the "האירועים שלי כאן" list and the Stay-card "N אירועים" chip)
  MUST stay reactive: creating, cancelling, or RSVP'ing to an event invalidates the `["stay-events", …]`
  query so the list and the count update without a manual refresh.
- **FR-007**: The Stay dashboard card MUST show a compact "N אירועים" chip for an active location with
  ≥1 attached event, and render nothing when the location has no events.
- **FR-008**: Discovery MUST NOT regress from the field removal. Because `stay.brings_sefer_torah` is
  gone, per-Shabbat **potential** drops its `seferTorahCount` and surfaces men-overlap only; the
  Sefer-Torah *discovery filter* remains valid against minyan **events** (014, unaffected).
- **FR-009**: The removal MUST NOT regress the minyan model or the 013 stay↔minyan linkage: the
  host-self-attendance `attendance.stay_id` linkage (013) is untouched; `event.stay_id` is an additive,
  independent edge that also makes **hosted** events trackable to a location (013 had noted hosted
  minyanim were previously untracked on the event row).

### Key Entities *(include if feature involves data)*

- **Location (Stay / יעד)**: the anchor. After 0015: `city`, `country`, `lat`/`lng`, `address_private`,
  `arrival_date`, `departure_date`, `num_men` (group size), `contact_*`, `group_members`, `notes`,
  `images`, `folder_id`, `status`, `hidden`. **Dropped**: `brings_sefer_torah`, `prayer_needs`.
- **Event (generic, 014/003)**: gains a nullable `stay_id` FK (`ON DELETE SET NULL`) + `event_stay_idx`
  — the location↔event edge. Everything else is unchanged from 014.
- **MyEventRow (reused, 014 FR-017)**: the compact row the location-events read returns — `id`, `type`,
  `category`, `title`, `city`, `country`, `eventDate`, derived `status`, `myStatus`, optional
  `pendingRequestCount`. No new DTO was introduced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The location create/edit form contains zero minyan-specific fields (no Sefer-Torah toggle,
  no prayer-needs block); its group-size field reads as "מי מגיע".
- **SC-002**: An event created via "＋ הוסף אירוע" from a location is persisted with
  `event.stay_id = <location id>` and appears in that location's `GET /api/stays/:id/events` result.
- **SC-003**: A location's events list returns the correct deduplicated UNION (hosted ∪ joined), is
  owner-gated (404 for a non-owner), and orders earliest-first.
- **SC-004**: Deleting a location leaves its attached events intact (their `stay_id` becomes NULL) — zero
  cascade loss.
- **SC-005**: The minyan flow (host → commit → quorum → readiness → cancel) and the 013 location-change
  guard continue to pass unchanged after the field removal (no regression).
- **SC-006**: Adding or cancelling an event from a location updates the "האירועים שלי כאן" list and the
  "N אירועים" chip without a manual page refresh.

## Assumptions

- **`num_men` stays as a location group size.** Rather than dropping `num_men` with the other
  minyan-shaped fields, it is **kept and relabeled** as a generic group size ("מי מגיע"). It still feeds
  discovery potential (men-overlap), so removing it would have regressed matchmaking; relabeling was the
  minimal correct change (dev-no-real-data: no data migration concern).
- **Terminology unchanged.** The Hebrew UI term **יעד** (destination) for a Stay is kept (renamed in an
  earlier commit, not this feature), and the `/places` view stays **"מקומות"** (kosher places, 010) — a
  distinct concept from a user's own יעד. This feature adds no new user-facing noun; "האירועים שלי כאן"
  and "N אירועים" reuse the 014 event vocabulary (kind = minyan / hosting / social).
- **No new DTO or event-shape change.** The location-events read reuses the 014 `MyEventRow`/`MyEventsDTO`
  row shape; no new tier or contract was added beyond the `event.stay_id` column + the one route.
- **Owner-only surface.** A location's events list is private to the location owner. There is no public
  "events at this location" projection in v1 — public discovery of events remains the 014 bbox path.
- **Built retroactively-documented.** This feature shipped from the design brainstorm without a prior
  `specs/` directory; this spec set documents the delivered behavior (past tense / "as built").
- **Out of scope**: reassigning an existing standalone event to a location after creation (only
  create-time `fromStay` linking shipped); a public per-location events page; per-location event
  filtering/sorting controls.
