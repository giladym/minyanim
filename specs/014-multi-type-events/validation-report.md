# Validation Loop Report — Architect + PM (feature 014)

Date: 2026-07-12. Two independent adversarial reviews (Architect lens, PM lens) over spec + plan +
research + data-model + contracts + ux, verified against the real code. This records every finding,
its resolution, and where the resolution was applied. Artifacts were updated per this report before
`/speckit-tasks`.

## Decision: R2 attendance model → **Option A (unified `attendance`)**

Decisive (Architect). Option B forces a `commitment`-vs-`rsvp` branch at every read site *including the
address-reveal privacy gate* — the highest-consequence branch in the app; a miss = SC-003 leak. Option
A collapses them to one predicate (`status='confirmed'`). Pre-launch, no real data → the migration
hazard that would favor B is gone.

**The latent leak Option A must fix**: `getCommitment` (eventRepository.ts:200) returns a row
regardless of status; it feeds the reveal gate at `eventService.getMinyan:156`. A `pending`/
`waitlisted` meal requester HAS an attendance row → without a status check the exact address reveals to
an unapproved requester. The generalization is "confirmed = row exists **AND** status='confirmed'", not
a rename.

**Confirmed-predicate audit checklist (every site that reads/sums `commitment`)** — each MUST gain
`status='confirmed'`; simplest defense: the repo exposes `getConfirmedAttendance` so no caller can
forget the predicate:
1. `committedMenByEvent` quorum sum — eventRepository.ts:138–147
2. `getCommitment` reveal gate — eventRepository.ts:200 → consumed eventService.ts:156 **(SC-003 leak site)**
3. `participantsForEvent` roster — eventRepository.ts:210
4. `userCommittedNearby` dashboard — eventRepository.ts:235
5. `recipientsForEvent` cancel/host-change fan-out — notificationRepository.ts:14–20 (else a *declined* requester gets a "cancelled" email)
6. metrics quorum funnel — metricsRepository.ts:32–38
7. `userCommitmentsOnDate` double-book conflict — commitmentRepository.ts:45–58
8. `commitmentsByStay` / `linkedMinyanimForStay` (013 guard) — commitmentRepository.ts:71–101
9. host self-attendance write (`insertCommitment`) — commitmentRepository.ts:12 / eventService.ts:192 → written `status='confirmed'`
10. claim-merge reassign on `(event_id,user_id)` clash — claimRepository.ts:76–84
11. role claim gate — roleService.ts:15: the claim requires a commitment row; under soft-cancel a
    withdrawn (`status='cancelled'`) participant could still claim/hold Ba'al Korei → the readiness
    derivation lies (SC-005). A claim MUST require a CONFIRMED attendance.
12. `transferHost` (013) — commitmentService.ts:103: could reassign a withdrawn user as host →
    `OwnerEventDTO` incl. the exact address. MUST require a confirmed attendance.
13. `updateCommitmentMen` — commitmentRepository.ts:18–25: updates regardless of status; under
    soft-cancel it would silently resize a cancelled row (and fire `onQuorumChange`). MUST gain a
    status predicate (confirmed/waitlisted/pending only) or be folded into the re-join path.

**Soft-cancel interaction sites (audit addendum, R14)**:
- `reconcileCommitmentsForStay` (commitmentService.ts:123–137, the 013 auto-withdraw) currently
  hard-DELETEs; change to soft-cancel for consistency with R14 (same predicate everywhere).
- `claimSeeds` dedup (claimRepository.ts:78–84) must become status-aware: on an `(event_id,user_id)`
  clash keep the **confirmed** row, not blindly the real user's possibly-cancelled row.

Migration 0014 rename is FK-safe (nothing references `commitment.id`; it's a leaf). Gate on the
existing quorum/roster/discovery decision-table tests passing byte-for-byte (SC-005) **plus** a new
per-type DTO-non-exposure test proving a `pending` attendee gets an address-free DTO.

## CRITICAL — approval-mode + waitlist state machine was self-contradictory (PM #1)

Spec FR-006 auto-promotes a waitlisted guest to `confirmed` on a freed seat; but meals are approval
mode (FR-004/007) where the host must confirm each guest. Auto-promoting to `confirmed` **bypasses host
approval → a stranger gets the exact address without approval**. Also `POST attendance` in approval
mode always → `pending`, yet the UX showed a `waitlisted` "#2" state, so a full approval meal held both
`pending` and `waitlisted` with no defined priority.

**Resolution (coherent unified-queue model, promotion target depends on `rsvp_mode`)**:
- **open mode** (gathering, minyan): join → `confirmed` if it fits, else `waitlisted`. On a freed seat,
  auto-promote the earliest-requested waitlisted guest **that still fits** directly to `confirmed`.
- **approval mode** (meal): request → `pending` (the ordered queue, by `requested_at`). Nothing ever
  auto-confirms. The host approves (guarded to fit) or declines. A full meal simply blocks approvals
  that don't fit; a freed seat notifies the host that they can now approve a pending request. The
  `waitlisted` status is **unused in approval mode** — `pending` is the queue. No approval bypass, no
  leak.

Applied: spec FR-004/006/007 + edge cases; research R2/R4; data-model transitions; contracts
`/attendance` + promotion; ux Screen-4 states.

## HIGH — capacity must be party-size SUM + promotion "earliest that fits" (Arch #2a/2b, PM #2)

data-model said "party-size sum", research R4 said "confirmed_count", spec SC-006 said "promote exactly
one". With variable party sizes, unconditional promotion of a party-of-4 into a 1-seat gap overbooks →
SC-006 violation. **Resolution**: capacity is a **guest party-size sum** everywhere; every `→confirmed`
transition (join, approve, promote) is guarded by a **single self-contained SQL statement** whose guard
reads committed state (D1 serializes writes — the guard sees prior commits; `db.batch` is pipelining,
NOT the atomicity source — eventRepository.ts:152 confirms this). Promotion = "earliest-requested
waitlisted that still fits" (a too-large party may be skipped — documented fairness nuance). Concrete
guarded SQL for join / approve / cancel-promote is specified in research R4 + contracts. The 0-rows
result on approve is disambiguated (`request.not_pending` vs `capacity.full`) with one cheap read.
Applied: research R4 (with SQL), data-model, contracts, spec SC-006 note.

## HIGH — partial-party over-capacity dead-end (PM #2)

Party of 4 requests a meal with 3 seats free → approve fails `capacity.full`, no resolution path.
**Resolution (v1)**: (a) the guest can reduce party size via `PATCH /attendance` (a "reduce to fit"
affordance in the pending band); (b) the host can Message the guest (008) to coordinate; (c) a smaller
later pending request can be approved (host discretion — the queue is ordered for display, not binding).
Documented in contracts + ux; no partial/over-approval invented. Applied.

## HIGH — RSVP cutoff was dropped (Arch #4, PM #4) → new `event.rsvp_cutoff`

US1 promises an RSVP cutoff; it was absent from FRs/data/API/UX. **Resolution**: add nullable
`event.rsvp_cutoff` (timestamp). After the cutoff (or once the event date has passed), `POST/PATCH
attendance` are rejected (`rsvp.closed`); the traveler sees "requests closed". No background job
(stack has no Queues/cron): "closed/expired" is **derived** at read time from `rsvp_cutoff`/`eventDate`
vs now — this also gives pending travelers a terminal state (PM #3) without infra. New FR-016. Applied:
spec (FR-016 + SC), data-model (`event.rsvp_cutoff`), contracts, ux (cutoff control + closed state).

## HIGH — no start/end time storage (Arch #4)

FR-002 + UX promise optional start/end time; `event` has only date-only `eventDate`. **Resolution**: add
nullable `event.start_time` / `event.end_time` as `'HH:MM'` wall-clock strings (reusing the minyan
`services[].time` convention), separate from the date-only `eventDate`. Applied: data-model, contracts,
ux.

## MEDIUM — host seat semantics (Arch/PM #5) → host is organizer, not a counted seat

For meal/gathering, `capacity` = **guest** seats; the **host is NOT an attendance row** (they are the
organizer, shown via `event.hostUserId`/OrganizerCard). `seatsRemaining = capacity − SUM(confirmed guest
party sizes)`. The per-type strategy sets `hostSelfAttends`: **minyan = true** (host self-commits, counts
toward quorum — unchanged, SC-005), **meal/gathering = false**. Bonus: the atomic capacity SQL needs no
host-exclusion (the host simply isn't a row). Applied: research R12, data-model, contracts, ux (label
"seats for guests").

## MEDIUM — `/commit` vs `/attendance` route duality (Arch #3) → keep `/commit` as alias

Canonical new surface is `/api/events/:id/attendance` + `/requests`. The shipped minyan FE keeps calling
`POST/PATCH/DELETE /api/events/:id/commit` **unchanged** (thin aliases delegating to the attendance
service with `status='confirmed'`) so no minyan pixel/wire changes (SC-005). Applied: contracts, plan
note.

## MEDIUM — withdraw semantics under Option A (Arch #4) → soft-cancel

`withdraw` becomes a soft `status='cancelled'` (preserves waitlist ordering/history + the freed-seat
promotion trigger); re-join UPDATEs the existing `(event_id,user_id)` row back to `pending`/`confirmed`
rather than INSERTing. Behaviorally identical for minyan (cancelled rows excluded from quorum/roster).
Applied: data-model transitions, contracts.

## MEDIUM — flagship protection (PM #6/#7) → product decisions, made explicitly

- Type picker: **Minyan is listed first**; the "recommended/החדש" badge that deprioritized minyan is
  **removed**. Minyan-context entry points (dashboard "host a minyan", Stay `⋮`) **deep-link
  `type=minyan` and skip the picker** → zero added taps for the flagship. A generic "Host an event"
  entry shows the picker. Applied: ux Screens 1 + entry points.
- Discovery: default shows all types (spec US2 intent). But arriving from a **minyan-specific entry
  point pre-applies the `minyan` type filter** so the flagship search is not diluted for that user.
  Applied: ux Screen 6.

## LOW / deferred (logged, not blocking)

- Minyan-named error codes on the generic path (`MINYAN_CANCELLED` → `event.*`) — rename during impl (Arch #5).
- Notification `fanOut` hardcodes `/minyan/${id}` + takes only `eventId`; thread `type` for a type-aware
  URL; new kinds widen the shared union AND `notificationEmail()` must handle them (Arch #6/R8).
- `declined` re-request can re-nag the host (PM #10) — v1 allows it (same row → pending); acceptable.
- **Shabbat/holiday meal shows candle-lighting zmanim** (PM #11) — 005 already exposes
  `GET /api/events/:id/zmanim`; add a collapsible zmanim panel on meal detail when occasion is
  Shabbat/a festival. Cheap, high delight — added to ux as SHOULD (not blocking).
- Moderation-hidden meal: notify pending requesters of the outcome (PM #12) — reuse cancel notify; noted
  for impl.
- SC-002 reworded to two-actor terms (PM #8) — approval is async, "single session" is not measurable.
  Applied: spec SC-002.

## Verdict after resolution

Both blockers (the R2 leak site and the approval/waitlist state-machine contradiction) are resolved into
a single coherent unified-queue model with capacity as a guarded party-size sum and per-`rsvp_mode`
promotion targets; the dropped RSVP cutoff and start/end time are restored as real fields; host-seat,
route-aliasing, and withdraw semantics are pinned. A focused re-verification pass confirmed the revised
state machine is internally consistent and SC-006 is no longer violable. **Ready for `/speckit-tasks`.**

## Post-loop model revision (2026-07-12)

After the loop, the product owner revised the **type axis**: `event.type` is now a **behavior class**
(`minyan` — quorum readiness | `gathering` — capacity + RSVP; only these two), plus an extensible
`event.category` — the user-facing kind for gatherings (`hosting` | `social` in v1; `learning` |
`celebration` are model-ready fast-follows; `NULL` for a minyan). The old "**meal** event type" maps to
the **hosting-category gathering** (one `gathering` detail table with a category-discriminated `attrs`
JSON replaces the separate `meal`/`gathering` detail tables). User-facing naming: **מניין / Minyan**,
**אירוח / Hosting**, **מפגש / Gathering** (Hebrew leads); "meal"/סעודה is kept only for the food
served (e.g. `mealType`). **Every loop decision above carries over unchanged**: Option A unified
`attendance` + the 13-site confirmed-predicate audit (extended post-loop with the roleService /
transferHost / updateCommitmentMen sites + the soft-cancel addendum); the corrected state machine (approval-mode
`pending` queue, never auto-confirms; open-mode waitlist + earliest-that-fits promotion); capacity as
the guarded confirmed party-size SUM; the RSVP cutoff + read-time "closed"; host-not-a-seat
(`hostSelfAttends`: minyan=true, gathering=false); the `/commit` alias; withdraw = soft-cancel. The
line-item references to a "meal type/table" above are historical — read them as the hosting-category
gathering. research.md (R1) + data-model.md are the source of truth for the revised model; spec, plan,
contracts, ux, tasks, and quickstart were re-aligned accordingly.
