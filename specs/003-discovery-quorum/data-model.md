# Phase 1 Data Model — Discovery & Quorum Formation

Date: 2026-06-20 · Storage: Cloudflare D1 (SQLite) via Drizzle ORM. Extends
[002 data-model](../002-stays-create-manage/data-model.md); same id-prefix / ownership / cascade /
index conventions. **Pre-launch: no real data — migrations may drop/recreate (D-no-data).**

Core modeling decision (D21/R1): a Minyan is a **generic `event` (`type='minyan'`) + a 1:1
`minyan` detail**. Commitments, roles, and notifications reference the generic `event`.

---

## Entity: `event`

A hosted gathering at a precise point. Owned by its host; cascade-deleted with the host user.

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | app-generated, prefixed `evt_…` |
| type | text, NOT NULL | discriminator; `'minyan'` (only value in v1) |
| host_user_id | text, FK → `user(id)` | **ON DELETE CASCADE**; indexed |
| city | text, NOT NULL | public location |
| country | text, NOT NULL | public location |
| lat | real, NOT NULL | precise point (hosted events always have coords) |
| lng | real, NOT NULL | precise point |
| address_private | text, NULL | **private** — only in Participant/Owner DTOs (D4/R10) |
| event_date | integer, NOT NULL | date-only, epoch-ms @ UTC midnight of civil date — the Shabbat/day (002 convention) |
| notes | text, NULL | free-text host notes (D3) |
| status | text, NOT NULL | `'forming'` \| `'cancelled'`; default `'forming'` (quorum/ready/completed derived, R4) |
| hidden | integer (bool) | default 0; moderation seam — excluded from discovery (D19). 006 owns the threshold |
| created_at / updated_at | integer (ts) | epoch-ms |

## Entity: `minyan` (1:1 detail, `type='minyan'`)

| Field | Type | Notes |
|-------|------|-------|
| event_id | text (PK, FK → `event(id)`) | **ON DELETE CASCADE** |
| nusach | text, NOT NULL | `'ashkenaz'` \| `'sefard'` \| `'chabad'` \| `'mizrachi'` \| `'any'` (D16) |
| sefer_torah | integer (bool) | host-declared availability; default 0 |
| services | text (JSON) | `[{ tefilla: 'shacharit'\|'mincha'\|'maariv', time?: 'HH:MM'\|null }]` (≥1); typed by `MinyanServiceSchema`, the 002 `prayer_needs` pattern (D3) |

## Entity: `commitment`

A user joining an event with a party size. Independent of any Stay (D3).

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `cmt_…` |
| event_id | text, FK → `event(id)` | **ON DELETE CASCADE**; indexed |
| user_id | text, FK → `user(id)` | **ON DELETE CASCADE** |
| num_men | integer, NOT NULL | 1 ≤ n ≤ 50 (D15); shared-Zod enforced |
| stay_id | text, FK → `stay(id)` NULL | **ON DELETE SET NULL**; optional link for reconciliation (D12) |
| created_at / updated_at | integer (ts) | |

**`UNIQUE(event_id, user_id)`** — one commitment per user per event; the atomic guard against
double-commit and concurrent quorum-crossing races (R6). Host self-commit is a row created with
the event in one `db.batch` (D11/R6).

## Entity: `event_role`

A claimed prayer role on an event (R5).

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `rol_…` |
| event_id | text, FK → `event(id)` | **ON DELETE CASCADE**; indexed |
| role | text, NOT NULL | `'baal_tefila'` \| `'baal_korei'` |
| user_id | text, FK → `user(id)` | **ON DELETE CASCADE** |
| created_at | integer (ts) | |

**`UNIQUE(event_id, role)`** — at most one holder per role; claim = insert-on-conflict (no row ⇒
`role.already_claimed`); release = delete. A user may hold both roles (two rows).

## Entity: `notification`

Per-recipient in-app inbox record (+ a parallel email send, R8).

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `ntf_…` |
| recipient_user_id | text, FK → `user(id)` | **ON DELETE CASCADE**; indexed |
| event_id | text, FK → `event(id)` | **ON DELETE CASCADE** |
| kind | text, NOT NULL | `'quorum_reached'` \| `'near_quorum'` \| `'quorum_lost'` \| `'cancelled'` |
| read | integer (bool) | default 0 |
| created_at | integer (ts) | |

## Entity: `notification_event_log` (idempotency ledger, R8)

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `nel_…` |
| event_id | text, FK → `event(id)` | **ON DELETE CASCADE** |
| kind | text, NOT NULL | crossing kind |
| threshold | integer, NULL | e.g. 10 (quorum), 8 (near) |
| created_at | integer (ts) | |

**`UNIQUE(event_id, kind, threshold)`** — fan-out fires only when a new row inserts; a downward
crossing (R9) deletes the matching row so a genuine re-cross can re-fire.

## Entity: `flag` (affordance only; thresholds owned by 006 — D19)

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `flg_…` |
| event_id | text, FK → `event(id)` | **ON DELETE CASCADE** |
| user_id | text, FK → `user(id)` | **ON DELETE CASCADE**; `UNIQUE(event_id, user_id)` (one flag per user) |
| created_at | integer (ts) | |

## Entity: `beit_chabad_pin` (static, admin-curated; not user-owned — D18)

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | prefixed `bcp_…` |
| name / address / phone | text | informational |
| city / country | text | |
| lat / lng | real, NOT NULL | rendered as a static map layer |
| created_at / updated_at | integer (ts) | |

---

## Relationships & cascades

```
user 1───* event            (host_user_id; ON DELETE CASCADE)
event 1───1 minyan          (event_id;     ON DELETE CASCADE)   [type='minyan']
event 1───* commitment      (event_id;     ON DELETE CASCADE)
user  1───* commitment      (user_id;      ON DELETE CASCADE)
stay  1───? commitment      (stay_id;      ON DELETE SET NULL)  [optional link, D12]
event 1───* event_role      (event_id;     ON DELETE CASCADE)
user  1───* event_role      (user_id;      ON DELETE CASCADE)
user  1───* notification    (recipient;    ON DELETE CASCADE)
event 1───* notification    (event_id;     ON DELETE CASCADE)
event 1───* notification_event_log / flag   (ON DELETE CASCADE)
beit_chabad_pin             (standalone, no user FK)
```

Deleting a user removes their hosted events (and, by cascade, those events' minyan/commitments/
roles/notifications), their own commitments, role claims, and notifications — 100% of owned data
(constitution; cascade-orphan test below). **Beit Chabad pins are not user-owned** and survive.

## Indexes

- `event.host_user_id` (ownership/cascade); `event(status, type, event_date)` (discovery: active
  hosted minyanim by date); **`event(lat, lng)`** (bounding-box discovery scan).
- **`stay(lat, lng)`** — NEW on the existing 002 table (the D15 geospatial seam) for potential
  aggregation (R2).
- `commitment.event_id`, `commitment(event_id, user_id)` UNIQUE; `commitment.user_id` (a user's
  commitments + the FR-019/D14 conflict check).
- `event_role(event_id, role)` UNIQUE; `notification.recipient_user_id`;
  `notification_event_log(event_id, kind, threshold)` UNIQUE; `flag(event_id, user_id)` UNIQUE.

## Derived (not stored) — `eventService`, R4

- **committedMen** = `SUM(commitment.num_men)` for the event — computed in a **single grouped
  query** across the discovery result set (R15), never per-event.
- **isShabbatShacharit** = `services.some(s => s.tefilla==='shacharit') AND isSaturday(event_date)`.
  Uses the **UTC-midnight convention** (event_date is UTC-midnight of its civil date, so
  `getUTCDay()===6` IS the civil weekday — no `tzFromCoords`, matching how 002's `coversShabbat`
  actually works). The `isSaturday(epoch)` helper, **not** `coversShabbat`.
- **baalKoreiClaimed** = an `event_role` row exists with `role='baal_korei'`. **Ba'al Tefila is
  display-only — it never gates `ready`.**
- **isPast** (→ `completed`) = `civilDate(event_date,"UTC") < todayCivil(tzFromCoords(lat,lng))`
  (reuse 002's tz-based past check; coords mandatory on events).
- **status**: `cancelled` (stored) → else `completed` if isPast → else `ready` if
  `committedMen≥10 AND (NOT isShabbatShacharit OR (sefer_torah AND baalKoreiClaimed))` → else
  `quorum-reached` if `committedMen≥10` → else `forming`.
- **missingForReady** = `{ menShort: max(0,10-committedMen), seferTorah: bool, baalKorei: bool }`
  for FR-006 display.

### SC-004 readiness decision table (the test oracle)

`isShabbatShacharit` is the only case where Torah + Korei matter. 24 cells = men{<10, =10, >10} ×
torah{0,1} × korei{0,1} × shabbatShacharit{no,yes}:

| committedMen | shabbatShacharit | seferTorah | baalKorei | status |
|---|---|---|---|---|
| <10 | any | any | any | **forming** |
| ≥10 | no | any | any | **ready** (non-Torah service: quorum ⇒ ready) |
| ≥10 | yes | 1 | 1 | **ready** |
| ≥10 | yes | 1 | 0 | **quorum-reached** (missing Ba'al Korei) |
| ≥10 | yes | 0 | 1 | **quorum-reached** (missing Sefer Torah) |
| ≥10 | yes | 0 | 0 | **quorum-reached** (missing both) |
| (event_date past, dest-tz) | — | — | — | **completed** (overrides the above) |
| (status='cancelled') | — | — | — | **cancelled** (stored; overrides all) |

Tests enumerate all men∈{9,10,11} × torah∈{0,1} × korei∈{0,1} × shabbatShacharit∈{no,yes}.

## DTO boundary (D4 / R10) — three Minyan shapes in `packages/shared`

- **PublicMinyanDTO** — `id, type, city, country, lat, lng, event_date, event_time, tefilla,
  nusach, sefer_torah, committedMen, status, host display name`. **No `address_private`, no host/
  participant contact, no participant list.** Used for discovery, the WhatsApp share, and the
  pre-auth join page.
- **ParticipantMinyanDTO** — Public + `address_private`, host contact (phone/email), and the
  participant list (names + phone/email). Returned only to a committed participant (membership
  checked via `commitment`).
- **OwnerMinyanDTO** — the host's full view (Participant + host-only management fields).

Private columns are **structurally absent** from `PublicMinyanDTO` (SC-005), proven by a DTO
non-exposure test (mirrors 002 T030).

## Conventions & queries

- **Column modes** (match 002): `event_date` is Drizzle `integer(..., {mode:"timestamp"})` (epoch-ms
  @ UTC midnight of the civil date; reuses 002's `toUtcMidnight`); `event_time` is `text`, validated
  by shared Zod `/^([01]\d|2[0-3]):[0-5]\d$/`. `hostNumMen` (host self-commit) obeys the same
  `1..50` rule as a commitment's `num_men`. `addressPrivate` is optional (the precise `lat/lng` is
  the location; the address is the human-readable detail revealed on commit).
- **Potential query (R2/R15)**: `(bbox-matched active coord Stays) UNION (active coordless Stays
  whose normalized city+country = the query's)`, deduped by stay id; then `shabbatSaturdaysInRange`
  buckets each Stay's range and `SUM(num_men)` per Saturday bucket.
- **Hosted-minyanim query**: `event WHERE type='minyan' AND status='forming' AND hidden=0 AND
  lat/lng IN bbox AND event_date IN [from,to]`, with committed counts from a **single grouped**
  `SELECT event_id, SUM(num_men) … GROUP BY event_id` (R15) and a batched `event_role` read for
  readiness. `completed` is excluded **in-service** (derived, not a stored status) on the small
  bounded set — the `event(status,type,event_date)` index narrows the SQL part only.
- **Shared enums (SSOT, R13)**: `eventType(minyan)`, `tefilla(shacharit|mincha|maariv)`,
  `nusach(ashkenaz|sefard|chabad|mizrachi|any)`, `role(baal_tefila|baal_korei)`,
  `notificationKind(quorum_reached|near_quorum|quorum_lost|cancelled)`.

## Lifecycle / state

- **Host** (D11): validate (structural Zod + temporal — `event_date` not past in dest-tz, reuse
  002's check) → `db.batch`([insert `event` `forming`, insert `minyan`, insert host self
  `commitment`]) → return OwnerMinyanDTO.
- **Commit/withdraw/change** (R6/R9): insert/update/delete `commitment` (UNIQUE guards) → recompute
  derived status → `waitUntil` crossing fan-out (R8). Withdraw also releases held roles.
- **Claim/release role** (R5): insert-on-conflict / delete `event_role` → recompute readiness.
- **Edit** (`PATCH /api/events/:id`, host-only, R9): mutable `{ seferTorah?, eventTime?,
  addressPrivate?, nusach? }`; **date + tefilla immutable in v1**. Toggling `seferTorah→false`
  recomputes readiness and may fire `quorum_lost`.
- **Cancel** (D11): `status='forming'→'cancelled'` + `db.batch` void commitments/roles → fan out
  `cancelled` → drops from active discovery. Cancelling an already-cancelled event is **idempotent**.
- **Completed** (R4): derived when `event_date` past (dest-tz); not a stored transition.
- **Stay reconciliation (D12/R9, cross-feature)**: 002's `stayService.cancelStay`/`updateStay` call
  `commitmentService.reconcileCommitmentsForStay(ctx, stayId)` after their write — auto-withdraws
  commitments whose linked Stay no longer covers the event date (coordinate moves do not trigger
  withdrawal in v1), notifies, recomputes. **`stayService.ts` is therefore a file modified by 003.**
- **Account deletion (001)**: `ON DELETE CASCADE` removes all owned rows; verify by test (no D1
  cascade assumption).

## Tests (data-model-critical)

- **Cascade-orphan** (extends 002 T029): create user + event + minyan + commitments + roles +
  notifications → `deleteUser` → assert zero orphans across **all** new tables.
- **Readiness decision-table** (SC-004): enumerate the R4 table; assert derived status for each row.
- **Concurrency**: parallel duplicate commit → exactly one row (`commitment.duplicate`); parallel
  role claim → exactly one holder (`role.already_claimed`).
- **Notification idempotency**: oscillate count around 10 → `quorum_reached` fires exactly once per
  genuine crossing.
- **Privacy non-exposure**: `PublicMinyanDTO` output has no `address_private`/contact keys.
