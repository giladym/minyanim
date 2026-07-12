# Phase 1 Data Model — Multi-type events (hosting, gatherings, occasions)

Date: 2026-07-12 · Storage: Cloudflare D1 (SQLite) via Drizzle. Extends
[003 data-model](../003-discovery-quorum/data-model.md); same id-prefix / ownership / cascade / index
conventions. **Pre-launch: no real data — migration 0014 may rename/recreate (dev-no-real-data).**

Core decision (research R1, revised): an event has a **behavior** (`type`: `minyan` quorum |
`gathering` capacity+RSVP) and, for gatherings, an extensible **category** (`hosting`/`social`/…). Two
detail tables: the shipped `minyan` (unchanged) + one `gathering` (category-specific `attrs` JSON).
Attendance uses **R2 Option A (unified `attendance` table)** — the design the validation loop selected
(see [validation-report.md](./validation-report.md)).

---

## Entity: `event` (extended)

Existing columns unchanged (003). **New columns** (migration 0014):

| Field | Type | Notes |
|-------|------|-------|
| type | text, NOT NULL | **behavior class** (R1) — `'minyan'` (quorum) \| `'gathering'` (capacity+RSVP). Was minyan-only |
| category | text, NULL | **user-facing kind** for gatherings (R1) — `'hosting' \| 'social'` (v1) + `'learning' \| 'celebration'` (fast-follow). `NULL` for a minyan. Extensible enum now, admin-managed later |
| occasion | text, NULL | `OccasionSchema`; `null`/`'none'` = no occasion (R5). Cross-cutting discovery filter, orthogonal to type+category |
| rsvp_mode | text, NOT NULL | `'open' \| 'approval' \| 'invite'`; default by category (hosting→approval, else open) (R3/FR-004) |
| visibility | text, NOT NULL | `'public' \| 'unlisted' \| 'invite'`; default `'public'` (R3/FR-005) |
| capacity | integer, NULL | **guest** seats (host not counted, R12); `null` = unlimited. Measured as confirmed party-size SUM (R4/FR-006). Independent of quorum |
| start_time | text, NULL | optional `'HH:MM'` wall-clock start (reuses the minyan `services[].time` convention); `event_date` stays date-only (FR-002) |
| end_time | text, NULL | optional `'HH:MM'` wall-clock end (FR-002) |
| rsvp_cutoff | integer (ts), NULL | optional close time for new requests/joins; also closed once `event_date` passes (R11/FR-016) |

Indexes: existing `event_status_type_date_idx` `(status, type, event_date)` already serves
type-filtered discovery. Add `event_occasion_idx` `(occasion)` only if occasion filtering proves hot
(defer; the bbox subset is small). `status` stays stored `'forming' \| 'cancelled'`; "ready/full" is
**derived** per behavior (R1) — a `gathering` is "full" when the confirmed party-size sum ≥ `capacity`.

## Entity: `gathering` (1:1 detail, `type='gathering'`)

One detail table for **all** gathering categories (hosting, social, learning, celebration). Category
lives on `event.category` (for discovery filtering); the category-specific fields live in a validated
`attrs` JSON — this is the extension seam (a new category = a new attrs variant, no new table).

| Field | Type | Notes |
|-------|------|-------|
| event_id | text (PK, FK → `event(id)`) | **ON DELETE CASCADE** |
| attrs | text (JSON) | category-specific fields, `$type<GatheringAttrs>()`, validated per category on write (and read) |

**Validation mechanics**: the wire `gathering` block has no `category` key (`category` stays top-level
on the event), so a literal `z.discriminatedUnion` cannot discriminate. The mechanism is a
**per-category schema map** — `ATTRS_BY_CATEGORY[category].parse(body.gathering)`; `GatheringAttrs` is
the union type of the map's variants. Unknown category → `400 category.invalid`; attrs mismatch →
`400 gathering.attrs_invalid`. The per-category variants:
- **hosting** (the seudah-hosting flow, FR-009): `{ mealType: 'shabbat_dinner'|'shabbat_lunch'|'seudah_shlishit'|'holiday_meal'|'weekday', kashrut, dietary: string[], offering?, bringItems?, alcohol: boolean, accessibility? }` — "meal" here = the food/seudah served, not the event type.
- **social** (party/kiddush/meetup, FR-010): `{ subcategory: 'party'|'kiddush'|'farbrengen'|'meetup'|'other' }`.
- **learning** (fast-follow): `{ topic: string, teacher?: string }`.
- **celebration** (fast-follow): `{ simchaType: string }`.

**Guest seats live on `event.capacity`** (the generic capacity axis, R4/R12 — the host is the
organizer, not a counted seat), not in `attrs`. Minyan does NOT use this table.

## Entity: `minyan` (1:1 detail — unchanged, `type='minyan'`)

Exactly as 003 (`nusach`, `sefer_torah`, `services`). No change; it is now one of two detail tables.

## Entity: `attendance` (R2 Option A — generalizes `commitment`)

A person's relationship to an event, for every type. Replaces `commitment` (migration 0014 renames the
table + `num_men`→`party_size` and backfills `status='confirmed'`).

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `att_…` |
| event_id | text, FK → `event(id)` | **ON DELETE CASCADE**; indexed |
| user_id | text, FK → `user(id)` | **ON DELETE CASCADE** |
| party_size | integer, NOT NULL | 1 ≤ n ≤ PARTY_SIZE_MAX; a minyan reads it as **men** (FR-003) |
| status | text, NOT NULL | `'pending' \| 'confirmed' \| 'waitlisted' \| 'declined' \| 'cancelled'`. Minyan self-commit/join → `confirmed`; open-mode join → `confirmed` (or `waitlisted` at capacity); approval-mode request → `pending` |
| stay_id | text, FK → `stay(id)` NULL | **ON DELETE SET NULL**; optional Stay link (013 reconciliation) — unchanged |
| requested_at | integer (ts), NOT NULL | orders the waitlist (earliest-first, R4) |
| created_at / updated_at | integer (ts) | |

- **`UNIQUE(event_id, user_id)`** — one attendance per user per event (unchanged from `commitment`);
  the atomic guard against double-join and concurrent capacity races (R4/003 R6).
- Indexes: `attendance_event_idx (event_id)`, `attendance_user_idx (user_id)`, and
  `attendance_event_status_req_idx (event_id, status, requested_at)` for confirmed-count + earliest
  waitlisted promotion.
- **Minyan read compatibility**: every minyan query that summed `commitment.num_men` now sums
  `attendance.party_size WHERE status='confirmed'`; roster/participants filter `status='confirmed'`.
  This is the single audited change surface for SC-005.

## Entity: `event_role` (unchanged)

Minyan-only role slots (`ba'al tefila`/`ba'al korei`), unique `(event_id, role)`. Gatherings do not
use roles in v1.

## Entity: `notification` (extended)

No column change. New `kind` values (R8): `seat_requested`, `request_approved`, `request_declined`,
`waitlist_promoted`. Existing `cancelled`/`host_changed` reused. The idempotency ledger
(`notification_event_log`) is used only for threshold-crossing kinds (quorum); per-requester
request/approve notifications are 1:1 and bypass it.

## Occasion (value object, not a table)

`OccasionSchema = z.enum(['shabbat','rosh_hashanah','yom_kippur','sukkot','pesach','shavuot',
'chanukah','purim','none'])` in `packages/shared`. Stored as `event.occasion` text; `'none'`/`null`
both mean "no occasion". Used only as a discovery filter + a display badge.

## DTO tiers (generalized, per type + category)

Reuse the 003 ladder shape, renamed to the generic event and parameterized by `type`:

- **PublicEventDTO** (discovery/share/pre-auth): `id`, `type`, `occasion`, `title`, `city`, `country`,
  **fuzzed** lat/lng, `hostPublic`, `rsvpMode`, `visibility`, capacity + **seatsRemaining** (derived),
  category-specific public detail (hosting: mealType/kashrut/dietary/offering/bring; social: subcategory;
  minyan: nusach/sefer/services + derived quorum/status). **No** exact address / entry notes / contact.
- **RosterEventDTO extends PublicEventDTO**: `hostContact` (phone if host shares), `attendees`
  (name/profile + phone if that user shares), `myStatus`/`myRoles`. Shown to any signed-in viewer.
  **Hosting-category exception**: for `category='hosting'` events the non-confirmed viewer's
  `RosterEventDTO` omits the named `attendees` and carries an **aggregate confirmed count**
  ("4 אורחים אושרו") instead — the confirmed guest list (names/phones) is visible to confirmed
  attendees + host only (a deliberate revision of ADR-0008's roster openness FOR HOSTING ONLY;
  minyan + social keep today's roster behavior). Host contact stays visible pre-request; pending
  names remain host-only via `/requests`.
- **ParticipantEventDTO extends RosterEventDTO**: exact `lat/lng` + `addressPrivate` + `addressNotes` +
  contact **email** — **only when the viewer's attendance is `confirmed`** (or host) (R6/SC-003).
- **OwnerEventDTO extends ParticipantEventDTO**: `isHost:true` + host-only management fields (pending
  request list for approval-mode).

Structural strip: `toPublicEventDTO(m)` omits the private keys entirely (fields absent, not nulled) —
the zero-leak invariant for every type (SC-003). This is the existing `toPublicMinyanDTO` generalized.

## State & transitions

**Event.status (stored)**: `forming → cancelled` (host cancels). "ready" (minyan) / "full" (gathering
capacity reached) / "completed" (date passed) are **derived**, never stored — per-behavior strategy (R1).

**Attendance.status transitions** — promotion target depends on `rsvp_mode` (R4/loop):
```
APPROVAL mode (e.g. a hosting gathering): pending is the ordered queue; nothing auto-confirms.
   (none) ── request                         ▶ pending
   pending ── host approve (party fits)      ▶ confirmed
   pending ── host approve (does NOT fit)    ▶ (fails: capacity.full; stays pending)
   pending ── host decline                   ▶ declined
   confirmed ── cancel                        ▶ cancelled  (seat frees → host NOTIFIED, may approve a pending; NO auto-confirm)

OPEN mode (gathering, minyan):
   (none) ── join (fits)                     ▶ confirmed
   (none) ── join (does NOT fit)             ▶ waitlisted
   waitlisted ── seat frees & party fits     ▶ confirmed  (auto-promote earliest that FITS, notify)
   confirmed ── cancel                        ▶ cancelled  (+ trigger the promote above)
   waitlisted/pending ── cancel               ▶ cancelled

Re-join after cancel/decline UPDATEs the same (event_id,user_id) row (soft, R14) — not a new INSERT.
Party-size increase on a confirmed row: allowed only if it fits, else rejected — never demotes.
```
Every `→confirmed` transition is guarded by the atomic single-statement capacity check (R4); over-book
is impossible (SC-006). Approval-mode never auto-confirms (would bypass host approval → address leak).
A minyan never has `capacity` and is open mode with `hostSelfAttends`, so its attendances are always
`confirmed` and the graph collapses to today's commit/withdraw (SC-005 — no behavior change).

## Cascade & integrity

- `gathering`/`attendance` cascade from `event` (and `attendance`/roles from `user`) — the
  cascade-orphan test is extended to the new detail table + renamed attendance table.
- Deleting a host user cascades the event → its detail row → its attendances/roles/notifications (the
  003 chain, verified extended).
- `flag.contentType='event'` covers all types (polymorphic, unchanged) — no `content_id` FK, guarded by
  `contentExists`.

## Migration 0014 (summary; final SQL in implementation)

1. `ALTER TABLE event ADD COLUMN category / occasion / rsvp_mode / visibility / capacity / start_time /
   end_time / rsvp_cutoff` (and widen `type` to `minyan|gathering`). DDL note: SQLite
   `ALTER TABLE ADD COLUMN … NOT NULL` requires a DEFAULT — give `rsvp_mode` DDL default `'open'` and
   `visibility` DDL default `'public'` (which makes the minyan backfill in step 4 automatic).
2. `CREATE TABLE gathering (event_id PK, attrs JSON)`. (Minyan detail table already exists; no `meal`
   table — hosting is a gathering category.)
3. **Option A (chosen)**: rename `commitment` → `attendance`, `num_men` → `party_size`, add `status`
   (default `'confirmed'`, backfilling every existing commitment) + `requested_at` (NOT NULL —
   backfills from `created_at`; moot under drop+recreate); recreate indexes +
   the `(event_id,user_id)` unique index + `attendance_event_status_req_idx`. FK-safe: nothing
   references `commitment.id` (leaf). Pre-launch: a drop+recreate is acceptable (dev-no-real-data).
4. Backfill existing minyan events: `rsvp_mode='open'`, `visibility='public'`, `capacity=NULL`,
   `occasion=NULL`, times/`rsvp_cutoff`=NULL.
5. Rename the shipped `commitment*` repo/service symbols is NOT required — keep the `/commit` route as a
   thin alias (R13); internally it writes `attendance` with `status='confirmed'`.
