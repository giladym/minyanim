# Quickstart — Multi-type events (validation guide)

Runnable scenarios that prove feature 014 end-to-end. Prereqs: monorepo installed (`pnpm i`),
migration 0014 applied locally (`pnpm --filter @minyanim/backend db:migrate:local`), dev servers up
(`pnpm dev`), `GEO_MODE=mock`. See [contracts/api.md](./contracts/api.md) + [data-model.md](./data-model.md)
for shapes; this file is a run/validation guide, not implementation.

## Scenario A — Host a hosting event (seudah) for travelers (US1, SC-001/002/003)
1. Sign in as host. Go to **Host an event** → pick **אירוח / Hosting**.
2. Fill: title, meal type (Shabbat dinner), occasion (Shabbat), date, RSVP cutoff, **seats = 4**,
   kashrut, dietary, offering/bring, neighborhood (city public, exact address private). RSVP mode
   defaults to **approval**. Save.
   - ✅ Expect: create round-trips in < 3 min (SC-001); redirect to the event detail as host
     (`OwnerEventDTO`).
3. As a **different** signed-in traveler, open discovery near the hosting event.
   - ✅ Expect: the hosting event appears with kind=hosting (type=`gathering`, category=`hosting`),
     occasion=Shabbat, **seats remaining = 4**, dietary info, host public profile,
     city/neighborhood — **no exact address** (SC-003).
4. Traveler requests a seat (partySize 1).
   - ✅ Expect: status `pending`; host gets a `seat_requested` notification **in-app AND by email**
     (he/en, deep-linking to the event) and sees a "בקשות ממתינות" badge on the hosted row in
     **"האירועים שלי"** (My events, `GET /api/me/events`); traveler still sees no exact address.
5. Host opens the request list, **approves**.
   - ✅ Expect: traveler → `confirmed`; seats remaining → 3; traveler's next detail read now shows the
     **exact address + entry notes + host contact** (SC-002); requester gets `request_approved`.
6. Host **declines** a second requester.
   - ✅ Expect: `declined` + notification; that requester never sees the address.

## Scenario B — Capacity + waitlist (US1 edge, SC-006)
1. On the seats=4 hosting event, get 4 confirmed guests (approve requests).
2. A 5th traveler requests / a 5th open-join occurs.
   - ✅ Expect: `waitlisted` (never a 5th confirmed) — over-book is impossible.
3. A confirmed guest cancels.
   - ✅ Expect: the **earliest-requested** waitlisted guest is auto-promoted to `confirmed`, notified
     `waitlist_promoted`; seats remaining stays consistent. Approving beyond capacity → `capacity.full`.

## Scenario C — Discover & filter hosting events/gatherings + minyanim (US2, SC-004)
1. Seed a minyan, a hosting event (Shabbat), and a social gathering (Pesach kiddush) near one location.
2. Open discovery there.
   - ✅ Expect: all three listed, each labeled with kind + occasion.
3. Filter **kind = hosting** → only the hosting event. Filter **occasion = Pesach** → only the Pesach
   social gathering. Clear filters → all three. Nusach/seferTorah controls appear only when minyan is
   in scope.

## Scenario D — Host a social gathering (US3)
1. Create a **social gathering** (subcategory=kiddush, capacity=30, RSVP mode open).
2. Others RSVP directly (no approval) until 30 confirmed; the 31st is waitlisted.
   - ✅ Expect: open RSVP auto-confirms under capacity; waitlist past capacity.

## Scenario E — Minyan regression (US4, SC-005) — MUST be unchanged
1. Host a minyan from a Stay; commit party size; reach 10 men + Sefer Torah + roles filled.
   - ✅ Expect: readiness reads "ready" exactly as before; quorum progress `/10`; roster + tiered
     address reveal to committed participants only; cancel notifies participants; 013 location guard
     fires. **No pixel/URL/behavior change** — `/minyan/$id` still works, `/minyan/new?fromStay=` still
     works.

## Automated gates
- Backend (vitest-pool-workers, run in small batches): per-behavior readiness/join decision tables;
  approve→confirm→address-reveal; **capacity+waitlist concurrency** (SC-006); occasion+kind discovery
  filter; per-type DTO non-exposure (SC-003); cascade-orphan incl. gathering/attendance; **minyan
  regression decision table unchanged** (SC-005).
- Frontend (Vitest + Testing Library): kind-picker create flow; discovery kind/occasion filters; hosting
  request/approve panel; RSVP/waitlist states; minyan detail unchanged snapshot.
- e2e (Playwright + axe-core, `GEO_MODE=mock`): Scenario A end-to-end + WCAG 2.1 AA on the new
  surfaces; Scenario E minyan regression.
