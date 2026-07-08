# Phase 1 Data Model — Seed Import + Seed-User Claim / Merge

Date: 2026-07-08 (retroactive) · Storage: Cloudflare D1 (SQLite) via Drizzle. **No new table.** One
column added to `user`; a claim reassigns FKs and deletes rows. Import artifacts are on-disk JSON
(dev-only), not database entities.

---

## Change to `user` (the 001 table, D1) — migration 0009

`user` gains one field:

```
kind: text("kind").notNull().default("real")   // 'real' | 'seed'
```

- `'real'` — a normal authenticated user (default; every pre-009 row is `'real'`).
- `'seed'` — an imported placeholder: a full `user` row with a synthetic `@seed.local` email and
  **no matching `account` row**, so better-auth can never authenticate it. Owns stays/events and
  appears in discovery; **claimed and deleted** when a real user whose profile phone matches signs
  up (F4).

Migration **`apps/backend/migrations/0009_abnormal_goblin_queen.sql`**:

```sql
ALTER TABLE `user` ADD `kind` text DEFAULT 'real' NOT NULL;
```

A single `ALTER` (not a PRAGMA-wrapped rebuild) — safe even though `user` has many FK children,
because a plain `ADD COLUMN` with a constant default does not touch them. Existing rows adopt
`'real'`.

> **Not** registered in better-auth `additionalFields`: `kind` is set only by the importer/DB, never
> by a client profile update, so it does not need to round-trip through the profile path (unlike
> `language`/`theme`/`havdalahOpinion`/`sharePhone`).

## Seed-user semantics (D1)

| Property | Seed (`kind='seed'`) | Real (`kind='real'`) |
|----------|----------------------|----------------------|
| `account` row | none — cannot sign in | present (Google / email+password) |
| email | synthetic `<id>@seed.local` | real, verified |
| owns `stay` / `event` | yes (via FK) | yes |
| appears in discovery | yes (name; **phone withheld**, D4) | yes (phone if `share_phone`) |
| lifecycle | deleted on claim | permanent |

## The reassignment set (D5) — what a claim moves

On `claimSeeds(db, callerId, verifiedSeedIds)`, ownership of these rows moves from each verified seed
to the caller, then the seed rows are deleted:

| Table | Column reassigned | Notes |
|-------|-------------------|-------|
| `stay` | `stay.userId` → caller | also bumps `updatedAt` |
| `event` | `event.hostUserId` → caller | also bumps `updatedAt` |
| `commitment` | `commitment.userId` → caller | conflict-safe: a duplicate on an `(event_id, caller)` the caller already holds is **deleted first** (unique index) |
| `eventRole` | `eventRole.userId` → caller | |

Then `DELETE FROM user WHERE id IN (verified)` — the seed's `phone_number` rows (and any other
child) **cascade** away via the existing `ON DELETE CASCADE`. No orphan remains.

**Server re-verification (D3/FR-004)**: before any of the above, `claimSeeds` re-joins
`user(kind='seed')` ⨝ `phone_number` against the caller's *current* profile phones and keeps only the
`verified` subset — the submitted ids are never trusted. A forged/non-matching id contributes nothing
(`claimed:0`).

## Derived (not stored) — the claim offer

### `ClaimableSeed` (repository) / `ClaimableSeedDTO` (shared)

| Field | Type | Notes |
|-------|------|-------|
| seedUserId | string | the seed `user.id` |
| name | string | the seed's display name (shown in the offer) |
| phone | string (E.164) | the matched phone — same number on the caller's profile |
| stays | number | `count(*)` of `stay.userId = seed` |
| events | number | `count(*)` of `event.hostUserId = seed` |

One entry per seed (a seed matching on more than one phone is de-duped). Computed at read time from
`phone_number` + counts; nothing is stored.

### `ClaimResult` (POST response)

| Field | Type | Notes |
|-------|------|-------|
| claimed | number | seeds verified + merged (0 for a forged/non-matching request) |
| stays | number | stays moved |
| events | number | events moved |

## Discovery projection change (D4/FR-007)

The potential-stay projection (`discoveryRepository`) adds:

```
ownerKind: user.kind   // 'seed' → phone withheld in the travelers list
```

`discoveryService.travelerContact` then computes the exposed phone as:

```
phone = ownerKind === "seed" ? null : (contactPhone ?? (ownerSharePhone ? sharedPhone : null))
```

So a seed owner's **name** surfaces (`contactName ?? ownerName`) but the **phone is unconditionally
null** — regardless of `share_phone` — until the seed is claimed and its stays become owned by a
consenting `kind='real'` user. This is the sole deviation from ADR-0008, and it withholds more, never
less.

## Import intermediate artifacts (Part B, on disk — dev-only, D7)

Not database entities — reviewable JSON the pipeline writes to the operator's machine.

| Artifact | Step | Status | Shape |
|----------|------|--------|-------|
| `raw.json` | 1 | ✅ built | `Record<header, string>[]` — every sheet row keyed by its (de-duped) column header |
| `profile.json` | 1 | ✅ built | `SheetProfile { rowCount, columnCount, columns: ColumnProfile[] }` — per column: `header, filled, empty, fillRate, distinct, samples[≤5], guessedKind` |
| `records.json` | 2 | ⏳ pending | mapped + Zod-validated seed records (schema TBD — D8) |
| `accepted.json` | 3 | ⏳ pending | records passing every quality gate (valid E.164 phone + resolvable location, D9) |
| `rejected.json` | 3 | ⏳ pending | failing records + a reason each |

`ColumnKind` (built): `"phone" | "email" | "date" | "number" | "location" | "name" | "text" |
"empty"` — guessed from header hints (Hebrew + English substrings) and value fractions (email/date
before phone so an ISO date is not mis-classified as a phone).

## Tests (data-model-critical)

- **Claim offer + merge** (`test/claim.test.ts`): a seed with a matching phone + one stay is offered
  (`stays:1`), the claim merges the stay to the caller (`claimed:1, stays:1`) and the seed + its
  offer disappear.
- **Forged / non-matching id**: a seed whose phone differs is not offered; a POST forging its id
  yields `claimed:0` (server re-verification, D3).
- **No phone**: a caller with no profile phone is offered nothing.
- **Commitment conflict** (D5): a claim where caller + seed committed to the same event drops the
  seed's duplicate and merges without a unique-index violation. *(covered by the merge path;
  exercised via the reassignment logic.)*
- **Column classification** (`tools/seed-import/src/profile.test.ts`): the CSV parser handles quotes /
  escaped quotes / embedded newlines / CRLF / BOM; `classifyColumn` guesses phone/email/date/etc.
  correctly (dates before phones).
