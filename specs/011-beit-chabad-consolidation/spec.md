# Feature Specification: Beit Chabad → Places Consolidation

**Feature Branch**: `011-beit-chabad-consolidation`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Retire the legacy beit_chabad_pin model and fold Chabad houses into the generic place/layer system (established in 010) … make the generic place model the single source of truth for Chabad houses and remove the legacy path entirely."

## Overview

Chabad houses are currently stored **twice**: in a narrow standalone Beit Chabad store (with a bespoke
discovery-map overlay introduced in feature 003) and — since feature 010 additively copied them — as
places in the admin-managed "Chabad houses" layer of the generic places model. This feature makes the
generic places model the **single source of truth**, repoints the discovery map at it, and removes the
legacy store and every code path that reads it. It is a consolidation/cleanup feature: its user-facing
value is one consistent, admin-manageable places system in which Chabad houses are simply another layer,
with no regression to what travelers see on the discovery map.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chabad houses still appear on the discovery map (Priority: P1)

A signed-in traveler browsing the discovery map in an area that has Chabad houses continues to see them —
with the same information (name, address, phone, location) they saw before — now sourced from the generic
places model rather than the legacy store. Nothing about their experience regresses.

**Why this priority**: This is the one externally observable behavior at risk. If consolidation drops or
changes what travelers see, the cleanup has failed its "zero regression" bar. Everything else is internal.

**Independent Test**: Seed the Chabad-houses layer with known places, open the discovery map over their
bounding box, and confirm each expected Chabad house renders with its name/address/phone and correct
location — matching the pre-consolidation output for the same data.

**Acceptance Scenarios**:

1. **Given** Chabad houses exist in an area, **When** a traveler opens the discovery map over that area,
   **Then** each Chabad house is shown with its name, address, phone, and location.
2. **Given** the same area and data as before the consolidation, **When** the discovery map is viewed,
   **Then** the set of Chabad houses shown is identical (no additions, drops, or field loss).
3. **Given** a viewport with no Chabad houses, **When** the discovery map is viewed, **Then** no Chabad
   houses are shown and no error occurs.
4. **Given** required data-source attribution applied before, **When** Chabad houses are shown, **Then**
   the attribution still renders.

---

### User Story 2 - One source of truth for Chabad houses (Priority: P1)

The platform keeps Chabad houses in exactly one place — the generic places model, in the admin-managed
"Chabad houses" layer. Every legacy Beit Chabad location is represented there, with no duplicates, and the
legacy store no longer exists.

**Why this priority**: Duplicated representations are the defect this feature exists to remove. Until the
legacy store is gone and the data fully reconciled, edits and imports can diverge between the two copies.

**Independent Test**: After the consolidation, verify the count of Chabad-house places equals the number
of distinct legacy locations, that no two entries describe the same location, and that the legacy store is
absent (no schema object, no code reference).

**Acceptance Scenarios**:

1. **Given** legacy Beit Chabad locations existed, **When** consolidation completes, **Then** each is
   present as a place in the "Chabad houses" layer.
2. **Given** the legacy and copied representations overlapped, **When** consolidation completes, **Then**
   each real-world location appears exactly once (deduplicated by provenance and by proximity).
3. **Given** consolidation is complete, **When** the system runs, **Then** no feature reads or writes the
   legacy store, and the legacy store no longer exists.
4. **Given** each location carries provenance (its origin source + identifier), **When** the data import is
   run again, **Then** no duplicate is created (the re-run is idempotent).

---

### User Story 3 - Admins manage Chabad houses in one place, reflected everywhere (Priority: P2)

An administrator adds, edits, or removes a Chabad house through the existing places manager, and the change
is reflected everywhere Chabad houses are shown — including the discovery map — because there is only one
underlying record.

**Why this priority**: Single-source management is the payoff of consolidation, but it depends on US1/US2
being done first; on its own it is a smaller incremental win.

**Independent Test**: As an admin, edit a Chabad-house place (e.g., change its name), then view the
discovery map over that location and confirm the edit appears.

**Acceptance Scenarios**:

1. **Given** an admin edits a Chabad-house place, **When** the discovery map is next viewed over that
   location, **Then** the edited details appear.
2. **Given** an admin removes a Chabad-house place, **When** the discovery map is next viewed, **Then** it
   no longer appears.
3. **Given** an admin adds a Chabad house in the layer, **When** the discovery map is viewed over its
   location, **Then** it appears.

---

### Edge Cases

- **Legacy location with no matching copied place**: reconciliation must create the missing place before
  the legacy store is removed, so no location is lost.
- **The same location present in both representations**: deduplicated to a single place — matched first by
  provenance (origin source + identifier), then by proximity for records lacking shared provenance.
- **A Chabad house whose layer is retired/hidden by an admin**: it is treated exactly as any other place in
  a retired/hidden layer (consistent behavior, no Chabad-specific rule).
- **Re-running the data import after consolidation**: idempotent — updates existing places in place,
  creates none anew for locations already present.
- **Attribution**: the required data-source attribution continues to render wherever Chabad houses appear.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST represent every Beit Chabad location as a place in the admin-managed "Chabad
  houses" layer, with the generic places model as the single source of truth.
- **FR-002**: The system MUST reconcile all pre-existing legacy Beit Chabad locations into places **before**
  removing the legacy store — no location may be lost.
- **FR-003**: The system MUST ensure each real-world Chabad house is represented exactly once, deduplicating
  by provenance (origin source + identifier) and, where provenance is absent, by proximity.
- **FR-004**: The system MUST preserve each location's provenance so that repeat data imports are
  idempotent (no duplicates created on re-run).
- **FR-005**: The system MUST remove the legacy Beit Chabad store and every code path that reads or writes
  it, so that no part of the platform depends on the legacy representation.
- **FR-006**: The discovery map MUST continue to show Chabad houses — with at least name, address, phone,
  and location — sourced from the places model, with no loss of information relative to before.
- **FR-007**: Where the discovery map surfaces Chabad houses, they MUST be presented consistently with the
  places-layer mechanism (no bespoke Chabad-only path remains).
- **FR-008**: Admin changes to Chabad-house places (add/update/delete via the existing places manager) MUST
  be reflected wherever Chabad houses are shown, including the discovery map.
- **FR-009**: Required data-source attribution MUST render wherever Chabad houses are shown.
- **FR-010**: Any user-facing surface changed by this feature MUST remain Hebrew-first / RTL, meet WCAG 2.1
  AA, use design tokens for color, and use localized strings only, with full he/en string parity.

### Key Entities *(include if feature involves data)*

- **Place** (generic, from 010): a mappable location with name, coordinates, address, phone, category/layer,
  and provenance (source + source identifier). Becomes the single record for a Chabad house.
- **Layer** ("Chabad houses", admin-managed, from 010): the grouping under which Chabad-house places live;
  toggleable and manageable like any other layer.
- **Beit Chabad Pin** (legacy — to be removed): the standalone Beit Chabad store and its bespoke discovery
  overlay; retired by this feature after reconciliation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of pre-existing Beit Chabad locations remain discoverable after consolidation (zero
  lost).
- **SC-002**: Zero duplicate Chabad-house entries — each real-world location appears exactly once.
- **SC-003**: The legacy Beit Chabad store no longer exists and no code path references it (verified by
  search + schema inspection).
- **SC-004**: Re-running the data import creates zero new records for locations already present (idempotent).
- **SC-005**: For identical underlying data, the discovery map shows the same Chabad houses with the same
  fields as before the consolidation (no user-visible regression).
- **SC-006**: An admin change to a Chabad house appears on the discovery map on the next view/refresh.
- **SC-007**: All changed UI passes the automated accessibility gate (WCAG 2.1 AA) and he/en string-parity
  check.

## Assumptions

- Dev is pre-launch with no production data; a **destructive migration** that drops the legacy store is
  approved (project "no real data" policy).
- The generic places model, the admin-managed "Chabad houses" layer, the places view, and the data importer
  already exist (feature 010); feature 010 already copies legacy pins into the layer, so reconciliation is
  primarily verification + closing any gap, not a from-scratch migration.
- The discovery map keeps surfacing Chabad houses (this is not a removal of the feature); only its data
  source and rendering path change. Chabad houses are informational on the map (not joinable), as before.
- Provenance for the copied pins is the origin marker recorded in 010 (an internal seed source + the legacy
  identifier); the OSM/Overpass importer's own provenance remains the canonical source going forward.
- This feature amends feature 003's discovery Beit Chabad overlay and fulfills the note in feature 010 that
  deferred the destructive drop and discovery fold to 011.
