# Feature Specification: Discovery & Quorum Formation

**Feature Branch**: `003-discovery-quorum`

**Created**: 2026-06-18

**Status**: Clarified (2026-06-20)

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays**.

---

## Summary

The multiplayer layer that turns individual Stays into real minyanim. A user opens a map +
search view, sees the *potential* (how many men have Stays in an area for a given date),
**hosts a Minyan** at a precise point, and others **commit** to it. A Minyan carries a
**nusach** and exposes claimable **role slots** (Ba'al Tefila, Ba'al Korei). A Minyan reaches
**quorum** when ≥10 men have committed; a Shabbat-morning Torah-reading minyan is **ready** only
when it has reached quorum AND has a Sefer Torah AND a claimed Ba'al Korei. Beit Chabad pins
appear as a static informational layer. Email + in-app notifications fire on quorum events.

**Key modeling fact**: a **Minyan is one service** — exactly one location, one date, one
tefilla, one time, one nusach. One place therefore hosts **multiple Minyanim** when it runs
several services (e.g. a hotel with a 07:00 and an 08:30 Shacharit, or a separate Friday-night
Maariv and a Shabbat-morning Shacharit). "Same place" is determined by coordinate proximity for
grouping in the UI. A Minyan belongs to exactly one location; a location may have many Minyanim.

---

## Clarifications

### Session 2026-06-20

Derived from a two-role spec review (expert PM + expert Architect) reconciled against the
ROADMAP, the constitution, and the implemented 002 codebase. Decisions are referenced (D#) from
the requirements below and will be cited by the planning artifacts.

- **D1 — What is an "area" and how is *potential* computed?** Potential = the sum of `num_men`
  over **active Stays whose coordinates fall inside a bounding box** derived from the search
  centre + a radius (default radius a planning constant, ≈15 km), with the date-overlap filter
  applied only to that bounded subset. A new composite index on the Stay coordinates backs the
  bounding-box scan (this is the geospatial seam D15 deferred in 002 — D1 has no native spatial
  index, so a bounding box + index is the strategy). When a Stay has no coordinates
  (manual entry), it falls back to city/country string match. All aggregation is **server-side**.
- **D2 — Per-Shabbat bucketing & timezone.** A Shabbat bucket is a Friday–Saturday window in the
  **destination-local timezone**, reusing 002's `coversShabbat` / `tzFromCoords` heuristic
  (`apps/backend/src/lib/timezone.ts`). A Stay counts toward **every** Shabbat its
  `[arrival, departure]` range overlaps; potential is grouped by those buckets. No zmanim
  dependency (precise windows are Feature 005).
- **D3 — Minyan granularity & commitment model.** A Minyan = one date + one tefilla + one time +
  one nusach (multi-service places = multiple Minyan rows). A **Commitment** is
  `(userId, minyanId, numMen, stayId?)` — it carries its own party size and does **not** require
  a backing Stay, so a WhatsApp recruit with no Stay can join. The optional `stayId` links a
  commitment to a Stay only for the reconciliation flow (D12). One commitment per (minyan, user),
  enforced by a unique constraint.
- **D4 — Three-tier privacy DTOs.** Mirroring 002's Owner/Public pattern (`OwnerStayDTO` /
  `PublicStayDTO` in `packages/shared/src/schemas/stay.ts`, D8): `PublicMinyanDTO` (city/venue,
  date, tefilla, time, nusach, counts, status — specific address and host/participant contact
  **structurally absent**); `ParticipantMinyanDTO` (adds the specific address, host contact, and
  co-participant names + phone/email); `OwnerMinyanDTO` (the host's full view). The address +
  contact are revealed **on commit** and **revoked on withdrawal**. The WhatsApp share and the
  pre-auth join-link landing build from `PublicMinyanDTO` only.
- **D5 — Freshness mechanism.** Counts/statuses stay fresh by **polling** — the discovery and
  Minyan-detail TanStack Query hooks use a `refetchInterval` (~5 s) plus refetch-on-focus and
  refetch-after-mutation. No realtime infrastructure is introduced (no Queues / Durable Objects /
  WebSockets). SC-002 is worded against this mechanism.
- **D6 — Notification pipeline.** A new `notification` table backs an in-app inbox (per recipient,
  read/unread). Email is sent through the **existing Resend integration** (`apps/backend/src/lib/email.ts`).
  Delivery fans out via `ctx.waitUntil(...)` **after** the authoritative write (no Queues in v1).
  Each threshold event is idempotent on `(minyanId, eventType, thresholdValue)` so a count
  oscillating around 10 cannot re-fire. Emails honour the recipient's language preference
  (Hebrew-first). Events: quorum-reached, near-quorum (default **8/10**, a planning constant),
  quorum-lost, host-cancelled.
- **D7 — Status is derived server-side.** A Minyan stores only `forming` / `cancelled`. The
  `quorum-reached`, `ready`, and `completed` states are **derived** at read time (mirroring 002's
  `isPast` / `coversShabbat`), never persisted. `completed` is derived once the Minyan's date has
  passed in the destination-local timezone.
- **D8 — Readiness truth table.** `quorum` ⇔ committed men ≥ 10. `ready` ⇔ quorum AND (when the
  Minyan is a *Shabbat-morning Torah-reading* service) Sefer Torah present AND a Ba'al Korei
  claimed. "Shabbat-morning Torah-reading" ⇔ tefilla = Shacharit AND the Minyan date is Shabbat
  (Saturday) in the destination timezone. v1 applies the extra Torah/Korei requirement to Shabbat
  Shacharit only; Monday/Thursday and Shabbat-Mincha readings are deferred.
- **D9 — Concurrency safety (no interactive transactions).** One commitment per (minyan, user)
  via a unique constraint. A role slot is claimed by an atomic conditional write
  (`UPDATE … WHERE slot IS NULL RETURNING`, the same compare-and-set primitive as
  `stayRepository.cancelStay`). Threshold-crossing notifications are computed from the
  authoritative post-write read and guarded by the D6 idempotency key.
- **D10 — Bidirectional recompute & lifecycle.** Status recomputes in both directions: a
  withdrawal, a Stay-driven auto-withdrawal (D12), a released role, or a removed Sefer Torah that
  drops a Minyan below readiness reverts it to `forming` and fires a deduped quorum-lost
  notification. Completed and cancelled Minyanim are excluded from active discovery results.
- **D11 — Host self-commit & cancellation.** Hosting auto-creates a commitment for the host's own
  party size (the host is attending). The host may cancel at any status; cancellation voids all
  commitments and role claims, deactivates the join link, and notifies committed participants.
- **D12 — Stay-edit reconciliation.** When a commitment's optional linked Stay is cancelled, or
  edited so it no longer covers the Minyan's date, the commitment is **auto-withdrawn** and the
  user notified; counts and status recompute. Independent commitments (no `stayId`) are
  unaffected.
- **D13 — Auth-agnostic join link.** The join link routes through sign-in via **Google SSO _or_
  email/password** (no flow assumes a Google identity — ROADMAP decision 8), preserving a
  post-auth redirect to `/minyan/:id` (reusing `apps/backend/src/lib/redirect.ts`). The pre-auth
  landing shows the public projection only.
- **D14 — Commitment conflict.** Committing to ≥2 Minyanim with the same tefilla on the same date
  in overlapping time is a **soft warning**; the user may proceed.
- **D15 — Party size bounds.** A commitment's `numMen` is ≥1 and ≤ a sane maximum (planning
  constant, ≈50), enforced by a shared-Zod rule (mirroring 002's man-count rule). Quorum is met at
  ≥10; overshoot is allowed and displayed.
- **D16 — Nusach "any".** A Minyan whose nusach is "any" matches every nusach filter; filtering by
  a specific nusach also includes "any"-nusach Minyanim.
- **D17 — Filter targets.** "Has Sefer Torah" filters hosted Minyanim by their Torah availability.
  Date-range and nusach filters apply to both potential and Minyanim. Stays that bring a Sefer
  Torah may be surfaced within potential to help a host recruit.
- **D18 — Beit Chabad source.** Pins render from a `beit_chabad_pin` table decoupled from the data
  source; if Chabad.org licensing is not cleared by build time, the table is seeded manually
  (ROADMAP open item). Informational only — not joinable in v1.
- **D19 — Moderation seam.** Discovery excludes content marked hidden by moderation via a shared
  predicate/column that defaults to *visible*; the 3-flag threshold and moderation behaviour are
  owned by Feature 006. 003 ships only the flag affordance and the read-time exclusion contract.
- **D20 — Map/geocoding.** Discovery reuses 002's MapTiler decision and MUST display the required
  ODbL attribution; tiles load client-side, any geocoding runs server-side.
- **D21 — Generic event model (used throughout).** The core gathering is a generic **`event`**
  with a **`type`** discriminator (`'minyan'` is the first and only type in v1), applied
  **throughout the application** — the D1 schema, the `packages/shared` Zod contracts, the
  service layer, and the API surface (`/api/events`, filterable by `type`). The `event` row
  carries the fields common to any gathering — host (User), location (city/country + coordinates +
  private specific address), date, time, stored status (forming/cancelled), `type`, timestamps —
  with the minyan-specific fields (tefilla, nusach, Sefer Torah availability, Ba'al Tefila / Ba'al
  Korei role-slot holders) and the minyan-specific logic (quorum, readiness, roles) living in a
  minyan-typed layer. `commitment` and `notification` reference the generic `event` (e.g.
  `commitment.event_id`). A future event type is then a new `type` value + its own typed
  attributes, with no rewrite of commitments, notifications, discovery, or the API. The exact
  physical layout of the minyan-specific attributes — a 1:1 `minyan` detail table (preferred, for
  queryable/indexable filter fields like nusach and Sefer Torah) vs. a Zod-typed JSON column on
  `event` (the 002 `prayer_needs` pattern) — is finalized in `plan.md`; queryability of the
  discovery filters (FR-008) and the readiness classification (FR-005) is the deciding constraint.
  **User-facing Hebrew copy remains "מניין"** — `type` is a model concept, not display text.
- **D22 — Reciprocal Stay → nearby Minyanim (pull, in 003).** Discovery requires **no Stay of the
  user's own** (the searcher just searches; potential aggregates *other* users' Stays). In
  addition, the My-Stays surface (002 dashboard/Stay detail) MUST offer a **pull** entry point —
  "N Minyanim near this stay" — that deep-links into discovery pre-filtered to that Stay's
  location + date range, reusing the discovery query. The **proactive push** nudge (notify a user
  when a new Minyan appears near an existing Stay) is **deferred** to a fast-follow/v2 and noted
  in Assumptions.

---

## User Scenarios & Testing

### User Story 1 — Discover Potential & Existing Minyanim (Priority: P1)

A user searches a city + date range and sees, on a map and list: how many men have Stays
there, and any Minyanim already hosted at specific points. **Discovery requires no Stay of the
user's own** — the searcher just searches; potential aggregates *other* users' Stays (D22).

**Independent Test**: A user with no Stays of their own searches "Zakopane, Aug 2026" and sees
the total men with Stays in the area for each Shabbat, plus any already-hosted Minyanim at
specific addresses.

**Acceptance Scenarios**:

1. **Given** a city + date query, **When** results load, **Then** the user sees per-Shabbat
   *potential* (sum of `num_men` over active Stays inside the search area whose range overlaps
   that Shabbat — D1/D2) and a list/map of any hosted Minyanim with their per-Minyan committed
   counts.
2. **Given** a location with several hosted Minyanim, **When** the user views that place,
   **Then** all its Minyanim are listed separately with their tefilla, time, nusach, and status.
3. **Given** the map view, **When** it loads, **Then** Beit Chabad (בית חב״ד) pins appear
   as a distinct static layer alongside user Minyanim, and the required map attribution is shown.
4. **Given** filters for date range, "has Sefer Torah", and nusach, **When** applied,
   **Then** results narrow accordingly (D16/D17).
5. **Given** a Minyan that is cancelled or whose date has passed, **When** discovery loads,
   **Then** it does not appear in the active results (D7/D10).
6. **Given** content hidden by moderation, **When** discovery loads, **Then** it is absent from
   the results (D19).

---

### User Story 2 — Host a Minyan (Priority: P1)

A user designates a specific point (their address or a chosen venue), a date, a tefilla, and a
time as a hosted Minyan that others can join.

**Why this priority**: The host-point is what converts scattered potential into a real,
committable quorum (the Excel's "מניין אצלנו").

**Independent Test**: A user hosts a Shabbat-morning Minyan at an address; it immediately
appears in discovery for that location and date, joinable by others, and the host appears as the
first committed participant.

**Acceptance Scenarios**:

1. **Given** a user in an area with potential, **When** they host a Minyan with location, date,
   tefilla, time, nusach, and Sefer Torah availability, **Then** it is created, the host is
   auto-committed with their party size (D11), and it is shown in discovery.
2. **Given** an existing place, **When** the user hosts another Minyan there with a different
   tefilla/time/nusach, **Then** both Minyanim coexist at that place (D3).
3. **Given** a Shabbat-morning Minyan with a Sefer Torah, **When** it has ≥10 committed men
   AND a participant has claimed the Ba'al Korei role, **Then** its derived status reaches
   "ready" (D8).
4. **Given** the host sets a nusach, **When** the Minyan is shown, **Then** its nusach is
   displayed and is filterable in discovery.
5. **Given** the host cancels the Minyan, **When** cancelled, **Then** all commitments and role
   claims are voided, the join link is deactivated, committed participants are notified, and the
   Minyan leaves active discovery (D11).

---

### User Story 3 — Commit to / Leave a Minyan (Priority: P1)

A user joins a hosted Minyan with their party size, or withdraws. A commitment does not require
the user to have a Stay (D3).

**Independent Test**: A user commits 3 men to a Minyan; the committed count rises by 3
within the polling window. They withdraw; it drops back.

**Acceptance Scenarios**:

1. **Given** a hosted Minyan, **When** a user commits with a party size (1 ≤ size ≤ max, D15),
   **Then** the committed count increments, the user appears in the participant list, and the
   specific address + host contact become visible to them (D4).
2. **Given** a committed user, **When** they withdraw, **Then** the count decrements, they are
   removed from the list, any role they held is released (D9), and the address/contact are hidden
   again (D4).
3. **Given** a user already committed, **When** they view the Minyan, **Then** they see their
   commitment and can change their party size.
4. **Given** a Minyan reaches ≥10 committed men, **When** the threshold is crossed, **Then** its
   derived status shows "quorum reached"; if it is a Shabbat-morning Torah-reading minyan,
   "ready" additionally requires a Sefer Torah and a claimed Ba'al Korei (D8).
5. **Given** a Minyan below readiness, **When** viewed, **Then** it shows "N/10 — X more needed"
   and which readiness elements are still missing (Sefer Torah, Ba'al Korei).
6. **Given** a "quorum reached"/"ready" Minyan, **When** a withdrawal (or D12 auto-withdrawal)
   drops it below 10 — or a required Torah/Ba'al Korei is lost — **Then** the status recomputes to
   "forming" and a deduped "quorum lost" notification fires (D10).
7. **Given** a user already committed to a Minyan with the same tefilla on the same date in an
   overlapping time, **When** they try to commit to another, **Then** they receive a soft conflict
   warning and may proceed (D14).
8. **Given** a user tries to commit twice to the same Minyan, **When** submitted, **Then** the
   second attempt is rejected (`commitment.duplicate`, D9); committing to a cancelled or completed
   Minyan is rejected (`minyan.cancelled` / `minyan.completed`).

---

### User Story 4 — Claim a Prayer Role (Priority: P2)

A committed participant claims a role on a Minyan — Ba'al Tefila (leader) or Ba'al Korei
(Torah reader) — so the host can see whether the minyan can actually function.

**Why this priority**: A Sefer Torah with no one to read it does not make a Shabbat-morning
minyan work; surfacing role gaps lets the group recruit the right person, not just bodies.

**Independent Test**: A participant claims Ba'al Korei on a Minyan; the Minyan shows the
role as filled and, once 10 men + a Torah are present, its status becomes "ready".

**Acceptance Scenarios**:

1. **Given** a Minyan with an open Ba'al Korei slot, **When** a committed participant claims
   it, **Then** the role shows as filled by that participant.
2. **Given** two participants attempt to claim the same open slot concurrently, **When** both
   submit, **Then** exactly one succeeds and the other sees it already filled
   (`role.already_claimed`, D9).
3. **Given** a participant who claimed a role, **When** they release it or withdraw their
   commitment (or are auto-withdrawn per D12), **Then** the slot reopens and any "ready" status
   recomputes (D10).
4. **Given** a Minyan needing roles, **When** viewed, **Then** open role slots (Ba'al
   Tefila, Ba'al Korei) are clearly indicated. A participant may hold both roles.

---

### User Story 5 — Quorum Notifications (Priority: P2)

Participants and the host receive email + in-app notifications on quorum events, in the
recipient's preferred language.

**Independent Test**: A host and committed participants receive an email + in-app message
when their Minyan reaches 10 men, exactly once for that crossing.

**Acceptance Scenarios**:

1. **Given** a Minyan reaches quorum, **When** the threshold is crossed, **Then** the host and
   all committed participants receive an email and an in-app notification, **and** a count that
   oscillates around 10 does not re-fire the event (D6 idempotency).
2. **Given** a Minyan is close (default 8/10), **When** that threshold is crossed, **Then** the
   host receives a "X more needed" notification.
3. **Given** a Minyan is cancelled by its host, **When** cancelled, **Then** committed
   participants receive a cancellation notification and see it marked cancelled.
4. **Given** a Minyan loses quorum (drops below 10 / loses a required Torah or Ba'al Korei),
   **When** that happens, **Then** the host receives a deduped "quorum lost" notification (D10).

---

### User Story 6 — Share a Minyan via WhatsApp (Priority: P2)

A host or participant shares a Minyan to recruit more men, via a WhatsApp link pre-filled with
the Minyan's **public** details and a join link.

**Why this priority**: Recruitment happens in existing WhatsApp groups; a one-tap share
is the fastest path from "8/10" to quorum and matches how communities coordinate today.

**Independent Test**: A user opens a Minyan, taps "Share to WhatsApp", and WhatsApp opens
with a message containing the public location, date, tefilla/time, current count, and a join
link — and never the specific address.

**Acceptance Scenarios**:

1. **Given** a hosted Minyan, **When** a user taps "Share to WhatsApp", **Then** WhatsApp
   opens with a pre-filled message built from `PublicMinyanDTO` — public location, date,
   tefilla and time, current committed count, and a direct join link — and it MUST NOT contain
   the specific address (D4).
2. **Given** a recipient opens the shared join link **and is signed in**, **When** it loads,
   **Then** they land on that Minyan's detail page ready to commit. **If not signed in**, they are
   routed through sign-in (Google **or** email/password) and then returned to the Minyan (D13).
3. **Given** an unauthenticated visitor at the join link, **When** the page loads, **Then** they
   see only the public projection (no specific address) plus a sign-in CTA.

---

### User Story 7 — Find Minyanim near my Stay (Priority: P2)

From a Stay they already registered, a user discovers Minyanim happening nearby for that Stay's
location and dates — the reciprocal of search-driven discovery, and the payoff for registering a
Stay.

**Why this priority**: It closes the loop between 002 (presence) and 003 (gatherings): a user who
said "I'll be here" is shown what's forming around them without re-entering a search.

**Independent Test**: A user with a Stay in Zakopane opens My Stays and sees "3 Minyanim near
this stay"; tapping it opens discovery pre-filtered to that Stay's location + date range.

**Acceptance Scenarios**:

1. **Given** a user with an active Stay, **When** they view My Stays / the Stay detail, **Then**
   they see a count of Minyanim near that Stay (matching its location + date range) and a link
   into pre-filtered discovery (D22, pull).
2. **Given** the Stay's area has no hosted Minyanim, **When** viewed, **Then** the entry point
   shows the potential ("N men nearby") and a prompt to host, rather than a dead end.
3. **Given** the user taps the entry point, **When** discovery opens, **Then** it is pre-filtered
   to the Stay's location and date range.

> Deferred to a fast-follow/v2 (D22): a **proactive push** notification when a *new* Minyan
> appears near an existing Stay. v1 ships the pull entry point only.

---

### Edge Cases

- Overlapping Stays in the same area are summed into *potential*, but committed counts are
  per-Minyan — a man counted in potential is not "in" a minyan until he commits.
- A committed participant's optional linked Stay is edited/cancelled (feature 002) → if it no
  longer covers the Minyan's date, the commitment is auto-withdrawn and the user notified; counts
  recompute (D12). A commitment with no linked Stay is unaffected.
- A place has multiple Minyanim and a user tries to commit to two overlapping ones (same
  tefilla/time/date) → soft conflict warning; user may proceed (D14).
- Specific address + host/participant contact are revealed only to committed participants, on
  commit, and revoked on withdrawal (D4).
- A withdrawal/role-release/Torah-removal that drops a Minyan below readiness reverts its status
  and fires a deduped quorum-lost notification (D10).
- A Minyan's date passes → it derives "completed" (destination-local) and drops from active
  discovery (D7/D10).
- Host cancels a Minyan at any status → commitments + roles voided, join link deactivated,
  participants notified (D11).
- Concurrent commits crossing 10, and concurrent claims on one role slot, resolve
  deterministically (unique constraint + compare-and-set; D9).
- Beit Chabad pin selected → shows informational details only (not joinable in v1).
- Each Stay/Minyan shown in discovery offers a "flag" affordance; content auto-hidden by
  moderation MUST NOT appear in discovery results (threshold + behaviour owned by Feature 006, D19).

---

## Requirements

### Functional Requirements

- **FR-001**: The system MUST let a user search by city/place and date range and display
  per-Shabbat *potential* — the sum of `num_men` over active Stays inside the search area whose
  date range overlaps each Shabbat bucket, computed server-side (D1/D2).
- **FR-002**: The system MUST let a user host a Minyan as a single service — one precise location,
  one date, one tefilla, one time, one nusach (Ashkenaz / Sefard / Chabad / Mizrachi / any), and
  Sefer Torah availability (D3).
- **FR-003**: The system MUST support multiple Minyanim at the same location, distinguished by
  tefilla, time, host, or nusach; "same place" is a coordinate-proximity grouping (D3).
- **FR-004**: Users MUST be able to commit a party size to a Minyan (1 ≤ size ≤ max, D15), change
  it, and withdraw. A commitment does not require a backing Stay; it may optionally link one
  (D3). A user MUST NOT hold two commitments on the same Minyan (D9).
- **FR-005**: A Minyan's status MUST be **derived server-side** (never stored beyond
  forming/cancelled, D7) and recompute bidirectionally (D10): "quorum reached" requires ≥10
  committed men; for a Shabbat-morning Torah-reading minyan (tefilla = Shacharit on a Shabbat
  date in destination tz, D8) "ready" additionally requires a Sefer Torah AND a claimed Ba'al
  Korei.
- **FR-006**: Below readiness, a Minyan MUST display the current count, how many more men are
  needed, and which readiness elements are missing (Sefer Torah, Ba'al Korei).
- **FR-007**: Discovery MUST present both a map and an at-parity list. The map MUST display user
  Minyanim and a distinct static Beit Chabad layer (D18) with the required attribution (D20).
- **FR-008**: Discovery MUST support filtering by date range, Sefer Torah presence, and nusach,
  with "any"-nusach matching every nusach filter (D16/D17).
- **FR-009**: A Minyan MUST expose claimable role slots (Ba'al Tefila, Ba'al Korei); a committed
  participant MUST be able to claim and release a role; claiming MUST be atomic (first-claim wins,
  D9); releasing, withdrawing, or auto-withdrawal MUST reopen the slot and recompute readiness
  (D10). One participant MAY hold both roles.
- **FR-010**: The system MUST send email + in-app notifications, in the recipient's language, on
  quorum-reached, near-quorum (default 8/10), quorum-lost, and host-cancellation events to the
  relevant host/participants. Each threshold event MUST fire at most once per crossing (idempotent
  on (minyanId, eventType, threshold), D6). Delivery MUST be asynchronous (D6); web push is v2.
- **FR-011**: The specific address of a Minyan, the host's contact, and co-participants' contact
  details MUST be visible only to committed participants, revealed on commit and revoked on
  withdrawal. Serialization MUST use distinct shape contracts — `PublicMinyanDTO` (private fields
  structurally absent), `ParticipantMinyanDTO`, and `OwnerMinyanDTO` — mirroring 002's owner/public
  pattern (D4).
- **FR-012**: Each Minyan MUST provide a "Share to WhatsApp" action that opens WhatsApp with a
  message built from `PublicMinyanDTO` (public location, date, tefilla and time, current committed
  count, and a direct join link) and MUST NOT include the private specific address. Opening the
  join link MUST route the recipient — after sign-in via Google SSO **or** email/password if
  needed — to that Minyan's detail page ready to commit (D13).
- **FR-013**: Hosting a Minyan MUST auto-create a commitment for the host's own party size; the
  host MUST be able to cancel at any status, which voids all commitments and role claims,
  deactivates the join link, and notifies committed participants (D11).
- **FR-014**: When a commitment's linked Stay is cancelled or edited so it no longer covers the
  Minyan's date, the commitment MUST be auto-withdrawn, the user notified, and counts/status
  recomputed (D12).
- **FR-015**: A Minyan MUST auto-derive "completed" after its date passes in the destination-local
  timezone; completed and cancelled Minyanim MUST be excluded from active discovery results
  (D7/D10).
- **FR-016**: Committing to ≥2 Minyanim with the same tefilla on the same date in overlapping time
  MUST raise a soft conflict warning that the user may override (D14).
- **FR-017**: Every Stay/Minyan in discovery MUST offer a "flag" affordance, and discovery MUST
  exclude content marked hidden by moderation via a shared predicate that defaults to visible; the
  moderation threshold/behaviour is owned by Feature 006 (D19).
- **FR-018**: The discovery map + list, host form, commit flow, and notifications inbox MUST meet
  WCAG 2.1 AA, be RTL-correct and keyboard-operable (including keyboard-reachable map pins and a
  map/list parity), announce count/status changes via `aria-live`, use ≥44px touch targets, and
  use i18n-only strings and tokens-only colors (constitution).
- **FR-019**: From the My-Stays surface (002 dashboard / Stay detail), the system MUST show, per
  active Stay, a count of nearby Minyanim (matching the Stay's location + date range) and a link
  into discovery pre-filtered to that Stay's location and dates; when none are hosted, it MUST
  surface the nearby potential and a prompt to host instead of a dead end (D22, pull). The
  proactive push nudge is deferred (Assumptions).

### Key Entities

Persistence uses the generic **`event`** model with a `type` discriminator (D21); "Minyan" is the
v1 type and the user-facing name.

- **Event** (`type = 'minyan'` in v1) — host (User), location (city/country + coordinates +
  private specific address), single date + time, stored status (forming/cancelled), `type`,
  timestamps. Derived at read time: quorum/ready/completed (D7/D8).
- **Minyan attributes** (the `type = 'minyan'` specifics) — tefilla, nusach, Sefer Torah
  available, Ba'al Tefila / Ba'al Korei role-slot holders. Physical layout (1:1 detail table vs
  Zod-typed JSON column) finalized in `plan.md` (D21).
- **Commitment** — `(userId, eventId, numMen, stayId?)`, unique per (event, user); `stayId`
  optional, used only for the reconciliation flow (D3/D9/D12).
- **Role claim** — at most one participant per (eventId, role ∈ {baal_tefila, baal_korei}),
  claimed atomically (D9).
- **Notification** — per-recipient in-app record (read/unread) referencing the event + email
  send; idempotent per threshold crossing (D6).
- **Beit Chabad Pin** — static curated map entity (name, address, phone, coordinates),
  informational only; not an event (D18).

See [ROADMAP](../ROADMAP.md) for canonical definitions. This feature establishes the generic
event entity, the minyan type, Commitment, role-claim, and Notification records, the Beit Chabad
pin layer, and the potential-aggregation logic.

---

## Success Criteria

- **SC-001**: A city + date discovery query returns potential and hosted Minyanim within 2
  seconds.
- **SC-002**: A commitment or withdrawal is reflected in the Minyan's committed count within 5
  seconds for any viewer on the next poll/refetch (D5).
- **SC-003**: Quorum-reached, near-quorum, quorum-lost, and cancellation events deliver email +
  in-app notifications to all relevant recipients within 1 minute, exactly once per crossing.
- **SC-004**: "Ready" status is correct in 100% of cases across the readiness decision table
  — committed men {below / at / above 10} × Sefer Torah {present / absent} × Ba'al Korei
  {claimed / unclaimed} × {Shabbat-morning Shacharit / other} (D8).
- **SC-005**: The specific address and host/participant contact never appear in any response to a
  non-committed viewer, and the WhatsApp share message never contains the specific address, in
  100% of cases (D4).
- **SC-006**: Discovery filters (date range, Sefer Torah, nusach incl. "any") return only matching
  results.
- **SC-007**: The discovery map + list, host form, and commit flow meet WCAG 2.1 AA, are
  RTL-correct, and are fully keyboard-operable (verified with Playwright + axe).

---

## Assumptions

- The bounding-box radius, near-quorum threshold (default 8/10), and party-size maximum (≈50) are
  planning constants finalized in plan.md.
- Geocoding/map provider is inherited from 002 (MapTiler primary, server-side geocoding, ODbL
  attribution; D20).
- The Beit Chabad dataset depends on Chabad.org licensing; if unresolved by build time, pins are
  seeded manually into the `beit_chabad_pin` table (D18). Real-time Chabad sync is v2.
- Web push notifications are v2; v1 uses email + in-app only.
- The proactive Stay→Minyan **push** nudge (notify when a new Minyan appears near an existing
  Stay) is deferred to a fast-follow/v2; v1 ships the pull entry point (FR-019, D22).
- The generic `event` model ships in 003 with a single type (`minyan`); additional event types
  are future features that add a `type` value, not a rewrite (D21).
- Moderation/flag thresholds and admin curation are owned by Feature 006; 003 provides only the
  flag affordance and the read-time exclusion seam (D19).
