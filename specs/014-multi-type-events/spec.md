# Feature Specification: Multi-type events (hosting, gatherings, occasions)

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
create a **hosting** event (opening their table for a seudah): a title, the meal served (Shabbat dinner
/ lunch / seudah shlishit / holiday / weekday), date and start time, an RSVP cutoff, how many **seats**
are available, the kashrut level and which dietary needs they can accommodate, what they're offering and
what guests might bring, and their neighborhood (city shown publicly, exact address hidden). Because
seats are limited, the hosting event uses **request-and-approve**: a traveler requests a seat, the host sees who they are (name, profile, phone
if shared) and approves or declines. On approval the guest sees the exact address and host contact.

**Why this priority**: This is the differentiated, mission-critical flow — it's what makes JStay more
than a minyan finder, and it directly serves the core promise ("a traveler on a Stay finds Jewish life
nearby"). It is the strongest fit with best-in-class Jewish hosting apps (OneTable / Shabbat.com).

**Independent Test**: A host can create a hosting event, a different traveler can find it near their Stay,
request a seat, and the host can approve — after which (and only then) the traveler sees the exact
address. Fully demonstrable on its own.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they create a hosting event with N seats and request-approval
   enabled, **Then** the event is discoverable publicly showing city/neighborhood, meal type, occasion,
   seats remaining, dietary info, and the host's public profile — but NOT the exact address.
2. **Given** a discoverable hosting event with seats remaining, **When** a traveler requests a seat, **Then**
   the request is pending and the host is notified with the requester's name + profile (+ phone if the
   requester shares it).
3. **Given** a pending seat request, **When** the host approves it, **Then** the guest becomes a
   confirmed attendee, the seats-remaining count drops, and the guest can now see the exact address,
   entry notes, and host contact.
4. **Given** a pending seat request, **When** the host declines it, **Then** the requester is notified,
   remains without a seat, and never sees the exact address.
5. **Given** a hosting event (approval mode) at full seat capacity, **When** another traveler requests a seat,
   **Then** their request is `pending` (never auto-confirmed) and the host cannot approve it while it
   would not fit; **When** a confirmed guest later cancels and a seat frees, **Then** the host is
   notified a seat opened and MAY approve a pending request — host approval is never bypassed.

---

### User Story 2 — Discover & request hosting events/gatherings near my Stay (Priority: P1)

A traveler with an active Stay wants to see everything happening nearby, not just minyanim. On
discovery (and from their Stay) they see minyanim, hosting events, and social gatherings in the area,
filterable by **kind** (minyan / hosting / social) and by **holiday occasion** (e.g., "Shabbat",
"Pesach"). They can open any event and join/request in the way that event allows.

**Why this priority**: Without discovery, hosting events/gatherings are invisible — this is what makes
hosting worthwhile and completes the loop with the existing Stay-anchored discovery.

**Independent Test**: With a mix of a minyan, a hosting event, and a social gathering near a location,
a traveler can list them, filter to just "hosting" or just "Pesach", and open each.

**Acceptance Scenarios**:

1. **Given** minyanim, hosting events, and social gatherings exist near a location, **When** a traveler
   opens discovery there, **Then** all three appear, each labeled with its kind and occasion.
2. **Given** the discovery list, **When** the traveler filters by kind = "hosting" and occasion = "Shabbat",
   **Then** only Shabbat hosting events are shown.
3. **Given** a traveler viewing a nearby hosting event, **When** they choose to attend, **Then** they are
   taken through that event's join flow (request-approval for a hosting event, simple RSVP for a social
   gathering).

---

### User Story 3 — Host a general gathering (party / kiddush / meetup) (Priority: P2)

A user wants to invite people to a simple get-together (a kiddush, a Purim party, a young-professionals
meetup). They create a **social gathering** with a title, description, date/time, optional capacity,
and a subcategory — with a simple RSVP (I'm coming), no approval required by default.

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

- A hosting-event host approves more seat requests than seats remaining → the system MUST prevent over-booking
  (approval fails once the requester's party would not fit; excess requests stay pending in
  approval mode / waitlisted in open mode).
- A **party larger than the remaining seats** requests/joins → in approval mode the host cannot approve
  it until it fits; the guest may reduce their party size (or the host messages them). In open mode the
  whole party is waitlisted and only promoted when enough seats free at once.
- A confirmed guest cancels → **open mode**: the earliest waitlisted guest that still fits is
  auto-promoted (and notified); **approval mode**: the host is notified a seat opened and may approve a
  pending request (no auto-confirm). Seats-remaining updates in both.
- A request is still **pending** when the event's cutoff passes or its date arrives → it reads as
  "closed"; no new requests are accepted; the host may still resolve pending requests until the date.
- A **variable-size waitlist**: promotion picks the earliest-requested waitlisted guest that fits, which
  MAY skip an earlier but too-large party — this is the accepted fairness rule that guarantees no
  over-book.
- An event's occasion/holiday doesn't apply (a plain weekday meetup) → occasion is optional ("none").
- A host cancels an event with confirmed guests → all confirmed attendees are notified (as minyans do).
- A hosting event is moderation-hidden or the host is suspended → it is not discoverable and cannot take
  new requests, consistent with existing moderation rules.
- A guest requests a seat at a hosting event but never shared a phone → the host still sees name + profile; phone stays
  hidden per the user's share-phone preference.
- Exact address must never leak to a non-confirmed viewer for any event type (same invariant as minyan).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST model an event as a **behavior class** (`type`: **minyan** — quorum
  readiness; **gathering** — capacity + RSVP) plus, for gatherings, a user-facing **category**
  (**hosting** and **social** in v1; learning/celebration are model-ready fast-follows; `NULL` for a
  minyan). Users choose a **kind** — minyan / hosting / social — and never see the internal type axis.
  All existing minyan behavior MUST be preserved.
- **FR-002**: Every event MUST have a title, a location (city/country/coordinates), a date, an optional
  start/end time, an optional **occasion** tag (from a fixed set of Jewish occasions plus "none"), an
  optional description, optional photos, a host, a visibility setting, and an RSVP configuration.
- **FR-003**: The system MUST provide a generalized attendance/RSVP model with a per-attendee **status**
  (pending, confirmed, waitlisted, declined, cancelled) and a **party size**, usable by every event
  type; a minyan interprets party size as number of men.
- **FR-004**: Each event MUST have an **RSVP mode**: **open** (join is auto-confirmed), **approval**
  (the host confirms each request), or **invite** (only invited users may join). Hosting-category
  gatherings default to approval; minyanim and social gatherings default to open (the default is
  per-category).
- **FR-005**: Each event MUST have a **visibility** setting: **public** (discoverable), **unlisted**
  (reachable only by direct link), or **invite** (only invited users). Visibility and RSVP mode are
  independent (a public event may still require approval).
- **FR-006**: An event MAY have a **capacity** — the number of **guest seats** (the host is the
  organizer and is NOT counted against capacity; unlimited when unset). Capacity is measured as the
  **sum of confirmed attendees' party sizes**. Behavior when full depends on the RSVP mode:
  - **Open mode**: a join that no longer fits MUST be **waitlisted**; when a confirmed attendee cancels,
    the earliest-requested waitlisted attendee **that still fits** MUST be auto-promoted to confirmed and
    notified (a party too large for the freed space is skipped, preserving the no-overbook guarantee).
  - **Approval mode**: requests remain **pending** (the ordered request queue — earliest first); nothing
    is ever auto-confirmed. When a confirmed guest cancels and a seat frees, the host is notified that a
    seat opened and MAY approve a pending request. Host approval is never bypassed.
- **FR-007**: For approval-mode events, the host MUST see each requester's name and public profile (and
  phone only if that user shares it) and MUST be able to approve or decline; approving MUST fail (with a
  clear reason) if the requester's party size would not fit the remaining capacity. When a party does
  not fit, the guest MUST be able to reduce their party size, and the host MAY message the guest to
  coordinate.
- **FR-008**: The exact address, entry notes, and host contact MUST be revealed ONLY to confirmed
  attendees (and the host), for every event type — reusing the existing tiered visibility rules.
  Non-confirmed viewers see city/neighborhood only. For **hosting-category** events the confirmed
  guest list (names/phones) is additionally visible to confirmed attendees + host only — a signed-in
  non-confirmed viewer sees an aggregate confirmed count instead of named attendees (a deliberate,
  hosting-only revision of the roster-openness rule; minyan and social keep today's roster behavior).
- **FR-009**: A **hosting** gathering MUST additionally capture: number of **guest** seats (the host is
  not counted), meal type (Shabbat dinner / lunch / seudah shlishit / holiday meal / weekday), kashrut
  level, dietary accommodations, "what I'm offering", "what to bring", and optional alcohol/accessibility
  notes. For the hosting category the **start time is REQUIRED** (a guest needs an arrival time), with a
  zmanim-assisted default when the occasion is Shabbat/a festival (candle-lighting + 30 min suggestion,
  editable); the generic FR-002 start time stays optional for other kinds.
- **FR-010**: A **social** gathering MUST additionally capture a subcategory (e.g., party, kiddush,
  farbrengen, meetup).
- **FR-011**: Discovery MUST surface hosting events and social gatherings near a location alongside
  minyanim, with the ability to filter by **kind** (minyan / hosting / social) and by **occasion**.
- **FR-012**: Hosts MUST be able to create, edit, and cancel gatherings (hosting and social); cancelling
  MUST notify confirmed attendees.
- **FR-013**: Gatherings (hosting and social) MUST be subject to the same moderation/flagging and
  active-user-enforcement rules as minyanim and stays.
- **FR-014**: Notifications MUST cover the new flows: a seat request received (to the host), a request
  approved/declined (to the requester), and waitlist promotion (to the promoted guest). The
  seat-requested / request-approved / request-declined notifications MUST be delivered in-app AND by
  **email** (localized he/en, deep-linking to the event) — the request/approve loop is asynchronous and
  cannot rely on the other party being in the app.
- **FR-015**: Approve/decline of a seat request MAY reuse the existing direct-messaging capability so
  host and guest can coordinate.
- **FR-016**: An event MAY have an **RSVP cutoff** (a date/time after which new requests/joins close)
  and every event closes to new requests once its event date has passed. After close, the system MUST
  reject new requests/joins with a clear "requests closed" reason and MUST show requesters a terminal
  state (a still-pending request on a closed/passed event reads as "closed", not indefinitely pending).
  A host MAY still approve or decline already-pending requests until the event date; a pending request
  is shown as terminal only after the event date. (v1 derives "closed" at read time — no background
  auto-decline job.)
- **FR-017**: The system MUST provide a "My events" surface listing events the user hosts or attends
  (with status), showing a pending-requests count badge on hosted approval-mode events — this is the
  host's reliable path back to the requests queue.

### Key Entities *(include if feature involves data)*

- **Event (generalized)**: any hosted happening. Shared attributes: type (behavior class:
  minyan/gathering), category (user-facing kind for gatherings: hosting/social — NULL for a minyan),
  title, host, location, date, optional start/end time, optional RSVP cutoff, occasion tag, description,
  photos, visibility, RSVP mode, capacity (guest seats — host not counted), status (forming/cancelled
  stored; "ready/full/closed" derived per behavior).
- **Gathering detail** (one detail entity for all gathering categories): the category plus validated
  per-category attributes — hosting: meal type, kashrut, dietary accommodations, offering, bring-items,
  alcohol/accessibility (guest seats live on the event's capacity); social: subcategory.
- **Minyan detail** (existing): nusach, Sefer Torah, prayer services/times, role slots.
- **Attendance / RSVP**: a person's relationship to an event — party size, status
  (pending/confirmed/waitlisted/declined/cancelled), request time (orders the pending/waitlist queue),
  any roles, and the originating Stay (if any). One row per user per event. A minyan's host self-attends
  (counts toward quorum); a gathering host is the organizer and is not an attendance row.
- **Occasion**: a Jewish holiday/observance tag (Shabbat, Rosh Hashanah, Yom Kippur, Sukkot, Pesach,
  Shavuot, Chanukah, Purim) or "none", used as a cross-cutting discovery filter — not an event type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A host can create a hosting event that opens seats to travelers in under 3 minutes.
- **SC-002**: A traveler can find a nearby hosting event and request a seat in one session; once the host
  approves (a separate, asynchronous host action), the traveler sees the exact address on their next
  visit — and the address is never visible before approval. (Two-actor: the traveler's request and the
  host's approval are distinct steps.)
- **SC-003**: 100% of non-confirmed viewers are prevented from seeing an event's exact address, for
  every event type (zero address leaks).
- **SC-004**: Discovery near a location returns minyanim, hosting events, and social gatherings
  together, and filtering by kind or occasion narrows results correctly in every case.
- **SC-005**: The existing minyan host→commit→quorum→readiness→cancel flow continues to pass with no
  behavior change (no regression).
- **SC-006**: The sum of confirmed guests' party sizes never exceeds the event's seat capacity; a confirm
  that would exceed capacity is impossible (by an atomic capacity-guarded write), and a freed seat
  promotes the earliest-requested waitlisted guest that still fits (open mode) or enables the host to
  approve a pending request (approval mode) — never an over-book.

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
- **Out of scope (future)**: the `learning` (class/shiur) + `celebration` gathering categories
  (model-ready fast-follows — a new category value + attrs variant, no schema change); paid
  ticketing/payments; recurring events;
  post-event attendance marking (attended/no-show); guest-to-host matching/recommendations
  (Shabbat.com-style) beyond simple discovery.
- **Deferred detail**: waitlist ordering is "earliest request first that still fits"; a
  background/scheduled auto-decline at the RSVP cutoff is deferred (v1 derives "closed" at read time,
  since the stack has no cron/queue); custom per-event RSVP questionnaires (Partiful/OneTable style) are
  a possible later addition, not required for v1.
