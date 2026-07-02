# Feature Specification: Per-Stay Zmanim

**Feature Branch**: `005-stay-zmanim`

**Created**: 2026-06-18

**Status**: Clarified (2026-06-21)

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays**; integrates with **003
Minyanim** and reads a preference added to the **001** profile.

---

## Summary

When viewing a Stay (or a hosted Minyan) that includes a Shabbat, the user sees that location's
local **candle-lighting** and **Shabbat-end (Havdalah)** times for each Shabbat within the date
range. Local Shabbat times are the first thing a traveler needs, so they are surfaced wherever the
Stay's location and dates already appear. All times are **computed server-side** from the location's
coordinates — no external service, and the computation library never reaches the browser.

---

## Clarifications

### Session 2026-06-21

Reconciled from a two-role spec review (expert PM + expert Architect) against the ROADMAP, the
constitution, and the shipped 001/002/003/004 code, plus two product decisions by the owner.
Decisions (D#) are referenced from the requirements.

- **D1 — Computed server-side with `kosher-zmanim`, NOT a third-party API (corrects the draft).**
  The original draft assumed a "Hebcal-class API." The real architecture (CLAUDE.md, 001's
  `calendar.ts`) computes everything **in-process via `kosher-zmanim` (LGPL)** — offline, no network,
  no quota, no secret. 005 extends that integration to `ComplexZmanimCalendar` + `GeoLocation`. The
  **library and its astronomical inputs MUST never ship to the client**; only formatted time strings
  + opinion labels cross the boundary. The pending LGPL legal sign-off is a **launch-gating
  follow-up** (an ADR documents server-side-only containment).
- **D2 — Shabbat-only scope; Yom Tov deferred; Yom-Tov-adjacency guarded.** v1 shows **Shabbat**
  candle-lighting + Havdalah only, matching 002's civil `coversShabbat` heuristic. Yom Tov zmanim are
  deferred to a later feature (added to ROADMAP deferred). **Guard:** when a Shabbat is adjacent to
  Yom Tov (the Friday is Erev Yom Tov, or motzaei Shabbat runs directly into Yom Tov so Havdalah is
  deferred/omitted), the Havdalah time MUST be **suppressed or annotated** — never shown as a plain,
  wrong time. A confidently-wrong halachic time is worse than omission.
- **D3 — Candle-lighting offset (fixed, no setting).** Candle-lighting = **18 minutes before
  sunset**, applied **40 minutes automatically when the location is Jerusalem** (the prevalent
  custom). Not user-configurable in v1.
- **D4 — Havdalah: compute BOTH opinions; user-selectable; Geonim default.** Both end-of-Shabbat
  times are always computed and returned: **Geonim ~8.5° tzeit** (the common "Shabbat ends") and
  **Rabbeinu Tam 72 minutes** (stringent). The displayed one follows a **personal profile setting**
  `havdalahOpinion ∈ {geonim, rabbeinu_tam, both}`, **default `geonim`** (most common); `both` shows
  both, labeled (US3). Each time is labeled with its opinion so the basis is never ambiguous.
- **D5 — Detail-scoped compute, NOT list reads.** Zmanim are served by a **dedicated endpoint**
  (`GET /api/stays/:id/zmanim`, owner-scoped; an equivalent for a Minyan, public) — **not** added to
  `OwnerStayDTO` and **not** computed inside `toOwnerDTO`/list reads (computing N stays × M Shabbatot
  on every dashboard load is wasteful). The Stay **card** shows an **expandable "Shabbat times"
  section**, gated by the existing `coversShabbat` flag and **lazy-fetched on expand**. No new
  Stay-detail page is introduced (keeps scope tight).
- **D6 — Coordless degradation = a conversion nudge, not an error.** 002 allows manual city/country
  entry with **no coordinates**. When such a Stay covers a Shabbat, the zmanim section shows a clear
  inline state ("add a map location to see Shabbat times") with a **CTA into 002's edit/map-pick
  flow** — never an error or a blank. **No on-read geocoding** of the stored city string.
- **D7 — Uncomputable times handled explicitly.** Above the polar circles `kosher-zmanim` returns
  **no sunset/tzeit** for some dates. Such a Shabbat entry returns its time fields as `null` and the
  UI shows a "times cannot be computed at this location" note — **never a fabricated fallback** time.
- **D8 — Location timezone, DST-correct.** Times are formatted `HH:mm` in the **location's IANA
  timezone** (via the shipped `tzFromCoords`), independent of the viewer's device, DST-correct by
  construction. Elevation is treated as `0` (sea-level sunset; we hold no per-Stay elevation).
- **D9 — Minyan zmanim are public + active-only; History excluded.** A Minyan's zmanim are visible
  in the **public** projection (they reveal nothing private — just the public city/date's Shabbat
  times), computed from the **public/fuzzed** coordinates (the sub-second difference is immaterial),
  and are **informational and independent** of the host's manually-entered tefilla times. Only
  **Shabbat-dated** Minyanim show them. Zmanim are surfaced only on **active** Stays/Minyanim — **not
  in History (004)**.
- **D10 — Friday/Saturday pairing.** For each Shabbat (a Saturday in range), candle-lighting is
  computed on the **Friday** (Saturday − 1 day) sunset; Havdalah on **Saturday** night. The existing
  `shabbatSaturdaysInRange` helper enumerates the Saturdays.

---

## User Scenarios & Testing

### User Story 1 — Shabbat Zmanim for a Stay (Priority: P1)

A user viewing a Stay sees candle-lighting and Havdalah times for that location's Shabbat(ot).

**Independent Test**: A user with a Stay in Kraków over a Friday–Sunday expands the Stay card and
sees Kraków's candle-lighting and Havdalah times for that Shabbat, in Kraków local time, without
leaving the dashboard.

**Acceptance Scenarios**:

1. **Given** a Stay (with coordinates) that includes a Friday–Saturday, **When** the user expands its
   zmanim section, **Then** each Shabbat within the range shows the date, candle-lighting time, and
   Havdalah time in the location's local timezone (D1/D8/D10).
2. **Given** a Stay spanning multiple Shabbatot, **When** viewed, **Then** zmanim are listed
   separately for each Shabbat (D10).
3. **Given** a Stay with no Friday–Saturday in range, **When** viewed, **Then** no zmanim section is
   shown (the card's `coversShabbat` gate is false).
4. **Given** a Stay entered as a manual city with **no coordinates** that covers a Shabbat, **When**
   the user opens the zmanim section, **Then** a clear "add a map location" state with a CTA into the
   edit/map-pick flow is shown — not an error (D6).
5. **Given** a Stay at a very high latitude where Shabbat times can't be computed, **When** viewed,
   **Then** that Shabbat shows a "cannot be computed at this location" note, never a fabricated time
   (D7).

---

### User Story 2 — Shabbat Zmanim for a Minyan (Priority: P2)

Anyone viewing a hosted Shabbat Minyan sees the local candle-lighting and Havdalah times for it.

**Independent Test**: A signed-out (or non-committed) viewer opening a public Shabbat Minyan in
Vienna sees Vienna's candle-lighting and Havdalah times, identical to what a committed viewer sees.

**Acceptance Scenarios**:

1. **Given** a Shabbat-dated Minyan, **When** any permitted viewer opens its detail, **Then** the
   local candle-lighting and Havdalah times are shown, computed from the Minyan's public/fuzzed
   coordinates (D9).
2. **Given** a non-Shabbat (weekday) Minyan, **When** viewed, **Then** no zmanim section is shown.
3. **Given** the host set a Mincha tefilla time, **When** zmanim are shown, **Then** the zmanim are
   presented as independent informational times (not conflated with the host's tefilla schedule, D9).

---

### User Story 3 — Personal Havdalah Preference (Priority: P3)

A user chooses which end-of-Shabbat opinion they see, so the times match their minhag.

**Independent Test**: A user sets their Havdalah preference to "Rabbeinu Tam"; reopening any Stay's
zmanim now shows the 72-minute time as the Havdalah; switching to "both" shows both, labeled.

**Acceptance Scenarios**:

1. **Given** a new user who has set no preference, **When** they view zmanim, **Then** the **Geonim
   ~8.5° tzeit** is shown as Havdalah by default (D4).
2. **Given** a user who sets `havdalahOpinion` to `rabbeinu_tam`, **When** they view zmanim, **Then**
   the Rabbeinu Tam 72-minute time is shown as Havdalah.
3. **Given** a user who sets `both`, **When** they view zmanim, **Then** both end-of-Shabbat times
   are shown, each labeled with its opinion.

---

### Edge Cases

- **Coordless Stay** covering Shabbat → "add a map location" CTA, never an error (D6).
- **High latitude / polar** date with no sunset or tzeit → "cannot be computed" note, no fabricated
  time (D7).
- **Yom Tov adjacency** (Erev Yom Tov Friday; motzaei Shabbat into Yom Tov) → Havdalah suppressed or
  annotated, never shown wrong (D2).
- **Multi-Shabbat range** → one entry per Shabbat; long ranges may collapse beyond ~6 behind a "show
  all" expander (planning constant, not a rule).
- **Stay starting/ending mid-Shabbat** (e.g. arrives Saturday afternoon) → the full Shabbat's
  candle-lighting + Havdalah are still shown when the range overlaps that Shabbat (matches 002/003
  bucketing); already-passed times are not suppressed.
- **DST transition Shabbat** → correct local clock time, because computation uses the IANA zone (D8).
- **Date-line / unusual timezone** → times in the location's tz, not the device's (D8).
- **Past Stays (History, 004)** → no zmanim section (active-only, D9).

---

## Requirements

### Functional Requirements

- **FR-001**: For a Stay **with coordinates** that includes a Shabbat (Friday–Saturday), the system
  MUST compute and display that location's candle-lighting and Havdalah time(s) for **each** Shabbat
  in the range, in the location's local timezone (D1/D8/D10).
- **FR-002**: Zmanim MUST be **computed server-side** with `kosher-zmanim`; neither the library nor
  its astronomical inputs may be sent to the client — only formatted time strings and opinion labels
  (D1). No external zmanim API and no network call on the read path.
- **FR-003**: Candle-lighting MUST use **18 minutes before sunset**, automatically **40 minutes for
  Jerusalem** (D3). Both end-of-Shabbat opinions — **Geonim ~8.5° tzeit** and **Rabbeinu Tam 72
  minutes** — MUST be computed and returned; the displayed one follows the user's `havdalahOpinion`
  preference (default `geonim`); `both` shows both, labeled (D4).
- **FR-004**: A user MUST be able to set a personal **`havdalahOpinion`** preference (`geonim` |
  `rabbeinu_tam` | `both`, default `geonim`) on their profile, applied wherever zmanim are shown
  (D4).
- **FR-005**: When a Stay covering a Shabbat has **no coordinates**, the system MUST show a clear
  "add a map location" state with a CTA into the edit/map-pick flow — not an error or a blank — and
  MUST NOT geocode the stored city on the read path (D6).
- **FR-006**: When Shabbat times **cannot be computed** for a date+location (e.g. polar no-sunset),
  the system MUST show an explicit "cannot be computed at this location" note for that Shabbat and
  MUST NOT display a fabricated time (D7).
- **FR-007**: When a Shabbat is **adjacent to Yom Tov** such that Havdalah is deferred/omitted, the
  system MUST suppress or annotate the Havdalah rather than show a plain wrong time (D2).
- **FR-008**: A Shabbat-dated **Minyan's** zmanim MUST be shown in the **public** projection,
  computed from the public/fuzzed coordinates, independent of the host's tefilla times; weekday
  Minyanim show none (D9).
- **FR-009**: Zmanim MUST be served **detail-scoped** (a dedicated read), **not** embedded in Stay
  list reads, and gated on the existing `coversShabbat` flag for the card affordance (D5). Surfaced
  on **active** Stays/Minyanim only — not in History (D9).
- **FR-010**: All 005 UI — the expandable zmanim section, the per-Shabbat list, the coordless CTA,
  the "cannot compute" note, and the profile preference control — MUST meet WCAG 2.1 AA, be
  RTL-correct and keyboard-operable, use i18n-only strings (he/en parity) and tokens-only colors.

### Key Entities

- **Zmanim (derived, not stored)** — per Shabbat: `{ shabbatDate, candleLighting, havdalahGeonim,
  havdalahRabbeinuTam }` as formatted local-time strings (any may be `null` when uncomputable).
  Derived at read time from the Stay/Minyan coordinates + IANA timezone; **no persistent column, no
  cron** (mirrors 002/003/004 derived-at-read).
- **User preference** — a new `havdalahOpinion` field on the **001 user profile** (alongside
  `language`/`theme`): `geonim | rabbeinu_tam | both`, default `geonim`.
- Reuses **Stay** / **Minyan** location + dates; introduces no new persistent table.

---

## Success Criteria

- **SC-001**: For a fixed test-city set — Jerusalem, Kraków, New York, London, plus one
  high-latitude and one date-line case — computed candle-lighting and **both** Havdalah times match
  an authoritative luach / Hebcal (for the same opinion/offset) **within ±1 minute**.
- **SC-002**: Opening a Stay's (or Minyan's) zmanim returns within **2 seconds** via a single detail
  read, with **no** added cost to dashboard/list loads (zmanim are never computed in list reads).
- **SC-003**: A coordless Stay covering a Shabbat shows the add-location CTA in 100% of cases — never
  an error or blank (D6).
- **SC-004**: A Stay/Minyan with no Shabbat in range shows no zmanim section; a weekday Minyan shows
  none (D2/D9).
- **SC-005**: A high-latitude no-sunset Shabbat shows the "cannot be computed" note, never a
  fabricated time, in 100% of cases (D7).
- **SC-006**: `kosher-zmanim` (and any astronomical raw data) is **absent from the frontend bundle** —
  only formatted strings + labels cross the boundary (verified) (D1).
- **SC-007**: The `havdalahOpinion` preference is honored wherever zmanim render (default `geonim`),
  in 100% of cases (D4).
- **SC-008**: Zmanim UI + the preference control meet WCAG 2.1 AA and are RTL-correct and
  keyboard-operable (verified with Playwright + axe-core).

---

## Assumptions

- `kosher-zmanim` is already a backend dependency (001) and stays **server-side only**; 005 expands
  the surface (zmanim, not just Hebrew dates) but introduces no new license obligation (ADR records
  the containment; LGPL legal sign-off remains a launch gate).
- Weekday tefilla zmanim (earliest Shacharit, sof zman, etc.) and **Yom Tov** zmanim are **out of
  scope for v1** (Shabbat candle-lighting + Havdalah only).
- Most coordinate-bearing Stays come from 002's map picker; manual-city Stays are the minority and
  get the coordless CTA (D6).
- Per-location / per-user candle-lighting offset configuration is out of scope (fixed 18/40, D3);
  only the Havdalah opinion is user-selectable in v1 (D4).
- Elevation data is not held per Stay; sea-level sunset is used (D8).
