# Implementation Plan: A location holds events

**Branch**: `015-location-events` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Status**: Shipped (merged to develop — PRs #60/#61; migration 0015 applied local + remote). Documented
retroactively — this plan records the structure **as built**.

**Input**: The design brainstorm's chosen **Option B** (see [design/decision.md](./design/decision.md)):
a location (Stay / יעד) is a clean anchor carrying 0…N events, events attach via `event.stay_id`, and
"＋ הוסף אירוע" routes into the shipped 014 kind-picker flow.

## Summary

Decouple the **location** (where a traveler is + who is with them) from **event intent** (a minyan, a
seudah, a gathering). The location form had grown to conflate the two — it carried `prayer_needs` and a
`brings_sefer_torah` toggle, implying a single minyan per location. This feature **removes those two
minyan-shaped fields from the location** and instead lets a location carry **0…N real events** via a new
nullable `event.stay_id` edge. The location's edit page grows an **"האירועים שלי כאן"** list + a
**"＋ הוסף אירוע"** button that routes into the already-shipped **014** multi-type-event kind picker
(`/event/new?fromStay=…`), so the location becomes a hub for a minyan **and** a Shabbat meal **and** a
social gathering at once. A compact **"N אירועים"** chip surfaces the count on the dashboard card. The
group-size field (`num_men`) is **kept and relabeled** ("מי מגיע") because it still feeds discovery
potential; the only discovery consequence of the drop is that per-Shabbat potential loses its
Sefer-Torah count and becomes men-overlap only.

The whole feature rides on **two axes**:

1. **Data axis** — one additive column (`event.stay_id`, `ON DELETE SET NULL`, indexed) + two dropped
   columns (`stay.brings_sefer_torah`, `stay.prayer_needs`), all in migration **0015**.
2. **Read axis** — one owner-gated route `GET /api/stays/:id/events` returning the location's events as
   the UNION of hosted (`event.stay_id`) ∪ joined (`attendance.stay_id`) rows, reusing the 014
   `MyEventRow` shape (no new DTO).

Everything else — event creation, RSVP, discovery, the 013 stay↔minyan guard — is reused, not rebuilt.
Event creation already threaded `fromStay` (013) into the host self-attendance's `attendance.stay_id`;
015 additionally stamps `event.stay_id` in the same create paths (`hostMinyan` + `createGathering`), so
**hosted** events (not just joined ones) are now trackable to a location — closing the tracking gap 013
had flagged. This was built in parallel by a backend agent and a frontend agent, then verified
(typechecks + the backend/FE suites + build).

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 (Wrangler v4) — unchanged from 001–014.

**Primary Dependencies**: Hono (plain routes + `safeParse` + `*.parse()` DTOs — the house pattern),
Drizzle ORM + drizzle-kit, Zod v4, better-auth (session/ownership), TanStack Router + Query (the FE
`["stay-events", …]` query + `invalidateEventViews`), react-i18next, Tailwind v4 (logical props, RTL).
Reuses the entire 014 event stack (`eventService`, `eventRepository`, `attendanceService`,
`discoveryService`, the `MyEventRow` row shape) and the 013 `attendance.stay_id` linkage. **No net-new
infra binding.**

**Storage**: Cloudflare D1 (SQLite) via Drizzle. Migration **0015** (`0015_location_events.sql`):
`ALTER TABLE event ADD stay_id text REFERENCES stay(id)` (nullable, `ON DELETE SET NULL`) +
`CREATE INDEX event_stay_idx ON event(stay_id)` + `ALTER TABLE stay DROP COLUMN brings_sefer_torah` +
`ALTER TABLE stay DROP COLUMN prayer_needs`. **Pre-launch: no real data — a destructive column drop is
acceptable (dev-no-real-data).** Remote dev D1 migrated on deploy (`pnpm db:migrate:remote`; applied
local + remote).

**Testing**: vitest-pool-workers (`stay-events.test.ts` — the owner-gated UNION read; plus the existing
minyan/stay/discovery suites updated for the dropped fields). Vitest + Testing Library
(`StayEvents.test.tsx`; `AddEditStayForm.test.tsx` / `StayCard.test.tsx` updated). **Run the backend
suite in small batches** (vitest-pool-workers port exhaustion, per project memory).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo (`apps/frontend`, `apps/backend`, `packages/shared`).

**Performance Goals**: the location-events read is two indexed lookups (`event_stay_idx` +
`attendance.stay_id` via the attendance indexes) merged in memory — bounded by a single location's
events, no pagination needed.

**Constraints**: RTL/Hebrew-first; WCAG 2.1 AA; i18n-only strings (the new `stays.events.*` namespace,
he+en, parity-tested); tokens-only colors (the kind badges reuse 014's `--primary`/`--clay`/`--sky`
soft tokens); **D1 has no interactive transactions** (the create paths already use `db.batch`);
owner-gated reads (404 on a non-owned location — the address/private surface is never exposed). Minyan +
013 behavior unchanged.

**Scale/Scope**: 3 user stories (2 P1, 1 P2). 1 additive event column + 2 dropped stay columns
(migration 0015); 1 new route; ~2 new repository functions (`eventsForStay`, reused
`pendingCountsByEvent`); ~2 new FE components (`StayEventsSection`, `StayEventsChip`) + 1 hook
(`useStayEvents`) + the `invalidateEventViews` reactivity helper; the location form + card + discovery
potential updated for the dropped fields.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 (5 principles + Architecture & Engineering Standards):

| Gate | Status | Notes |
|------|--------|-------|
| Hebrew-first / RTL | ✅ | New copy is the `stays.events.*` namespace (title/add/empty/count) + the relabeled `stays.numMen` ("מי מגיע"), he+en, parity-tested; logical props only. |
| Accessibility WCAG 2.1 AA (non-negotiable) | ✅ | The events section is a labeled `<section>` + list of links; the "＋ הוסף אירוע" is a real router `<Link>`; the count chip is text (not color-only). Removing two form controls only shrinks the a11y surface. |
| Mobile-first | ✅ | The events section + card chip built into the existing 375 px location form/card layout; ≥44 px targets on the add-event link and rows. |
| Edge-first performance | ✅ | The read is two indexed queries (`event_stay_idx`, attendance indexes) merged in memory; the FE degrades a not-yet-live endpoint to an empty list (no error surface). |
| Simplicity / YAGNI | ✅ | One additive FK + two dropped columns + one route reusing the 014 `MyEventRow`. No new DTO, no new event shape, no per-location event framework. |
| Two-app monorepo, layered backend | ✅ | New logic lands in the existing router→controller→service→repository layers (`stays.ts` route → `stayEventsController` → `getStayEvents` → `eventsForStay`); no new layer. |
| Contract-first (shared Zod → FE + DTOs) | ✅ | `stay.ts` schemas drop `bringsSeferTorah`/`prayerNeeds` from the create/update inputs + owner DTO; `discovery.ts` drops `seferTorahCount` from `PotentialBucket`; the location-events read reuses the shared `MyEventRow`. |
| Secrets via `env` bindings only | ✅ | No new secrets or bindings. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse the existing logger + `Ctx`; JSDoc on `getStayEvents`/`eventsForStay`/`stayEventsController`/`useStayEvents`/`invalidateEventViews`. |
| No interactive D1 txns; verified cascade | ✅ | `event.stay_id` is `ON DELETE SET NULL` — the cascade-orphan test proves deleting a location keeps its events (nulls the edge); the create paths use the existing `db.batch`. |
| Server-side licensing rigor | ✅ | No new external data source; no `kosher-zmanim` change. |

**Result**: PASS (no violations). Complexity Tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-location-events/
├── plan.md              # This file
├── spec.md              # Feature spec (as built)
├── data-model.md        # Schema deltas — event.stay_id + dropped stay fields; migration 0015
├── design/
│   └── decision.md      # The Option A/B/C brainstorm + the chosen Option B + terminology/numMen decisions
└── tasks.md             # Retroactive task list (all done)
```

### Source Code (repository root)

```text
packages/shared/src/schemas/
├── stay.ts              # DROP bringsSeferTorah + prayerNeeds from CreateStayInput/UpdateStayInput +
│                        #   OwnerStayDTO + toPublicStayDTO; KEEP numMen (relabeled as group size)
└── discovery.ts         # PotentialBucket drops seferTorahCount (men-overlap only); DiscoveryQuery
                         #   seferTorah filter kept (applies to minyan EVENTS, unaffected)

apps/backend/src/
├── db/schema.ts         # event.stayId (FK → stay, ON DELETE SET NULL) + event_stay_idx; stay drops
│                        #   brings_sefer_torah + prayer_needs; numMen kept
├── migrations/0015_location_events.sql   # the 4-statement migration
├── repositories/
│   ├── eventRepository.ts      # eventsForStay(stayId, userId): hosted ∪ joined UNION, deduped, sorted
│   └── discoveryRepository.ts  # PotentialStay/POTENTIAL_COLS drop brings_sefer_torah
├── services/
│   ├── eventService.ts         # getStayEvents (owner-gated); stamp event.stayId in hostMinyan +
│   │                           #   createGathering (createEvent create paths)
│   ├── discoveryService.ts     # bucketPotential drops seferTorahCount
│   └── stayService.ts          # toOwnerDTO/createStay/updateStay drop the two fields
├── controllers/eventController.ts   # stayEventsController (404 if not owner)
└── routes/stays.ts             # GET /api/stays/:id/events

apps/frontend/src/
├── features/stays/
│   ├── AddEditStayForm.tsx     # remove PrayerNeeds + Sefer-Torah card; render <StayEventsSection> for a saved stay
│   ├── StayEvents.tsx          # NEW — StayEventsSection ("האירועים שלי כאן" + "＋ הוסף אירוע") + StayEventsChip
│   ├── StayCard.tsx            # render <StayEventsChip> on an active card
│   └── PrayerNeeds.tsx         # DELETED (57 lines)
├── lib/
│   ├── stays.ts                # useStayEvents(stayId) — degrades to [] until the endpoint is live
│   └── events.ts               # invalidateEventViews — keeps ["stay-events"] reactive on create/cancel/RSVP/role
└── i18n/locales/{he,en}.ts     # stays.events.* namespace + relabeled stays.numMen
```

**Structure Decision**: Web two-app monorepo (Option 2). No new top-level directories. Purely additive on
the backend (one column, one route, one repo query) and a small removal + addition on the frontend (drop
the two minyan-shaped location controls, add the events section + card chip). All new logic slots into
the existing `stays`/`events` feature modules and shared contracts.

## The event↔location linkage design

- **Edge**: `event.stay_id` (nullable FK → `stay(id)`, `ON DELETE SET NULL`, `event_stay_idx`). An event
  belongs to at most one location or none; a location carries 0…N events.
- **Stamped at creation**: both `hostMinyan` (minyan path) and `createGathering` (gathering path) write
  `stayId: input.stayId ?? null`. The FE "＋ הוסף אירוע" passes `?fromStay=<id>` into the 014 kind
  picker, which threads it as `CreateEventInput.stayId`.
- **Two linkage edges coexist**: 013 already links a location to a **participant/host self-attendance**
  via `attendance.stay_id`; 015 adds the **event-level** `event.stay_id`. A minyan hosted from a location
  therefore has both edges (the event and the host's self-attend row point at the location) — the read
  deduplicates them (hosted precedence).
- **Read** (`eventsForStay`): two indexed queries run in parallel —
  1. hosted: `event WHERE host_user_id = :user AND stay_id = :stay` (left-joins minyan detail),
  2. joined: `attendance WHERE user_id = :user AND stay_id = :stay AND status IN (confirmed,pending,waitlisted)` → its event,
  merged into a `Map` keyed by event id (hosted wins on a clash), sorted earliest-first. Each row is
  built into a `MyEventRow` via the shared `toMyEventRow` (the same helper the 014 "My events" uses),
  with `pendingRequestCount` attached to hosted approval-mode rows.

## The discovery-potential simplification

`stay.brings_sefer_torah` was the *only* source of the per-Shabbat `PotentialBucket.seferTorahCount`.
Dropping the column removes that field: `bucketPotential` no longer accumulates a Sefer-Torah count and
`PotentialBucket` drops `seferTorahCount` — potential now reflects **men-overlap only**
(`menCount` + traveler contacts). The `DiscoveryQuery.seferTorah` **filter** is unchanged and still
valid: it filters minyan **events** (which carry their own Sefer-Torah state on the `minyan` detail),
not Stays. `PotentialStay`/`POTENTIAL_COLS`/`normalizeStay` in `discoveryRepository` drop the column too.

## The reactivity wiring

A location's events views are two TanStack queries keyed under `["stay-events", stayId]` (the list via
`useStayEvents`, and the card chip reusing the same key). To keep them live when an event changes,
`apps/frontend/src/lib/events.ts` centralizes a **`invalidateEventViews(qc, id?)`** helper that
invalidates: the event's own detail (`minyanKey(id)`), the global My-events list (`myEventsKey`), and
**`["stay-events"]`** (all locations). Every event mutation hook — host (minyan + gathering), update,
cancel, commit/RSVP, request/approve/decline, role claim — calls it in `onSuccess`/`onSettled`, so
adding, cancelling, or RSVP'ing an event updates the "האירועים שלי כאן" list **and** the "N אירועים"
chip without a manual refresh (FR-006/SC-006). The `useStayEvents` query degrades a not-yet-live endpoint
to an empty list (`.catch(() => [])`), so the UI shipped safely while the backend landed in parallel.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
