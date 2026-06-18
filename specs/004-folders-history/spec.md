# Feature Specification: Folders & History

**Feature Branch**: `004-folders-history`

**Created**: 2026-06-18

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays**.

---

## Summary

Lets heavy users organize their Stays into self-named folders (by country, trip, year) and
review past Stays in a history view marked "attended". Makes the dashboard manageable as
Stays accumulate.

---

## User Scenarios & Testing

### User Story 1 — Organize Stays into Folders (Priority: P1)

A user creates folders and assigns Stays to them.

**Independent Test**: A user creates "Europe 2026", assigns two Stays, renames it to
"Summer Europe", and deletes a separate empty folder — with no data loss.

**Acceptance Scenarios**:

1. **Given** a user creates a folder, **When** they assign a Stay to it, **Then** the Stay
   appears under that folder in the dashboard.
2. **Given** a user renames a folder, **When** saved, **Then** the folder's Stays remain
   intact under the new name.
3. **Given** a user deletes a folder containing Stays, **When** they confirm, **Then** they
   are warned and the Stays move to an "Unfiled" group rather than being deleted.
4. **Given** the dashboard, **When** viewed, **Then** the user can browse by folder or see
   all Stays flat.

---

### User Story 2 — History of Past Stays (Priority: P2)

A user reviews Stays whose dates have passed.

**Independent Test**: A user with one past and two upcoming Stays opens History and sees
only the past Stay, tagged "attended".

**Acceptance Scenarios**:

1. **Given** a Stay whose departure date has passed, **When** the user opens History,
   **Then** it appears there tagged "attended" and is removed from the active dashboard.
2. **Given** the History view, **When** it loads, **Then** past Stays are grouped/sortable
   (e.g. by date or folder).

---

### Edge Cases

- Deleting a folder with Stays → Stays reassigned to "Unfiled", never deleted.
- A Stay spanning today (started, not yet ended) → remains active, not yet in History.
- A cancelled Stay → distinguished from an attended past Stay in History.

---

## Requirements

### Functional Requirements

- **FR-001**: A user MUST be able to create, rename, and delete personal folders.
- **FR-002**: A user MUST be able to assign Stays to folders and move them between folders.
- **FR-003**: Deleting a non-empty folder MUST warn the user and reassign its Stays to
  "Unfiled" rather than deleting them.
- **FR-004**: The dashboard MUST allow browsing Stays by folder or as a flat list.
- **FR-005**: Stays whose departure date has passed MUST appear in a History view tagged
  "attended" and be removed from the active dashboard.

### Key Entities

- **Folder** — see [ROADMAP](../ROADMAP.md). This feature establishes folder management.

---

## Success Criteria

- **SC-001**: Folder create / rename / delete / reassign operations complete with no Stay
  data loss in 100% of cases.
- **SC-002**: A Stay automatically moves to History within one day of its departure date
  passing.

---

## Assumptions

- Folders group a user's own Stays only (not Minyanim or other users' data).
- "Attended" is inferred from the date passing; no explicit check-in is required in v1.
