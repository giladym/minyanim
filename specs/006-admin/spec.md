# Feature Specification: Admin — Moderation, Curation & Metrics

**Feature Branch**: `006-admin`

**Created**: 2026-06-18

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **001 Platform Foundation**
(roles); most useful once **002 Stays** and **003 Discovery & Quorum** produce real data.

---

## Summary

A minimal admin capability for v1 covering three operational needs: **moderation**
(community flagging + an admin review queue + user sanctions), **Beit Chabad pin curation**
(since v1 has no real-time sync), and a **basic metrics** view. The richer analytics
dashboard is deferred to v2.

**Moderation model (decided):** the community can **flag** content (a Stay or Minyan) and
optionally report the user behind it. When **3 distinct reporters** flag the same content,
it is **auto-hidden** from public view pending review — content only; the user is *not*
auto-banned. Suspending or banning a **user** is always an explicit admin decision, which
neutralizes coordinated false-flagging ("brigading").

---

## User Scenarios & Testing

### User Story 1 — Flag Content or Report a User (Priority: P1)

Any signed-in user can flag a Stay or Minyan, and optionally report the user behind it,
choosing a reason.

**Why this priority**: Flagging is the input that feeds all moderation; without it, admins
are blind.

**Independent Test**: A user flags a spammy Minyan with reason "spam"; the flag is recorded
once and appears in the admin queue.

**Acceptance Scenarios**:

1. **Given** a Stay or Minyan, **When** a signed-in user flags it and selects a reason
   (spam / inappropriate / fake / other), **Then** the flag is recorded and surfaced in the
   admin moderation queue.
2. **Given** a user has already flagged an item, **When** they try to flag it again,
   **Then** the system does not count a second flag (one flag per reporter per item).
3. **Given** flagging an item, **When** the user chooses to also report the user behind it,
   **Then** a user-level report is attached to the queue entry.

---

### User Story 2 — Auto-Hide at Threshold (Priority: P1)

When a piece of content reaches 3 distinct reporters, it is automatically hidden from public
view and escalated, without banning the user.

**Independent Test**: Three different users flag the same Stay; it disappears from public
discovery and is marked "auto-hidden — pending review" in the admin queue, while the owning
user remains active.

**Acceptance Scenarios**:

1. **Given** a content item, **When** it accumulates flags from 3 distinct reporters,
   **Then** it is hidden from public/discovery views and marked "auto-hidden, pending review".
2. **Given** auto-hidden content, **When** the owning user views their own dashboard,
   **Then** they see it marked as under review (not silently deleted).
3. **Given** the threshold is reached, **When** auto-hide triggers, **Then** the user is NOT
   automatically suspended or banned — only the content is hidden.

---

### User Story 3 — Admin Moderation Queue & Actions (Priority: P1)

An admin reviews flagged/reported items and takes action.

**Independent Test**: An admin opens the queue, reviews an auto-hidden Minyan, and either
restores it or removes it and suspends the user.

**Acceptance Scenarios**:

1. **Given** the moderation queue, **When** an admin opens it, **Then** they see flagged
   content and user reports ordered by urgency (auto-hidden first), with reasons and reporter
   counts.
2. **Given** a queue item, **When** the admin acts, **Then** they can: dismiss (restore
   content), remove content, warn the user, suspend the user (temporary), or ban the user
   (permanent).
3. **Given** an admin suspends or bans a user, **When** that user next attempts to sign in or
   act, **Then** they are blocked according to the sanction and informed.
4. **Given** an admin dismisses flags as invalid, **When** dismissed, **Then** the content is
   restored to public view and the flags are cleared.

---

### User Story 4 — Curate Beit Chabad Pins (Priority: P2)

An admin maintains the static Beit Chabad map layer: add, edit, and remove pins, and run the
one-time seed import.

**Independent Test**: An admin adds a Beit Chabad pin; it appears on the public discovery map.

**Acceptance Scenarios**:

1. **Given** the admin pin manager, **When** an admin adds/edits/removes a Beit Chabad pin
   (name, address, phone, coordinates), **Then** the change is reflected on the public map.
2. **Given** a permitted Chabad.org dataset/API, **When** an admin runs the one-time seed
   import, **Then** pins are bulk-created and become curatable. (Import is gated on licensing
   — see ROADMAP open items.)

---

### User Story 5 — Basic Metrics (Priority: P3)

An admin sees a basic dashboard of platform health, centered on the north-star "minyanim
formed". (Full analytics is v2.)

**Independent Test**: An admin opens the metrics view and sees current counts for active
users, stays, minyanim hosted, and minyanim that reached quorum.

**Acceptance Scenarios**:

1. **Given** the metrics view, **When** it loads, **Then** the admin sees at least: active
   users (DAU/WAU/MAU), new sign-ups, Stays created, Minyanim hosted, and Minyanim that
   reached quorum.
2. **Given** the metrics view, **When** it loads, **Then** it shows the funnel conversion
   (potential → hosted → quorum) and top locations by activity.

**Proposed v1 metrics** (see ROADMAP matrix; full dashboard is v2):

| Tier | Metric |
|------|--------|
| North-star | Minyanim reaching quorum / ready |
| Funnel | Potential → Hosted → Quorum conversion |
| Supply | Stays created per period; men per region per Shabbat |
| Activity | DAU/WAU/MAU; new sign-ups |
| Geography | Top locations & Shabbatot by activity |
| Ops/health | Notifications sent; flagged-content count; auto-hidden count |

---

### Edge Cases

- A user flags content, then deletes their account → their flags are removed; if the count
  drops below threshold, auto-hidden content may be restored (or held for admin review per
  policy).
- Coordinated flagging of a legitimate host → mitigated by content-only auto-hide; the user
  stays active and an admin can restore and note the abuse.
- The flagged user is themselves an admin → such flags are routed to a different admin / the
  system owner, never auto-actioned against an admin.
- An admin attempts to ban the last remaining admin → blocked; there must always be at least
  one active admin.

---

## Requirements

### Functional Requirements

- **FR-001**: Any signed-in user MUST be able to flag a Stay or Minyan with a reason, and
  optionally report the user behind it; the system MUST count at most one flag per reporter
  per item.
- **FR-002**: When a content item reaches 3 distinct reporters, the system MUST auto-hide it
  from public/discovery views, mark it "pending review", and escalate it in the admin queue —
  WITHOUT auto-suspending or banning the owning user.
- **FR-003**: The system MUST provide an admin-only moderation queue listing flagged content
  and user reports, ordered by urgency, with reasons and reporter counts.
- **FR-004**: An admin MUST be able to dismiss (restore), remove content, warn, suspend
  (temporary), or ban (permanent) from the queue.
- **FR-005**: Suspended/banned users MUST be blocked from the corresponding actions and
  informed of their status.
- **FR-006**: An admin MUST be able to add, edit, and remove Beit Chabad pins, and run a
  one-time seed import from a permitted Chabad.org source (gated on licensing).
- **FR-007**: The system MUST provide an admin metrics view with at least the v1 metrics
  listed above.
- **FR-008**: Admin capabilities MUST be restricted to users with the admin role; all admin
  actions MUST be access-controlled and auditable.
- **FR-009**: The system MUST always retain at least one active admin (cannot ban/suspend the
  last admin).

### Key Entities

- **Admin** — see [ROADMAP](../ROADMAP.md). An elevated role on a User.
- **Flag** — a single report by one user against one content item (and optional user target),
  with a reason and timestamp. Unique per (reporter, item).
- **Moderation Queue Entry** — an aggregation of flags/reports for an item, its state
  (open / auto-hidden / actioned / dismissed), and the admin action taken.
- **Sanction** — a warning, suspension (with expiry), or ban applied to a User by an admin.
- **Beit Chabad Pin** — curated by admins (see ROADMAP).

---

## Success Criteria

- **SC-001**: Content reaching 3 distinct flags is hidden from public view within seconds and
  appears in the admin queue.
- **SC-002**: No user is ever auto-banned by flags alone; 100% of user bans/suspensions are
  admin-initiated.
- **SC-003**: An admin can action a queue item (restore/remove/warn/suspend/ban) in under
  30 seconds from opening the queue.
- **SC-004**: Beit Chabad pin edits appear on the public map within seconds.
- **SC-005**: The system never reaches a state with zero active admins.

---

## Assumptions

- Admin role is assigned out-of-band (e.g. seeded for the founder) in v1; a self-service
  admin-management UI is out of scope.
- Suspension duration options and warning templates are defined during planning.
- Full analytics (retention cohorts, time-series charts, exports) is v2; v1 shows current
  counts and the funnel.
- The Chabad.org seed import depends on verified licensing/ToS (ROADMAP open item); absent
  permission, pins are curated manually.
