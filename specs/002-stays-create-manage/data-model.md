# Phase 1 Data Model — Stays: Create & Manage

Date: 2026-06-19 · Storage: Cloudflare D1 (SQLite) via Drizzle ORM. Extends
[001 data-model](../001-platform-foundation/data-model.md); same ownership/cascade/index
conventions.

---

## Entity: `stay`

A user's presence at a place over a date range. Owned by a user; cascade-deleted with the user.

| Field | Type | Notes |
|-------|------|-------|
| id | text (PK) | app-generated, prefixed `stay_…` (matches 001 id style) |
| user_id | text, FK → `user(id)` | **ON DELETE CASCADE**; indexed |
| city | text, NOT NULL | from geocoding or manual entry |
| country | text, NOT NULL | from geocoding or manual entry |
| lat | real, NULL | resolved coordinates (null if manual entry / geocode failed) |
| lng | real, NULL | resolved coordinates |
| address_private | text, NULL | **private** — never in `PublicStayDTO` (D8) |
| arrival_date | integer, NOT NULL | date-only, epoch-ms @ UTC midnight of civil date (D4) |
| departure_date | integer, NOT NULL | date-only, epoch-ms @ UTC midnight of civil date |
| num_men | integer, NOT NULL | party size incl. the user; ≥ 1 |
| brings_sefer_torah | integer (bool) | default 0 |
| prayer_needs | text (JSON) | typed by `PrayerNeedsSchema` (D6); Shabbat implicit/always-on |
| status | text, NOT NULL | `'active'` \| `'cancelled'`; default `'active'` (D5; "past" derived) |
| contact_name | text, NULL | snapshot from profile (D12); editable |
| contact_phone | text, NULL | **private** (OwnerStayDTO only) |
| contact_email | text, NULL | **private** (OwnerStayDTO only) |
| group_members | text, NULL | free text (per spec) |
| notes | text, NULL | free text |
| folder_id | text, NULL | **no FK in 002**; FK (`ON DELETE SET NULL`) added in 004 (D9) |
| created_at | integer (ts) | epoch-ms |
| updated_at | integer (ts) | epoch-ms |

### Validation

- **Structural (shared Zod, `packages/shared`)** — TZ-free, enforced on FE + BE:
  - `city`, `country` non-empty; `num_men` integer ≥ 1; `arrival_date`/`departure_date`
    well-formed date-only epochs; `departure_date >= arrival_date`.
  - `prayer_needs` matches `PrayerNeedsSchema`; `status` matches the Zod enum.
  - `address_private`, `notes`, `group_members`, contact fields: length-bounded, optional.
- **Temporal (service layer, server-side)** — needs the destination timezone (D3):
  - `arrival_date` not before the **destination-local** today (IANA tz from `lat`/`lng` via
    `tz-lookup`); manual-entry/no-coords fallback = client date ±1 day.
  - Same rule re-applied on **edit**; an in-progress Stay (arrival past, departure future) may
    edit departure/details but no date may move into the past.
- Error codes (keyed, frontend localizes): `location.required`, `date.in_past`,
  `date.range_invalid`, `num_men.too_low` (+ generic field codes from 001).

### Derived (not stored)

- **`isPast`** = `departure_date < destination-local now` (D5) — computed at read for dashboard
  display ordering/styling.
- **`coversShabbat`** = `[arrival, departure]` overlaps a Friday/Saturday in the destination tz
  (D7) — computed to suggest the Shabbat prayer-needs default in the form (not persisted).

## Relationships

```
user 1───* stay        (ON DELETE CASCADE — deleting a user removes all their stays)
stay *───? folder       (folder_id; FK + ON DELETE SET NULL added in Feature 004)
```

Consistent with 001: every owned table cascades from `user`, so account deletion removes 100% of
owned data (FR-008/SC-007). The cascade MUST be verified by an integration test (below).

## Indexes

- `stay.user_id` (FK lookups + cascade).
- Composite **`(user_id, arrival_date)`** — serves the nearest-first dashboard query directly
  (`WHERE user_id = ? AND status = 'active' ORDER BY arrival_date ASC`).

## Lifecycle / state

- **Create**: validate (structural + temporal) → insert `status='active'`, `created_at`/
  `updated_at = now`. Contact snapshotted from profile.
- **Edit**: partial update (re-validate temporal rule) → bump `updated_at`.
- **Cancel** (soft): `status='active' → 'cancelled'` behind explicit confirmation; row retained,
  drops off the active dashboard. No user-facing hard delete in v1.
- **Account deletion (001)**: `ON DELETE CASCADE` removes all `stay` rows. If any multi-row write
  must be atomic, use `db.batch` (no interactive transactions on D1).

## Notes

- DTO boundary (D8): repository/service read all columns; the **controller** selects
  `OwnerStayDTO` (002 always — owner-only) vs `PublicStayDTO` (003). Private columns
  (`address_private`, `contact_phone`, `contact_email`) are structurally absent from
  `PublicStayDTO`.
- `prayer_needs` stored as JSON text via Drizzle `mode:'json'`, parsed/validated by the shared
  Zod schema on read/write — the SSOT, not ad-hoc parsing.
- **Cascade-orphan integration test** (vitest-pool-workers): create user + stays → `deleteUser`
  → assert zero orphan `stay` rows (extends the 001 test; do NOT assume D1 cascade).
