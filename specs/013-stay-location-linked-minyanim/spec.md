# Feature 013 — Stay location change ↔ linked minyanim

**Status:** DRAFT (design open — not yet implemented). Captured from a review discussion.

## Problem

A Stay's location is editable. But a Stay can have **minyanim linked to it**, and silently changing the
Stay's city can leave those minyanim geographically inconsistent (a Warsaw minyan attached to a Stay
that now says Paris). We want to **track, validate, and guard** that edit.

## Critical data-model finding

There is **no persisted link between a Stay and a minyan the user _hosts_**. The only stay↔event edge
today is `commitment.stay_id` — i.e. the **participant** side. Even a minyan created via the
"host from this stay" flow (`/minyan/new?fromStay=…`) stores `stayId: null` on the host's
self-commitment (`eventService.hostMinyan`). So:

- **Participant commitments** linked to a Stay → discoverable via `commitment.stayId`
  (`commitmentsByStay`, and the existing `reconcileCommitmentsForStay`, which today reconciles on
  **dates only**, not location, and sends no notification).
- **Hosted minyanim** linked to a Stay → **not tracked at all**.

**Therefore the guard requires groundwork first:** persist the linkage at creation.

## Decisions taken in review

1. **Persist the linkage at creation.** When a minyan is hosted from a Stay, store that `stayId` on the
   host's self-commitment (today `null`). This makes hosted minyanim trackable back to their Stay via the
   same `commitment.stayId` edge already used for participants. Requires threading `fromStay` →
   `CreateEventInput`/commit → `eventService.hostMinyan` self-commit.
2. **No silent auto-cascade.** On a Stay location change we do **not** silently withdraw people or cancel
   events. We **warn** and let the user choose.
3. **Full option set chosen** (2026-07-11): on a location change with linked minyanim, the user
   picks one of — **Duplicate to new destination** · **Reassign host, then change** (host case) ·
   **Keep minyanim, unlink from stay** · **Change anyway** · **Cancel**. No silent cascade.
4. **Test setup:** a dev seed (regular + admin + a host + a linked participant on one shared minyan)
   for manual testing, plus e2e + backend integration tests.

### Build status
- [x] Persist linkage — `CreateEventInput.stayId`; host self-commit stores it (`eventService`);
      `HostMinyanForm` sends `fromStay`.
- [x] Read — `GET /api/stays/:id/linked-minyanim` → `LinkedMinyanDTO[]` (`commitmentService.linkedMinyanimForStay`,
      `commitmentRepository.linkedMinyanimForStay`); FE `useLinkedMinyanim`.
- [ ] Actions — `POST /api/events/:id/transfer-host`; unlink (`commitment.stayId = null`); change-anyway (plain update).
- [ ] FE guard dialog on location change.
- [ ] Dev seed + tests.

## Proposed behavior

When the user changes a Stay's **location** (city/coords) AND the Stay has ≥1 linked minyan
(participant commitment and/or hosted event via `commitment.stayId`):

- Show a confirmation surface listing the linked minyanim (name, date, host-or-participant role).
- Offer options (final set TBD — see Open questions):
  - **Duplicate to a new destination** _(recommended)_ — leave this Stay + its minyanim untouched; open
    the Add-Stay form prefilled from this Stay (existing `/stays/new?from=` duplicate flow) so the user
    sets the new location + dates there.
  - **Keep the original minyanim (change anyway)** — save the location change; the minyanim are left
    as-is (may be geographically inconsistent). Possibly unlink them from this Stay.
  - **Reassign host** _(host case only)_ — before changing, transfer host to another committed
    participant so the minyan continues without the leaving user.
  - **Cancel** — abort the edit.

No location change proceeds without an explicit choice when linked minyanim exist.

## Open questions (need a decision before implementation)

- **Exact option set + copy** for the confirmation dialog, and per-role behavior (host vs participant).
- **"Keep original":** does it *unlink* the minyanim from the Stay (`commitment.stayId = null`) or keep
  the (now-inconsistent) link?
- **"Reassign host":** which participant, and what if there are none? Does it need a new endpoint
  (`POST /api/events/:id/transfer-host`)?
- **Notifications:** if any option removes the user from a minyan, do we notify the host/participants?
  The notification table is event-scoped (non-null `eventId`) and has kinds
  `quorum_reached|near_quorum|quorum_lost|cancelled|minyan_nearby` — a "participant left" / "host
  changed" semantic would be new. Follow the `cancelMinyan` pattern (capture recipients before mutating).
- **Multiple linked minyanim:** apply one choice to all, or per-minyan? (Keep it UX-feasible — likely one
  choice applied to all.)

## Implementation sketch (once decided)

- **Backend:** thread `stayId` into the host self-commit; add a "linked minyanim for a Stay" read
  (`commitmentsByStay` already returns commitments + event dates — extend to include host flag + minyan
  summary, or a new `GET /api/stays/:id/linked-minyanim`); extend `updateStay`/`reconcileCommitmentsForStay`
  to detect a **location** change (not just dates) and upgrade it to `Ctx` so it can notify; optional
  `transfer-host` endpoint.
- **Frontend:** in `AddEditStayForm`, when `showPicker` edits change location and linked minyanim exist,
  intercept submit with the confirmation surface + the options above.
- **Tests:** unit (reconcile w/ location), route (linked-minyanim read), FE (dialog branches), e2e.

## Related

Amends 002 (Stay CRUD) and 003 (host/commit). See `specs/ROADMAP.md`, ADR 0008 (contact visibility),
and the investigation notes that produced this doc.
