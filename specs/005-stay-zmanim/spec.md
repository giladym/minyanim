# Feature Specification: Per-Stay Zmanim

**Feature Branch**: `005-stay-zmanim`

**Created**: 2026-06-18

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays**.

---

## Summary

When viewing a Stay (or a Minyan) that includes a Shabbat, the user sees the local
candle-lighting and Havdalah times for each Shabbat within the date range. Knowing local
Shabbat times is the first question travelers ask, so it is surfaced wherever a Stay's
location and dates are shown.

---

## User Scenarios & Testing

### User Story 1 — Shabbat Zmanim for a Stay (Priority: P1)

A user viewing a Stay sees candle-lighting and Havdalah times for that location's Shabbat.

**Independent Test**: A user viewing a Stay in Kraków over a Friday–Sunday sees that
Kraków Shabbat's candle-lighting and Havdalah times without leaving the page.

**Acceptance Scenarios**:

1. **Given** a Stay that includes a Friday–Saturday, **When** the user views it, **Then**
   each Shabbat within the range shows city, date, candle-lighting time, and Havdalah time
   in the location's local timezone.
2. **Given** a Stay spanning multiple Shabbatot, **When** viewed, **Then** zmanim are listed
   separately for each Shabbat.
3. **Given** a Stay with no Friday–Saturday in range, **When** viewed, **Then** no Shabbat
   zmanim section is shown.

---

### Edge Cases

- Zmanim provider unavailable → show a graceful "times unavailable" state rather than
  breaking the Stay view.
- Location near the international date line / unusual timezone → times computed in the
  location's local timezone, not the user's device timezone.
- Very high latitude where halachic times are ambiguous → display the provider's result
  with a note rather than failing.

---

## Requirements

### Functional Requirements

- **FR-001**: For any Stay (or Minyan) that includes a Friday–Saturday, the system MUST
  display candle-lighting and Havdalah times for that location's local Shabbat.
- **FR-002**: For multi-Shabbat ranges, the system MUST display each Shabbat's zmanim
  separately.
- **FR-003**: Zmanim MUST be computed for the Stay's location timezone, independent of the
  viewing device's timezone.
- **FR-004**: When zmanim data is unavailable, the system MUST degrade gracefully without
  breaking the surrounding view.

### Key Entities

- Uses **Stay** / **Minyan** locations and dates from [ROADMAP](../ROADMAP.md). No new
  persistent entity; zmanim are derived from a third-party source.

---

## Success Criteria

- **SC-001**: Candle-lighting and Havdalah times match an authoritative source for any city
  worldwide with a Shabbat in range.
- **SC-002**: Zmanim render within 2 seconds of opening a Stay detail.

---

## Assumptions

- Zmanim come from a reliable third-party provider (e.g. a Hebcal-class API), shared with
  the header calendar from feature 001.
- Weekday tefilla zmanim (e.g. earliest Shacharit) are out of scope for v1; only Shabbat
  candle-lighting and Havdalah are shown.
