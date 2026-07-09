# Phase 1 Data Model — Admin: Moderation, Curation & Metrics

Date: 2026-07-09 · Storage: Cloudflare D1 (SQLite) via Drizzle. **No new table** — the 003 `flag`
table is reshaped in place; three ADD COLUMNs on existing tables. Pre-launch, no real data
(MEMORY `dev-no-real-data`) → a destructive flag reshape is acceptable. One migration (`0011`).

---

## Change 1 — `flag` reshape (US1: reason + Stay flagging)

Today (003): `flag { id, event_id → event.id, user_id → user.id, created_at }`, unique
`(event_id, user_id)`. It can only reference an **event**, has **no reason**, and cannot flag a Stay.

006 makes it **polymorphic** and reasoned:

```
flag = sqliteTable("flag", {
  id: text("id").primaryKey(),
  contentType: text("content_type").notNull(),        // 'stay' | 'event'
  contentId: text("content_id").notNull(),            // the flagged stay.id / event.id (no FK — polymorphic)
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),  // the reporter
  reason: text("reason").notNull(),                   // 'spam' | 'inappropriate' | 'fake' | 'other'
  reportedUserId: text("reported_user_id").references(() => user.id, { onDelete: "cascade" }), // optional US1.3 user report
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => [
  uniqueIndex("flag_content_user_uidx").on(t.contentType, t.contentId, t.userId),  // one flag per reporter per item (FR-001)
  index("flag_content_idx").on(t.contentType, t.contentId),                        // count-distinct + queue grouping
]);
```

**Polymorphic ref rationale (chosen over a parallel stay-flag table)**: a single `(content_type,
content_id)` pair keeps ONE flag path, ONE idempotency rule, ONE auto-hide rule, and ONE queue query
regardless of content kind — the moderation logic never branches per type except when it flips the
`hidden` flag (which column to write). A parallel table would double the repository, the queue union,
and the auto-hide code for zero benefit. Cost: no DB-level FK on `content_id` (it targets two tables);
mitigated by `contentExists(db, contentType, contentId)` before recording a flag (404 otherwise —
mirrors 003's `eventExists`) and by cascading deletes handled application-side when content is removed
(a removed stay/event's flags are cleared by `clearFlags`). Both `stay` and `event` therefore need a
`hidden` column (event already has one — Change 2 adds it to stay).

**Migration is destructive** (drops `event_id`, adds columns): acceptable pre-launch. Existing dev
flag rows (if any) are discarded — the reshape backfills nothing.

## Change 2 — `stay.hidden` (US2: Stays are hideable)

`stay` gains, paralleling `event.hidden`:

```
hidden: integer("hidden", { mode: "boolean" }).notNull().default(false)
```

Enforcement reads it in two places:
- **Discovery/travelers list** (`repositories/discoveryRepository.ts`) — the three queries that
  already filter `eq(stay.status, "active")` add `eq(stay.hidden, false)` so an auto-hidden Stay
  disappears from public discovery (SC-001 for Stays).
- **Owner dashboard** — the owner still sees the Stay (per US2.2, "not silently deleted") with an
  "under review" marker; `stayService.toOwnerDTO` surfaces `hidden` so the card can render the banner.

`event.hidden` already exists and is honoured in `eventService.getMinyan` (404 to non-hosts, D19) —
no change beyond wiring the auto-hide writer to it.

## Change 3 — `user.status` + `suspended_until` (US3: sanctions)

`user` gains (mirrors the `isAdmin`/`sharePhone` pattern):

```
status: text("status").notNull().default("active"),                 // 'active' | 'suspended' | 'banned'
suspendedUntil: integer("suspended_until", { mode: "timestamp" }),  // nullable; set only for a timed suspension
```

- `active` — normal.
- `suspended` — temporary; `suspended_until` set. On the enforcement read, an **expired** suspension
  (`suspended_until <= now`) is auto-cleared back to `active` (lazy reinstatement, no cron).
- `banned` — permanent; `suspended_until` null.

A **warn** does NOT change `status` (it is an advisory record surfaced to the user; v1 stores the warn
as an admin-action log line — no separate table, KISS). Suspend/ban set `status`; reinstate sets it
back to `active` and clears `suspended_until`.

Register `status` + `suspendedUntil` in `auth.ts` better-auth `additionalFields` with **`input:
false`** (never settable via signup/profile — only the sanction service writes them; mirror `isAdmin`).
Widen `userRepository.updateUser`'s field type to include both (else they silently drop — the 004/005
hand-built-shape trap).

## Auto-hide rule (US2 / SC-001) — `moderationService.flagContent`

Synchronous, in the same request as the flag write (no cron → "within seconds"):

1. `contentExists(db, contentType, contentId)` → 404 if missing.
2. `flagContent(...)` idempotent insert on `(contentType, contentId, userId)` — a repeat by the same
   reporter is a no-op (FR-001; `onConflictDoNothing`).
3. `const n = distinctReporterCount(db, contentType, contentId)` — counts **distinct reporters**
   (the unique index already guarantees one row per reporter, so this is `COUNT(*)` over the pair).
4. If `n >= 3` → `setContentHidden(db, contentType, contentId, true)` — **idempotent** (writing
   `hidden=true` when already true is a no-op; so the 4th, 5th… flag never re-fire anything). The user
   is **never** auto-suspended/banned (SC-002) — content only.

Threshold `3` is a named constant. Counting distinct reporters (not raw flags) is why one reporter
spamming the flag button cannot cross the threshold alone.

## Moderation queue (US3) — derived, not stored

There is **no stored "queue entry" row**. The queue is a **read-time aggregation** over `flag`
grouped by `(content_type, content_id)`:

`ModerationQueueEntryDTO` (hand-built in the service, like the stay DTOs):

| Field | Type | Source |
|-------|------|--------|
| contentType | `"stay"` \| `"event"` | group key |
| contentId | string | group key |
| reporterCount | number | `COUNT(DISTINCT user_id)` for the pair |
| reasons | `FlagReason[]` | distinct reasons present |
| hidden | boolean | the content's `hidden` column (auto-hidden ⇒ true) |
| reportedUserId | string \| null | the content owner (`stay.user_id` / `event.host_user_id`) — the sanction target |
| contentSummary | `{ city, country, title? }` | a light join for the admin to recognize the item |
| createdAt | number | earliest flag timestamp (age/urgency) |

**Ordering (FR-003 "by urgency")**: `hidden = true` first (auto-hidden, needs review now), then by
`reporterCount` desc, then oldest-first. An **admin-owned** content item's flags are surfaced but the
sanction action against that admin owner is gated by the FR-009 guard (see below).

## Sanctions (US3) & the FR-009 last-admin guard

`moderationService` actions:
- **dismiss** (content) → `setContentHidden(false)` + `clearFlags(contentType, contentId)` (restore +
  clear — SC-002.4 / US3.2 "dismiss (restore)").
- **remove** (content) → `setContentHidden(true)`, flags kept (record of the removal).
- **warn / suspend / ban / reinstate** (user) → `setUserStatus`. `suspend` sets `status='suspended'`
  + `suspended_until = now + suspendDays`; `ban` sets `status='banned'`; `reinstate` sets `'active'` +
  null; `warn` logs only.

**FR-009 / SC-005 (never zero active admins)** — before a suspend or ban whose **target is an admin**
(`user.isAdmin`), the service computes `activeAdminCount(db)` = admins with `status='active'`. If
suspending/banning this admin would drop that count to `0`, throw `admin.last_admin` (409/400). This
is enforced in the service (not the UI) so it holds for every code path.

Every action is logged (`ctx.log.info("admin.action", { actor, action, target })`) — FR-008 audit
trail (no separate audit table in v1; Workers Observability is the store — KISS).

## Enforcement (US3 / FR-005) — `lib/enforcement.ts`

`assertUserActive(db, userId)`, called at the top of the **create-stay**, **host-minyan**, and
**commit** service paths:
1. `findUser(db, userId)`.
2. `banned` → throw `user.banned` (403).
3. `suspended` with `suspended_until > now` → throw `user.suspended` (403, params: `{ until }`).
4. `suspended` with `suspended_until <= now` → auto-clear to `active` (`setUserStatus(active, null)`)
   and proceed (lazy reinstatement).
5. `active` → proceed.

Sign-in itself is governed by better-auth; v1 blocks the **actions** (create/host/commit) and shows a
status banner (FR-005 "blocked from the corresponding actions and informed"). Reads are not blocked.

## Migration note (`apps/backend/migrations/0011_*.sql`)

Generated via `pnpm --filter @minyanim/backend db:generate` — the real number is `0011` (0000–0010
exist). It carries:
- `flag` reshape — drop the `event_id`-based table shape; add `content_type`, `content_id`, `reason`,
  `reported_user_id`; new unique `(content_type, content_id, user_id)` + index `(content_type,
  content_id)`. Because SQLite can't drop a column with a live FK cleanly, drizzle-kit may emit a
  table rebuild for `flag` — **that is fine for `flag`** (only `user_id` FK-children it as the parent;
  `flag` itself has no children), unlike `user`.
- `stay ADD COLUMN hidden integer NOT NULL DEFAULT 0`.
- `user ADD COLUMN status text NOT NULL DEFAULT 'active'` + `user ADD COLUMN suspended_until integer`.

**VERIFY after generate** that the `user` and `stay` changes are single `ALTER TABLE … ADD COLUMN`
statements and NOT a PRAGMA-wrapped 12-step rebuild — `user` is better-auth-owned with many FK
children and `stay` is FK-childed by `commitment`; a rebuild hits the same D1 `PRAGMA foreign_keys`
rejection as 004. Hand-author the one-line ALTERs if drizzle-kit emits a rebuild for those two.
**Apply to remote dev on deploy** (`pnpm db:migrate:remote`) — CI/Workers Builds do NOT auto-migrate.

## Tests (data-model-critical)

- **Idempotent flag**: same reporter flags twice → one row; `reporterCount` stays 1.
- **Auto-hide at 3 distinct**: 2 reporters → not hidden; 3rd distinct reporter → `hidden=true`; a 4th
  flag → still hidden, no error (idempotent). Owner is NOT suspended/banned (SC-002).
- **Stay flag**: a Stay reaches 3 flags → `stay.hidden=true` → drops from the discovery/travelers list;
  owner still sees it with "under review".
- **Queue ordering**: auto-hidden entries sort before open ones; then by reporter count.
- **Sanctions**: suspend sets `status`+`suspended_until`; expired suspension auto-clears on
  enforcement; ban blocks create/host/commit with `user.banned`.
- **Last-admin guard**: banning the only active admin → `admin.last_admin`; banning a non-last admin
  succeeds (SC-005).
- **Enforcement**: a suspended user's create-stay/host-minyan/commit → 403 `user.suspended`; an active
  user proceeds.
