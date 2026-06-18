# Feature Specification: Stays — Create & Manage

**Feature Branch**: `002-stays-create-manage`

**Created**: 2026-06-18

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **001 Platform Foundation**.

---

## Summary

The core data unit of the product. A signed-in user registers a **Stay** (שהייה) — where
they will be, when, with how many men, and what prayer needs — using a map location
picker. They see and manage all their Stays in a dashboard sorted nearest-first, and can
edit or cancel them. After this feature, the product is usable single-player: a user can
fully record their travel-prayer plans even before the discovery/quorum layer exists.

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
2. **Given** required fields (location, arrival date, departure date, number of men),
   **When** the user submits, **Then** the Stay is saved and appears in the dashboard.
3. **Given** a missing required field, **When** the user submits, **Then** inline Hebrew
   validation messages point to each missing field.
4. **Given** the user is bringing a Sefer Torah, **When** they toggle "מביא ס״ת",
   **Then** the Stay shows a Sefer Torah badge.
5. **Given** the user specifies prayer needs, **When** the Stay covers a Friday–Saturday,
   **Then** Shabbat tefillot are included by default; for weekdays the user may select
   Shacharit / Mincha / Maariv.
6. **Given** an arrival date in the past, **When** the user submits, **Then** creation is
   rejected with a clear message.

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
- Specific address entered → stored but never displayed publicly (visibility rules per
  ROADMAP; enforced where the Stay is exposed to others in feature 003).

---

## Requirements

### Functional Requirements

- **FR-001**: A signed-in user MUST be able to create a Stay with location (map-selected),
  arrival date, departure date, and number of men, plus optional Sefer Torah flag, prayer
  needs, contact, group members, notes, and folder.
- **FR-002**: The Add-Stay form MUST provide a map with search-by-name that resolves a
  selected place to city, country, and coordinates.
- **FR-003**: The system MUST reject Stays with an arrival date in the past, a departure
  date before arrival, or a non-positive man count, with clear Hebrew messages.
- **FR-004**: A Stay MUST support Shabbat tefillot by default and optional weekday tefilla
  selection (Shacharit / Mincha / Maariv).
- **FR-005**: The dashboard MUST list a user's Stays sorted by nearest upcoming arrival
  date first, and visually distinguish past Stays.
- **FR-006**: A user MUST be able to edit and cancel Stays they own.
- **FR-007**: A specific address on a Stay MUST be stored privately and never exposed
  publicly.

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

- Folder assignment is offered as an optional field here, but folder management (create /
  rename / delete) is feature 004.
- The map/geocoding provider is selected during planning (see ROADMAP open items).
- Discovery, joining, and quorum aggregation are feature 003 — this feature is single-user.
