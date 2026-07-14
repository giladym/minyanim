# Phase 1 Data Model — A location holds events

Date: 2026-07-13 · Storage: Cloudflare D1 (SQLite) via Drizzle. Extends the 003/014 `event` model and
the 002 `stay` model; same id-prefix / ownership / cascade / index conventions. **Pre-launch: no real
data — migration 0015 drops two columns destructively (dev-no-real-data).** Documents the schema **as
built** (PRs #60/#61).

Core decision (Option B — see [design/decision.md](./design/decision.md)): a location (Stay / יעד) is a
clean anchor; event intent moves off the location onto real **events** linked by a new nullable
`event.stay_id` edge. Two minyan-shaped columns leave the location; one FK + index join the event.

---

## Entity: `event` (extended)

Existing columns unchanged (003/014). **New column** (migration 0015):

| Field | Type | Notes |
|-------|------|-------|
| stay_id | text, NULL, FK → `stay(id)` | **ON DELETE SET NULL** — the location↔event edge (015). The location this event was created from (`/event/new?fromStay=…`); `NULL` for a standalone event. Deleting the location keeps the event (unfiled). |

Indexes: **`event_stay_idx (stay_id)`** added — backs "a location's events" (`eventsForStay`). The
existing `event_status_type_date_idx`/`event_lat_lng_idx`/`event_host_idx` are unchanged. `stay_id` is
stamped at creation in both create paths (`hostMinyan`, `createGathering`) from
`CreateEventInput.stayId`; an event belongs to at most one location or none.

## Entity: `stay` (reduced)

**Dropped columns** (migration 0015):

| Field | Type (was) | Why removed |
|-------|-----------|-------------|
| brings_sefer_torah | integer (boolean) | Minyan-specific intent — moved onto minyan **events** attached to the location. Was the sole source of discovery `PotentialBucket.seferTorahCount` (now dropped). |
| prayer_needs | text (JSON `PrayerNeeds`) | Minyan-specific intent — a location no longer implies a single minyan; prayer services live on `minyan` detail rows of attached events. |

**Kept** (deliberately): `num_men` (`NOT NULL`) — retained as a generic **group size**
("מי מגיע — כמה אנשים בקבוצה, כולל אותך"), still feeding discovery potential (men-overlap). Everything
else on `stay` is unchanged (city/country, coords, `address_private`, dates, contact, `group_members`,
`notes`, `images`, `folder_id`, `status`, `hidden`).

## Entity: `attendance` (unchanged — the 013 edge)

`attendance.stay_id` (013, `ON DELETE SET NULL`) is untouched. It links a location to a
**participant/host self-attendance**. A minyan hosted from a location therefore has **two** edges: the
event row (`event.stay_id`) and the host's self-attend row (`attendance.stay_id`). The location-events
read deduplicates them (see below). This coexistence is intentional — 015's `event.stay_id` additionally
makes **hosted** events trackable to a location (013 had noted hosted minyanim were not tracked on the
event itself).

## Deriving a location's events

`GET /api/stays/:id/events` (owner-gated) returns the UNION of two indexed queries, deduped + sorted:

```
hosted  = event   WHERE host_user_id = :user AND stay_id = :stay         (left-join minyan detail)
joined  = attendance WHERE user_id = :user AND stay_id = :stay
                        AND status IN ('confirmed','pending','waitlisted') → its event
result  = dedupe(hosted ∪ joined) by event.id, HOSTED precedence, ORDER BY event_date ASC
```

- **Hosted precedence**: a minyan a user both hosts and self-attends from the same location appears once
  (the hosted row wins), marked `hosted:true` so the caller attaches the approval-mode
  `pendingRequestCount` badge.
- **Row shape**: each result is a **`MyEventRow`** (reused from 014 FR-017 — no new DTO): `id`, `type`,
  `category`, `title`, `city`, `country`, `eventDate`, derived `status` (per type — minyan quorum vs
  gathering capacity), `myStatus` (the viewer's attendance, `null` on a hosted gathering the host does
  not self-attend), and optional `pendingRequestCount`. Built via the shared `toMyEventRow` helper.
- **Owner gate**: the service first checks `getStayById(db, userId, stayId)`; a non-owned/missing
  location returns `null` → the controller throws `404`. A location's events list is private.

## DTO changes

- **`OwnerStayDTO`** (shared `stay.ts`): drops `bringsSeferTorah` + `prayerNeeds`; `numMen` kept.
  `toPublicStayDTO`/`PublicStayDTO` follow (they already omitted the private fields; the dropped keys are
  simply gone). `CreateStayInput`/`UpdateStayInput` drop the two fields (and their validation).
- **`PotentialBucket`** (shared `discovery.ts`): drops `seferTorahCount`; keeps `shabbat`, `menCount`,
  `travelers`. `DiscoveryQuery.seferTorah` (the filter) is **kept** — it filters minyan events, not
  Stays.
- **No new DTO** introduced by 015 — the location-events read reuses `MyEventRow`/`MyEventsDTO`.

## Cascade & integrity

- **`event.stay_id` is `ON DELETE SET NULL`** — deleting a location NULLs the edge on its events; the
  events survive as standalone. The event-cascade test asserts this (no event loss on stay delete).
- Deleting an event still cascades its `gathering`/`minyan` detail + `attendance` + roles (003/014
  chain, unchanged).
- No FK now references the dropped `stay.brings_sefer_torah`/`prayer_needs` (they were plain columns).

## Migration 0015 (`0015_location_events.sql`)

The complete migration is four statements:

```sql
ALTER TABLE `event` ADD `stay_id` text REFERENCES stay(id);
CREATE INDEX `event_stay_idx` ON `event` (`stay_id`);
ALTER TABLE `stay` DROP COLUMN `brings_sefer_torah`;
ALTER TABLE `stay` DROP COLUMN `prayer_needs`;
```

Notes:
- `stay_id` is added nullable (SQLite `ADD COLUMN` with an FK reference; no DEFAULT needed since it is
  nullable). `ON DELETE SET NULL` is declared in the Drizzle schema `references(..., { onDelete: "set null" })`.
- The two `DROP COLUMN`s are destructive; acceptable pre-launch (dev-no-real-data). Applied **local +
  remote** (`pnpm db:migrate:remote` — CI does not auto-migrate). `apps/backend/test/apply-migrations.ts`
  picks it up via the `_journal.json` entry `0015_location_events`.
