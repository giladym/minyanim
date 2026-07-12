# Feature Specification: Multi-type events (meals, gatherings, occasions)

**Feature Branch**: `014-multi-type-events`

**Created**: 2026-07-12

**Status**: Draft

**Input**: Generalize the event model beyond "minyan" so users can host more kinds of Jewish
gatherings — the flagship being hosting travelers / lonely Jews for a Shabbat or holiday meal —
plus simple gatherings (party/kiddush/meetup), with holidays as a cross-cutting tag and a
generalized RSVP model. (Research: OneTable, Shabbat.com, Partiful, Luma, Meetup, Eventbrite,
Facebook Events, Chabad.org.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Host a traveler for a Shabbat / holiday meal (Priority: P1)

A person at home wants to open their table to Jewish travelers for a Shabbat or holiday meal. They
create a **meal** event: a title, the meal (Shabbat dinner / lunch / seudah shlishit / holiday /
weekday), date and start time, an RSVP cutoff, how many **seats** are available, the kashrut level and
which dietary needs they can accommodate, what they're offering and what guests might bring, and their
neighborhood (city shown publicly, exact address hidden). Because seats are limited, the meal uses
**request-and-approve**: a traveler requests a seat, the host sees who they are (name, profile, phone
if shared) and approves or declines. On approval the guest sees the exact address and host contact.

**Why this priority**: This is the differentiated, mission-critical flow — it's what makes JStay more
than a minyan finder, and it directly serves the core promise ("a traveler on a Stay finds Jewish life
nearby"). It is the strongest fit with best-in-class Jewish hosting apps (OneTable / Shabbat.com).

**Independent Test**: A host can create a meal, a different traveler can find it near their Stay,
request a seat, and the host can approve — after which (and only then) the traveler sees the exact
address. Fully demonstrable on its own.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a meal with N seats and request-approval enabled,
   **Then** the meal is discoverable publicly showing city/neighborhood, meal type, occasion, seats
   remaining, dietary info, and the host's public profile — but NOT the exact address.
2. **Given** a discoverable meal with seats remaining, **When** a traveler requests a seat, **Then**
   the request is pending and the host is notified with the requester's name + profile (+ phone if the
   requester shares it).
3. **Given** a pending seat request, **When** the host approves it, **Then** the guest becomes a
   confirmed attendee, the seats-remaining count drops, and the guest can now see the exact address,
   entry notes, and host contact.
4. **Given** a pending seat request, **When** the host declines it, **Then** the requester is notified,
   remains without a seat, and never sees the exact address.
5. **Given** a meal at full seat capacity, **When** another traveler requests a seat, **Then** they are
   placed on a waitlist (not confirmed), and are promoted if a confirmed guest cancels.

---

### User Story 2 — Discover & request meals/gatherings near my Stay (Priority: P1)

A traveler with an active Stay wants to see everything happening nearby, not just minyanim. On
discovery (and from their Stay) they see minyanim, meals, and gatherings in the area, filterable by
**event type** and by **holiday occasion** (e.g., "Shabbat", "Pesach"). They can open any event and
join/request in the way that event allows.

**Why this priority**: Without discovery, hosted meals/gatherings are invisible — this is what makes
hosting worthwhile and completes the loop with the existing Stay-anchored discovery.

**Independent Test**: With a mix of a minyan, a meal, and a gathering near a location, a traveler can
list them, filter to just "meals" or just "Pesach", and open each.

**Acceptance Scenarios**:

1. **Given** minyanim, meals, and gatherings exist near a location, **When** a traveler opens
   discovery there, **Then** all three appear, each labeled with its type and occasion.
2. **Given** the discovery list, **When** the traveler filters by type = "meal" and occasion = "Shabbat",
   **Then** only Shabbat meals are shown.
3. **Given** a traveler viewing a nearby meal, **When** they choose to attend, **Then** they are taken
   through that event's join flow (request-approval for a meal, simple RSVP for a gathering).

---

### User Story 3 — Host a general gathering (party / kiddush / meetup) (Priority: P2)

A user wants to invite people to a simple get-together (a kiddush, a Purim party, a young-professionals
meetup). They create a **gathering** with a title, description, date/time, optional capacity, and a
subcategory — with a simple RSVP (I'm coming), no approval required by default.

**Why this priority**: Broadens the app to everyday community life with minimal new surface; most of it
reuses the shared event fields.

**Independent Test**: A user creates a gathering with a capacity, others RSVP until it's full, and a
late RSVP is waitlisted.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a gathering, **Then** it is discoverable and others
   can RSVP directly (no host approval).
2. **Given** a gathering with a capacity, **When** RSVPs reach capacity, **Then** further RSVPs are
   waitlisted.

---

### User Story 4 — Existing minyan hosting continues unchanged (Priority: P1 / regression)

Everything a host or participant can do with a **minyan** today (host from a Stay, commit party size,
quorum + readiness at 10 men + Sefer Torah + roles, the tiered address reveal, cancel, the 013
location-change guard) continues to work identically after the model is generalized.

**Why this priority**: The generalization must not regress the existing, shipped minyan experience.

**Independent Test**: The full existing minyan flow (host → commit → quorum → readiness → cancel) still
passes end-to-end.

**Acceptance Scenarios**:

1. **Given** the generalized event model, **When** a user hosts a minyan and 10 men commit with a
   Sefer Torah and roles filled, **Then** the minyan reads as ready exactly as before.

---

### Edge Cases

- A meal host approves more seat requests than seats remaining → the system MUST prevent over-booking
  (approval fails once seats are full; excess requests stay waitlisted).
- A confirmed meal guest cancels → a waitlisted requester is promoted (and notified); seats-remaining
  updates.
- An event's occasion/holiday doesn't apply (a plain weekday meetup) → occasion is optional ("none").
- A host cancels an event with confirmed guests → all confirmed attendees are notified (as minyans do).
- A meal is moderation-hidden or the host is suspended → it is not discoverable and cannot take new
  requests, consistent with existing moderation rules.
- A guest requests a meal but never shared a phone → the host still sees name + profile; phone stays
  hidden per the user's share-phone preference.
- Exact address must never leak to a non-confirmed viewer for any event type (same invariant as minyan).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support multiple event types — at minimum **minyan**, **meal**, and
  **gathering** — while preserving all existing minyan behavior.
- **FR-002**: Every event MUST have a title, a location (city/country/coordinates), a date, an optional
  start/end time, an optional **occasion** tag (from a fixed set of Jewish occasions plus "none"), an
  optional description, optional photos, a host, a visibility setting, and an RSVP configuration.
- **FR-003**: The system MUST provide a generalized attendance/RSVP model with a per-attendee **status**
  (pending, confirmed, waitlisted, declined, cancelled) and a **party size**, usable by every event
  type; a minyan interprets party size as number of men.
- **FR-004**: Each event MUST have an **RSVP mode**: **open** (join is auto-confirmed), **approval**
  (the host confirms each request), or **invite** (only invited users may join). Meals default to
  approval; minyanim and gatherings default to open.
- **FR-005**: Each event MUST have a **visibility** setting: **public** (discoverable), **unlisted**
  (reachable only by direct link), or **invite** (only invited users). Visibility and RSVP mode are
  independent (a public event may still require approval).
- **FR-006**: An event MAY have a **capacity** (seats for a meal; unlimited when unset). When capacity
  is reached, further joins MUST be **waitlisted**; when a confirmed attendee cancels, the earliest
  waitlisted attendee MUST be promoted to confirmed and notified.
- **FR-007**: For approval-mode events, the host MUST see each requester's name and public profile (and
  phone only if that user shares it) and MUST be able to approve or decline; approving MUST fail if
  capacity is already full.
- **FR-008**: The exact address, entry notes, and host contact MUST be revealed ONLY to confirmed
  attendees (and the host), for every event type — reusing the existing tiered visibility rules.
  Non-confirmed viewers see city/neighborhood only.
- **FR-009**: A **meal** event MUST additionally capture: number of seats, meal type (Shabbat dinner /
  lunch / seudah shlishit / holiday meal / weekday), kashrut level, dietary accommodations, "what I'm
  offering", "what to bring", and optional alcohol/accessibility notes.
- **FR-010**: A **gathering** event MUST additionally capture a subcategory (e.g., party, kiddush,
  farbrengen, social/meetup).
- **FR-011**: Discovery MUST surface meals and gatherings near a location alongside minyanim, with the
  ability to filter by **event type** and by **occasion**.
- **FR-012**: Hosts MUST be able to create, edit, and cancel meals and gatherings; cancelling MUST
  notify confirmed attendees.
- **FR-013**: Meals and gatherings MUST be subject to the same moderation/flagging and
  active-user-enforcement rules as minyanim and stays.
- **FR-014**: Notifications MUST cover the new flows: a seat request received (to the host), a request
  approved/declined (to the requester), and waitlist promotion (to the promoted guest).
- **FR-015**: Approve/decline of a seat request MAY reuse the existing direct-messaging capability so
  host and guest can coordinate.

### Key Entities *(include if feature involves data)*

- **Event (generalized)**: any hosted happening. Shared attributes: type, title, host, location,
  date/time, occasion tag, description, photos, visibility, RSVP mode, capacity, status
  (forming/cancelled stored; "ready/full" derived per type).
- **Meal detail**: the meal-specific attributes of a meal event (seats, meal type, kashrut, dietary
  accommodations, offering, bring-items, alcohol/accessibility).
- **Gathering detail**: the gathering-specific attributes (subcategory).
- **Minyan detail** (existing): nusach, Sefer Torah, prayer services/times, role slots.
- **Attendance / RSVP**: a person's relationship to an event — party size, status
  (pending/confirmed/waitlisted/declined/cancelled), any roles, and the originating Stay (if any).
- **Occasion**: a Jewish holiday/observance tag (Shabbat, Rosh Hashanah, Yom Kippur, Sukkot, Pesach,
  Shavuot, Chanukah, Purim) or "none", used as a cross-cutting discovery filter — not an event type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A host can create a meal that opens seats to travelers in under 3 minutes.
- **SC-002**: A traveler can find a nearby meal, request a seat, be approved, and see the exact address
  — all within a single session, with the address never visible before approval.
- **SC-003**: 100% of non-confirmed viewers are prevented from seeing an event's exact address, for
  every event type (zero address leaks).
- **SC-004**: Discovery near a location returns minyanim, meals, and gatherings together, and filtering
  by type or occasion narrows results correctly in every case.
- **SC-005**: The existing minyan host→commit→quorum→readiness→cancel flow continues to pass with no
  behavior change (no regression).
- **SC-006**: A meal never exceeds its seat capacity; the (capacity+1)th confirmed guest is impossible,
  and a freed seat promotes exactly one waitlisted guest.

## Assumptions

- **Who can host**: any signed-in, active (non-suspended/banned) user may host any event type. No age
  gating in v1 (unlike OneTable's 21+ rule) — can be revisited.
- **Invite mode / private events**: v1 supports **public** and **unlisted (link-only)**; a full
  invite-list ("invite" mode) is scaffolded in the model but its management UI may land later.
- **Occasion set**: the fixed occasions are Shabbat + the major festivals (Rosh Hashanah, Yom Kippur,
  Sukkot, Pesach, Shavuot) + Chanukah + Purim + "none"; minor fasts/days are out of v1.
- **Party-size semantics**: the shared attendance count is a generic "party size"; minyan continues to
  interpret it as men for quorum. No change to minyan quorum math.
- **Reused foundations**: tiered address/contact visibility, moderation/flagging,
  active-user-enforcement, images, in-app messaging (008), Stay-anchored discovery, and the
  notification system are all reused rather than rebuilt.
- **Out of scope (future)**: a `class`/shiur type; paid ticketing/payments; recurring events;
  post-event attendance marking (attended/no-show); guest-to-host matching/recommendations
  (Shabbat.com-style) beyond simple discovery.
- **Deferred detail**: exact waitlist ordering rule is "earliest request first"; custom per-event RSVP
  questionnaires (Partiful/OneTable style) are a possible later addition, not required for v1.
