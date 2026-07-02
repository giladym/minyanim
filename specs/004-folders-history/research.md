# Phase 0 Research — Folders & History

Date: 2026-06-21. Resolves the spec Clarifications (D1–D14) into concrete decisions, **reconciled
against shipped 002/003 code** after a two-role plan review (Architect + Developer). Format:
Decision · Rationale · Alternatives rejected. Verified-code corrections are called out where the
first draft was wrong.

## R1 — Folder table + Stay FK (D3/D4)

**Decision**: `folder(id 'fld_…', user_id→user CASCADE, name, created_at, updated_at)`. `stay.folder_id`
gains FK `references(folder.id, { onDelete: "set null" })`. **"Unfiled" ≡ `folder_id IS NULL`** —
virtual, never a row; folder delete = single `DELETE` → SET NULL cascade reassigns its Stays. **Stay
ids stay bare `crypto.randomUUID()`** (unprefixed — verified `stayService.ts`); folders use the
`fld_` prefix (mirrors `evt_`/`rol_`). **Rationale**: user-cascade mirrors `stay`/`phone_number`;
SET-NULL gives the no-data-loss reassignment in one DELETE (no app loop, no interactive txn).

## R2 — Per-user name uniqueness via a NOCASE unique index (D3) — corrected (was service-only)

**Decision**: a **DB-authoritative** case-insensitive unique constraint —
`CREATE UNIQUE INDEX folder_user_name_uidx ON folder(user_id, name COLLATE NOCASE)` (raw SQL in the
migration; Drizzle's `uniqueIndex` can't express COLLATE). The service catches the constraint
violation and maps it to `folder.name_taken`. **Rationale**: the original "service-level SELECT then
INSERT" check has a **TOCTOU race** (D1 has no interactive txn — two concurrent `POST {name:"X"}`
both pass and both insert). A NOCASE unique index closes it at the DB and is case-insensitive
without a generated column. **Alternatives rejected**: service-only check (race, ARC-08); plain
`UNIQUE(user_id,name)` (case-sensitive — "Europe"/"europe" both pass); generated lowercase column
(unneeded given COLLATE NOCASE).

## R3 — Migration: clean recreate, FK-aware (D5/R-was-rebuild) — corrected for the 003 commitment FK

**Verified risk**: `commitment.stay_id` already FK-references `stay(id)` (shipped `0002`). drizzle-kit's
12-step `stay` rebuild renames `stay`→`__new_stay` and emits `PRAGMA foreign_keys=OFF` wrappers — and
**D1 does not allow `PRAGMA foreign_keys` inside migrations** (D1 manages FK state). So the
auto-generated rebuild may not apply cleanly and could dangle the 003 FK.

**Decision**: **pre-launch, no data** → author migration `0004` as a **clean drop + recreate in
dependency order**: drop `commitment` + `stay`, create `folder`, recreate `stay` (with `folder_id`
FK SET NULL + all existing indexes `stay_user_idx`/`stay_user_arrival_idx`/`stay_lat_lng_idx` +
`stay_user_folder_idx` + `stay_user_departure_idx`), recreate `commitment` (with its `stay_id` FK).
**Generate via drizzle-kit, then review the emitted SQL**; strip any `PRAGMA foreign_keys` lines so
it applies on D1; **add a test** asserting after the migration: `commitment.stay_id` FK still exists
(`PRAGMA foreign_key_list(commitment)`) and the stay indexes are present. **Rationale**: drop/recreate
is lower-risk than a copy-rebuild when there's no data, and sidesteps the PRAGMA/D1 issue.
**Alternatives rejected**: trusting the auto rebuild on D1 unverified (ARC-01 risk).

## R4 — Scope is in-service derived, NOT a SQL predicate (D1/D2) — corrected

**Verified**: `isPast` is computed **in `toOwnerDTO`** from `tzFromCoords`/`todayCivil` —
**not a SQL column** (`stayService.ts`). And shipped `listStays` filters `status='active'` only
(returns active incl. past-active; cancelled excluded) — so the active dashboard today is
"active incl. past", and the past-ness shows via `StayCard`'s `isPast` badge. (The D1 amendment's
"tests assert past on dashboard" was **inaccurate** — DEV-03; the behavior lives in `StayCard` +
the *absence* of an isPast filter, and there's no such test assertion to change.)

**Decision**:
- **`scope=active`**: repo `listStays` (`status='active'`) → **in-service `filter(!isPast)`** (bounded
  N). Not a SQL `NOT isPast`.
- **`scope=history`**: a **new** repo query (the existing one can't return cancelled) — coarse
  inclusive SQL `WHERE user_id=? AND (status='cancelled' OR departure_date < <today_utc + 1 day>)`,
  then **in-service refine** `historyTag != null` (status cancelled → "cancelled"; else isPast →
  "attended"). The +1-day UTC buffer guarantees the coarse SQL never excludes a row that the tz
  refinement would keep.

## R5 — History keyset pagination reconciled with in-service isPast (D10/SC-005) — the key fix

**Problem (ARC-03/DEV-04)**: SQL `LIMIT n` keyset + in-service `isPast` drop → a page can yield < n
emitted rows while more matches exist → infinite-scroll ends early / pages incomplete (SC-005 fails).

**Decision**: keyset on `(departure_date DESC, id DESC)` over the **coarse** SQL filter (R4),
**over-fetch** (`LIMIT pageSize + buffer`), refine `isPast` in-service, and **derive `nextCursor`
from the last EMITTED (kept) row, not the last fetched row**; if a page underfills (kept < pageSize)
and SQL returned a full batch, **fetch the next batch and continue** until `pageSize` kept rows
accumulate or the source is exhausted (`nextCursor=null`). Cursor = opaque base64 of
`${departureDateMs}_${id}`. Backed by index `(user_id, departure_date, id)` (id in the index so the
tiebreaker doesn't filesort). **Coordless stays** (no lat/lng): pin their history `isPast` to **UTC**
(stable), NOT the viewer's clientTz — otherwise History membership flickers per device (ARC-10).
**Alternatives rejected**: OFFSET paging; cursor from last fetched row (skips refined-out rows →
gaps).

## R6 — historyTag must thread through THREE hand-built shapes (D2) — corrected

**Verified**: `OwnerStayDTO` (`stay.ts`) has no `historyTag`; `toOwnerDTO` (`stayService.ts`),
`toOwnerResponse` (`stayController.ts`), and `toPublicStayDTO` (`stay.ts`) all hand-build field lists
→ a new field is **silently dropped** unless added everywhere. **Decision**: add
`historyTag: "attended" | "cancelled" | null` to `OwnerStayDTO`; **compute in `toOwnerDTO`** (next to
`isPast`); add to **`toOwnerResponse`** (controller allowlist); **omit from `PublicStayDTO`/
`toPublicStayDTO`** (003 public projection — folders/history are owner-only, D11) and state that
explicitly. Extend `stay-dto.test.ts` for the new field.

## R7 — Ownership enforced in-service BEFORE the write (D6/D11) — corrected

**Corrected**: the FK does **not** protect against assigning to a *foreign* folder — the row exists
(owned by someone else), so the FK passes. **Decision**: in both `createStay` and `updateStay`, when
`folderId` is non-null, `SELECT folder WHERE id=? AND user_id=?` → throw `NotFound()` if absent
(never leak, matching 002). Folder CRUD is owner-scoped (`and(eq(folder.id,id), eq(folder.userId,
userId))`). Add cross-user-assign tests on POST and PATCH.

## R8 — Shared contracts to add (D7/D10/D12) — enumerated (were named only)

In `packages/shared`:
- `schemas/folder.ts`: `FolderDTO { id, name, stayCount, createdAt }`;
  `CreateFolderInput = z.object({ name: z.string().trim().min(1,"folder.name_required").max(60,"folder.name_too_long") })`;
  `UpdateFolderInput` (same).
- `schemas/stay.ts`: `StayScope = z.enum(["active","history"])`; `historyTag` on `OwnerStayDTO`;
  `HistoryPage = { stays: OwnerStayDTO[]; nextCursor: string | null }`. Cursor format: base64
  `${departureDateMs}_${id}`.
- `errors.ts`: `folder.name_taken`, `folder.name_required`, `folder.name_too_long`,
  `stay.not_cancelled` (reuse `resource.not_found`, `confirm.required`).

## R9 — Permanent delete + duplicate (D8/D9)

**Permanent delete**: `DELETE /api/stays/:id/permanent` hard-deletes **iff `status='cancelled'`**
(else `stay.not_cancelled`), `confirm:true` (else `confirm.required`); cascades to
`commitment.stay_id` SET NULL (003). **Duplicate (client-side)**: `staysNewRoute` gains
`validateSearch` accepting `?from=<stayId>`; `AddStayPage`, when `from` is set, fetches `getStay(from)`
and prefills all fields **including folderId** with **cleared dates** — distinct from the edit
`seeded` path. **Requires fixing the form seam (R10).** No backend duplicate endpoint.

## R10 — Frontend seams that are broken today (D6/D9) — must fix first

**Verified**: `AddEditStayForm` **hardcodes `folderId: null`** in the payload, **omits it from the
payload memo deps**, and **does not seed it on edit**. So folder assignment + duplicate-prefill are
no-ops until fixed. **Decision (tasks)**: seed `folderId` from the loaded stay (edit + duplicate);
make it a controlled field with a real **folder `<select>` + inline "create folder"**; add it to the
payload memo + deps. The "existing folderId field" the spec assumed **does not functionally exist** —
this is real new work.

## R11 — Cache keys + infinite query (D13) — shape divergence

**Decision**: migrate the flat `["stays"]` (5 consumers in `lib/stays.ts`, array-shaped optimistic
caches) to `["stays","active"]` (array) and add `useStaysInfinite("history")` via `useInfiniteQuery`
(`getNextPageParam: last => last.nextCursor`, **`InfiniteData` shape — different from the active
array**). New `lib/folders.ts` with `["folders"]`. Optimistic mutations: assign/move → invalidate
active + folders; **cancel → move the row from the active cache to history** (or invalidate both);
permanent-delete → invalidate history; folder rename/delete → folders + active. **Rationale**: the
two scopes have different cache shapes; a naive shared array key + `previous.map` breaks on history.

## R12 — Tests, FK enforcement, indexes, route registration, i18n, logging

- **FK enforcement in tests**: confirmed **ON** — the shipped 002/003 cascade-orphan tests pass,
  which only works if D1 (vitest-pool-workers) enforces `ON DELETE CASCADE`. So `ON DELETE SET NULL`
  will fire; the SC-004 test is meaningful (add it anyway).
- **Cascade-orphan**: extend to assert zero `folder` rows after `deleteUser`; add a **separate**
  folder-delete → Stays survive with `folder_id IS NULL` test (SC-004).
- **Indexes**: `folder_user_idx (user_id)`; `stay_user_folder_idx (user_id, folder_id)`;
  `stay_user_departure_idx (user_id, departure_date, id)`.
- **Route registration**: mount `folders` in `apps/backend/src/index.ts` (`app.route("/", folders)`).
- **FE routes**: extend `staysRoute.validateSearch` with `scope?`/`folder?`/`sort?`; add a History
  route (`/stays/history` or `?scope=history`); add `?from=` to `staysNewRoute`; create
  `features/folders/`.
- **i18n (he+en parity)**: `folders.{title,create,rename,delete,deleteWarn,nameTaken,unfiled}`,
  `history.{title,attended,cancelled,empty,loadMore}` + error messages. (A parity test guards this —
  added in 003.)
- **Structured logs**: `folder.created`/`folder.deleted`/`stay.permanently_deleted`.

## Planning constants

folder name 1–60 · History page size 20 (+ over-fetch buffer) · folders ordered by `created_at` ·
coordless history pinned to UTC. Pre-launch: no real data → migration may drop/recreate.
