# Feature Specification: Discovery & Quorum Formation

**Feature Branch**: `003-discovery-quorum`

**Created**: 2026-06-18

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays**.

---

## Summary

The multiplayer layer that turns individual Stays into real minyanim. A user opens a map +
search view, sees the *potential* (how many men have Stays in an area for a given date),
**hosts a Minyan** at a precise point, and others **commit** to it. A Minyan carries a
**nusach** and exposes claimable **role slots** (Ba'al Tefila, Ba'al Korei). Quorum is
≥10 men; a Shabbat-morning Torah-reading minyan is **ready** only when it also has a Sefer
Torah AND a Ba'al Korei. Beit Chabad pins appear as a static layer. Email + in-app
notifications fire on quorum events.

**Key modeling fact**: one place can host **multiple Minyanim** — distinguished by tefilla,
time, host, or nusach (e.g. a hotel with a 07:00 Shacharit and an 08:30 Shacharit, or a
separate Friday-night and Shabbat-morning minyan). A Minyan belongs to one location;
a location may have many Minyanim.

---

## User Scenarios & Testing

### User Story 1 — Discover Potential & Existing Minyanim (Priority: P1)

A user searches a city + date range and sees, on a map and list: how many men have Stays
there, and any Minyanim already hosted at specific points.

**Independent Test**: A user searches "Zakopane, Aug 2026" and sees the total men with
Stays in the area for each Shabbat, plus any already-hosted Minyanim at specific addresses.

**Acceptance Scenarios**:

1. **Given** a city + date query, **When** results load, **Then** the user sees per-Shabbat
   *potential* (sum of men with overlapping Stays in the area) and a list/map of any hosted
   Minyanim with their per-Minyan committed counts.
2. **Given** a location with several hosted Minyanim, **When** the user views that place,
   **Then** all its Minyanim are listed separately with their tefilla, time, and status.
3. **Given** the map view, **When** it loads, **Then** Beit Chabad (בית חב״ד) pins appear
   as a distinct static layer alongside user Minyanim.
4. **Given** filters for date range, "has Sefer Torah", and nusach, **When** applied,
   **Then** results narrow accordingly.

---

### User Story 2 — Host a Minyan (Priority: P1)

A user designates a specific point (their address or a chosen venue), date(s), tefilla(ot),
and time as a hosted Minyan that others can join.

**Why this priority**: The host-point is what converts scattered potential into a real,
committable quorum (the Excel's "מניין אצלנו").

**Independent Test**: A user hosts a Shabbat-morning Minyan at an address; it immediately
appears in discovery for that location and date, joinable by others.

**Acceptance Scenarios**:

1. **Given** a user in an area with potential, **When** they host a Minyan with location,
   date(s), tefilla(ot), time, nusach, and Sefer Torah availability, **Then** it is created
   and shown in discovery.
2. **Given** an existing place, **When** the user hosts another Minyan there with a
   different tefilla/time/nusach, **Then** both Minyanim coexist at that place.
3. **Given** a Shabbat-morning Minyan with a Sefer Torah, **When** it has 10 committed men
   AND a participant has claimed the Ba'al Korei role, **Then** its status reaches "ready".
4. **Given** the host sets a default nusach, **When** the Minyan is shown, **Then** its
   nusach is displayed and is filterable in discovery.

---

### User Story 3 — Commit to / Leave a Minyan (Priority: P1)

A user joins a hosted Minyan with their party size, or withdraws.

**Independent Test**: A user commits 3 men to a Minyan; the committed count rises by 3
within seconds. They withdraw; it drops back.

**Acceptance Scenarios**:

1. **Given** a hosted Minyan, **When** a user commits with a party size, **Then** the
   committed count increments and the user appears in the participant list.
2. **Given** a committed user, **When** they withdraw, **Then** the count decrements and
   they are removed from the list.
3. **Given** a user already committed, **When** they view the Minyan, **Then** they see
   their commitment and can change their party size.
4. **Given** a Minyan reaches ≥10 committed men, **When** the threshold is crossed,
   **Then** its status shows "quorum reached"; if it is a Shabbat-morning Torah-reading
   minyan, "ready" additionally requires a Sefer Torah and a claimed Ba'al Korei.
5. **Given** a Minyan below quorum or missing a Torah/Ba'al Korei, **When** viewed,
   **Then** it shows "N/10 — X more needed" and which readiness elements are still missing
   (Sefer Torah, Ba'al Korei).

---

### User Story 6 — Claim a Prayer Role (Priority: P2)

A committed participant claims a role on a Minyan — Ba'al Tefila (leader) or Ba'al Korei
(Torah reader) — so the host can see whether the minyan can actually function.

**Why this priority**: A Sefer Torah with no one to read it does not make a Shabbat-morning
minyan work; surfacing role gaps lets the group recruit the right person, not just bodies.

**Independent Test**: A participant claims Ba'al Korei on a Minyan; the Minyan shows the
role as filled and, once 10 men + a Torah are present, its status becomes "ready".

**Acceptance Scenarios**:

1. **Given** a Minyan with an open Ba'al Korei slot, **When** a committed participant claims
   it, **Then** the role shows as filled by that participant.
2. **Given** a participant who claimed a role, **When** they release it or withdraw their
   commitment, **Then** the slot reopens and any "ready" status recomputes.
3. **Given** a Minyan needing roles, **When** viewed, **Then** open role slots (Ba'al
   Tefila, Ba'al Korei) are clearly indicated.

---

### User Story 4 — Quorum Notifications (Priority: P2)

Participants and the host receive email + in-app notifications on quorum events.

**Independent Test**: A host and committed participants receive an email + in-app message
when their Minyan reaches 10 men.

**Acceptance Scenarios**:

1. **Given** a Minyan reaches quorum (10 men + Sefer Torah), **When** the threshold is
   crossed, **Then** the host and all committed participants receive an email and an in-app
   notification.
2. **Given** a Minyan is close (e.g. 8/10), **When** that threshold is configured,
   **Then** the host receives a "X more needed" notification.
3. **Given** a Minyan is cancelled by its host, **When** cancelled, **Then** committed
   participants receive a cancellation notification and see it marked cancelled.

---

### User Story 5 — Share a Minyan via WhatsApp (Priority: P2)

A host or participant shares a Minyan to recruit more men, via a WhatsApp link
pre-filled with the Minyan's key details and a join link.

**Why this priority**: Recruitment happens in existing WhatsApp groups; a one-tap share
is the fastest path from "8/10" to quorum and matches how communities coordinate today.

**Independent Test**: A user opens a Minyan, taps "Share to WhatsApp", and WhatsApp opens
with a message containing the location, date(s), tefilla/time, current count, and a join
link.

**Acceptance Scenarios**:

1. **Given** a hosted Minyan, **When** a user taps "Share to WhatsApp", **Then** WhatsApp
   opens with a pre-filled message including location, date(s), tefilla and time, current
   committed count, and a direct join link.
2. **Given** a recipient opens the shared join link, **When** they are signed in,
   **Then** they land directly on that Minyan's detail page ready to commit; if not signed
   in, they are sent through Google SSO and then to the Minyan.
3. **Given** the Minyan's specific address is private, **When** it is shared,
   **Then** the shared message MUST NOT include the specific address — only the public
   location (city/venue) and the join link.

---

### Edge Cases

- Overlapping Stays at the same place are summed into *potential*, but committed counts are
  per-Minyan — a man counted in potential is not "in" a minyan until he commits.
- A committed participant's underlying Stay is edited/cancelled (feature 002) → their
  commitment is updated or withdrawn accordingly, and counts recompute.
- A place has multiple Minyanim and a user tries to commit to two overlapping ones (same
  tefilla/time) → the user is warned about the conflict.
- Specific address of a Minyan/host is revealed only to committed participants.
- Beit Chabad pin selected → shows informational details only (not joinable in v1).
- Each Stay/Minyan shown in discovery MUST offer a "flag" affordance; content auto-hidden by
  moderation (3 distinct flags) MUST NOT appear in discovery results. Moderation behavior is
  defined in Feature 006.

---

## Requirements

### Functional Requirements

- **FR-001**: The system MUST let a user search by city/place and date range and display
  per-Shabbat *potential* (sum of men with overlapping Stays in the area).
- **FR-002**: The system MUST let a user host a Minyan at a precise location with date(s),
  tefilla(ot), time, nusach (Ashkenaz / Sefard / Chabad / Mizrachi / any), and Sefer Torah
  availability.
- **FR-003**: The system MUST support multiple Minyanim at the same location, distinguished
  by tefilla, time, host, or nusach.
- **FR-004**: Users MUST be able to commit a party size to a Minyan, change it, and withdraw.
- **FR-005**: A Minyan's status MUST reflect the committed man count; "quorum reached" requires
  ≥10 men. For a Shabbat-morning Torah-reading minyan, "ready" additionally requires a Sefer
  Torah AND a claimed Ba'al Korei.
- **FR-006**: Below readiness, a Minyan MUST display the current count, how many more men are
  needed, and which readiness elements are missing (Sefer Torah, Ba'al Korei).
- **FR-007**: The map MUST display user Minyanim and a distinct static Beit Chabad layer.
- **FR-008**: Discovery MUST support filtering by date range, Sefer Torah presence, and nusach.
- **FR-012**: A Minyan MUST expose claimable role slots (Ba'al Tefila, Ba'al Korei); a
  committed participant MUST be able to claim and release a role, and releasing or withdrawing
  MUST reopen the slot and recompute readiness.
- **FR-009**: The system MUST send email + in-app notifications on quorum-reached, near-quorum,
  and cancellation events to relevant host/participants. (Web push is deferred to v2.)
- **FR-010**: Specific address of a Minyan MUST be visible only to its committed participants.
- **FR-011**: Each Minyan MUST provide a "Share to WhatsApp" action that opens WhatsApp
  with a pre-filled message containing the public location, date(s), tefilla and time,
  current committed count, and a direct join link — and MUST NOT include the private
  specific address. Opening the join link MUST route the recipient (after Google SSO if
  needed) to that Minyan's detail page ready to commit.

### Key Entities

- **Minyan** (incl. nusach + Ba'al Tefila / Ba'al Korei role slots), **Commitment**,
  **Beit Chabad Pin**, **Notification** — see [ROADMAP](../ROADMAP.md). This feature
  establishes the Minyan, Commitment, role-claim, and Notification records and the
  aggregation logic.

---

## Success Criteria

- **SC-001**: A city + date discovery query returns potential and hosted Minyanim within
  2 seconds.
- **SC-002**: A commitment or withdrawal updates the Minyan's count within 5 seconds for
  all viewers.
- **SC-003**: A quorum-reached event delivers email + in-app notifications to all relevant
  participants within 1 minute.
- **SC-004**: "Ready" status for a Shabbat-morning Torah-reading minyan correctly requires
  ≥10 men AND a Sefer Torah AND a claimed Ba'al Korei in 100% of cases.

---

## Assumptions

- Geocoding/map provider and Beit Chabad dataset are resolved during planning (ROADMAP).
- "Near-quorum" notification threshold (e.g. 8/10) is configurable; default chosen in planning.
- Web push notifications are v2; v1 uses email + in-app only.
