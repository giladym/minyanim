# Phase 0 Research — Multi-type events (hosting, gatherings, occasions)

Date: 2026-07-12. Extends 003's event/quorum research; same conventions (D-prefixed decisions,
server-derived status, tiered DTOs, no interactive txns, dev-no-real-data). This resolves every
NEEDS-CLARIFICATION seam before design. **R2 (attendance model) was the one decision reserved for the
Architect/PM validation loop; it is now DECIDED (Option A) — see R2 below and
[validation-report.md](./validation-report.md).**

---

## R1 — Event model: two behaviors + an extensible category (not one type per kind)

**Decision** (revised after a product review of the type axis): separate the three tangled axes and
model **behavior** apart from **category**.

- **`event.type` = the behavior class**: `minyan` (quorum readiness) | `gathering` (capacity + RSVP).
  These are the only two genuinely-different behaviors in scope — everything that isn't a prayer quorum
  is "a gathering people RSVP to, optionally with seats". Behavior is what needs *code*.
- **`event.category` = the user-facing kind** (for gatherings): `hosting` | `social` | `learning` |
  `celebration` | … — a fixed enum in v1, designed as the extension seam so it can become
  admin-managed later (like the places `layer` model) **without a deploy**. The concrete graduation
  recipe (4 steps): (1) `CREATE TABLE category (slug PK, label_he/label_en, icon, display_order,
  active, default_rsvp_mode)` mirroring the 010 `layer` pattern; (2) seed one row per enum slug —
  existing `event.category` values are already valid slugs, zero data rewrite; (3) swap create-path
  validation from `CategorySchema.parse` to a DB lookup (the `layerExists()` pattern,
  placesService.ts:106); (4) add admin CRUD + tab. Purely additive, safe even in production; deferred
  per YAGNI until a non-developer needs to launch a category between deploys. Category is *data*: it
  drives label/icon/defaults + a small validated per-category **attrs** blob. `NULL` for a minyan
  (whose kind is "prayer"). **v1 builds `hosting` + `social`** (the categories with user stories);
  `learning`/`celebration` are model-ready fast-follows.
- **occasion / rsvp_mode / visibility / capacity** remain independent axes (R3/R5).

Detail storage: keep the shipped 1:1 `minyan` detail table (nusach/services/Sefer Torah/roles). All
gatherings share **one `gathering` detail** table holding `category` + a `attrs` JSON validated by a
**per-category schema map** — `ATTRS_BY_CATEGORY[category].parse(attrs)` with a `GatheringAttrs` union
type (the wire block has no `category` key, so a literal `z.discriminatedUnion` cannot discriminate;
hosting: mealType/kashrut/dietary/
offering/bringItems/alcohol/accessibility; social: subcategory; learning: topic/teacher — future).
The per-behavior **strategy map** (`lib/eventStrategy.ts`) has just two entries: `minyan` = today's
`lib/minyanStatus.ts` (unchanged, SC-005), `gathering` = the capacity/RSVP derivation.

**Rationale**: Behavior-vs-label is the right cut — there are only two behaviors, so a third bespoke
"meal" behavior/table was accidental complexity. This is *less* code than three detail tables + three
strategies, and makes "learning"/"celebration"/"simcha" near-free additions (new category value + a
tiny attrs variant), matching how OneTable/Partiful express variety as themes/categories rather than
types. `event_status_type_date_idx` still serves type-filtered discovery; `category` filtering runs on
the already-bounded bbox subset (index deferred). The minyan path is untouched (its detail table,
strategy, and behavior are exactly today's).

**Alternatives considered**:
- *Three fixed types, one detail table each (`minyan`/`meal`/`gathering`)* — the prior draft; rejected:
  a bespoke "meal" behavior is really just gathering behavior + a label, so it duplicated logic.
- *Fully data-driven kinds (an admin `event_kind` table + generic custom-field engine) now* — rejected
  for v1 (YAGNI): a custom-field engine + admin CRUD is heavy machinery, loses typed attrs validation,
  and minyan's quorum stays a hardcoded special case regardless. The `category` enum + attrs seam gets
  most of the flexibility at a fraction of the cost, and can graduate to admin-managed later.
- *Single JSON `detail` blob on `event` for everything* — rejected: loses the typed, queryable minyan
  detail + the `$type<T>()` convention. Minyan keeps its real table.

---

## R2 — Generalized attendance/RSVP model **(DECIDED: Option A — see validation-report.md)**

The spec (FR-003) requires one attendance model with a per-attendee **status**
(`pending|confirmed|waitlisted|declined|cancelled`) + **party size**, usable by every type; a minyan
reads party size as men. Today only `commitment` exists (`event_id`, `user_id`, `num_men`, `stay_id`,
`UNIQUE(event_id,user_id)`); a minyan commitment is *implicitly confirmed* (no status column). Two
ways to reconcile:

### Option A — Unified `attendance` table (migrate `commitment` into it)

Rename/replace `commitment` with `attendance`:

| column | notes |
|--------|-------|
| id, event_id (FK cascade), user_id (FK cascade) | as today |
| party_size | replaces `num_men` (minyan reads it as men); 1 ≤ n ≤ PARTY_SIZE_MAX |
| status | `pending\|confirmed\|waitlisted\|declined\|cancelled`; minyan rows default `confirmed` |
| stay_id (FK set null) | as today |
| requested_at / created_at / updated_at | `requested_at` orders the waitlist (earliest-first) |

`UNIQUE(event_id,user_id)` preserved. All the minyan read paths (`committedMenByEvent`,
`participantsForEvent`, roster) add a `status='confirmed'` predicate. Migration 0014 renames the table
+ column and backfills `status='confirmed'` for every existing commitment.

- **Pros**: One true "base + extension" model — exactly what the user asked for; one code path for
  discovery counts, roster, moderation, notifications, cascade; a minyan is genuinely "an event with
  confirmed attendees." Waitlist/request-approve are just status transitions, not a second subsystem.
- **Cons**: Touches the flagship minyan write/read path (the regression the user is most protective
  of). Every minyan query must gain `status='confirmed'`; miss one and a count is wrong. Mitigated by:
  the minyan strategy sets `status='confirmed'` on self-commit + join; the P1 regression decision-table
  test (SC-005) and the existing quorum/roster tests must pass byte-for-byte; a query audit checklist.
- **Migration risk**: low in practice — pre-launch, no real data (dev-no-real-data), so 0014 can
  rename+recreate rather than a delicate backfill.

### Option B — Keep `commitment` (minyan-only), add a parallel `rsvp` model (gatherings)

Leave `commitment` exactly as-is; add an `rsvp` table (same columns + `status`) used only by
gatherings.

- **Pros**: Zero change to the shipped minyan write path — lowest possible regression risk to the
  flagship. Gatherings iterate freely without touching minyan.
- **Cons**: Two parallel attendance subsystems to keep in sync forever — discovery "attendee count",
  moderation cascade, notification recipient resolution, and the tiered DTO "is this viewer confirmed?"
  gate each need a type branch (commitment vs rsvp). Contradicts the "minyan is an extension of a base
  event" goal (minyan would be the *exception*, not an instance). More surface, not less.

### Decision (loop-resolved): **Option A**

The Architect lens chose Option A decisively: Option B forks the *address-reveal privacy gate* into a
`commitment`-vs-`rsvp` branch — the highest-consequence branch in the app; a miss = SC-003 leak. Option
A collapses every read site to one predicate (`status='confirmed'`). Pre-launch, no real data, so the
migration hazard that favored B is gone. **Critical implementation note**: `getCommitment`
(eventRepository.ts:200) today returns a row regardless of status and feeds the reveal gate at
`eventService.getMinyan:156` — so under Option A a `pending`/`waitlisted` requester would be treated as
committed and shown the address unless the check becomes "row exists **AND** status='confirmed'". The
full 13-site confirmed-predicate audit checklist + the FK-safe migration note + the DTO-non-exposure
test gate live in [validation-report.md](./validation-report.md). data-model.md and tasks are written to
Option A.

---

## R3 — RSVP mode × visibility (two independent axes)

**Decision**: Model **rsvp_mode** (`open|approval|invite`) and **visibility** (`public|unlisted|
invite`) as two independent `event` columns (FR-004/FR-005). Defaults by category (R1, via
`CATEGORY_META`): hosting → `approval` + `public`; minyan + social → `open` + `public`. `invite` is scaffolded in both enums but its
management UI is deferred (spec assumption); v1 create flow offers `public` + `unlisted`.

**Rationale**: The spec explicitly states the axes are independent (a public event may still require
approval). Two enums are trivially cheap and future-proof invite-mode without a schema change later.

**Alternatives**: a single fused "join policy" enum — rejected: conflates discoverability with
join-gating, exactly what FR-005 warns against.

---

## R4 — Capacity + waitlist without interactive transactions (corrected in the loop)

**Decision**: `event.capacity` (nullable = unlimited) = **guest seats**, measured as the **sum of
confirmed attendees' party sizes** (NOT a row count — a party of 2 consumes 2 seats; the loop found the
count-vs-sum inconsistency). Every `→confirmed` transition is a **single self-contained SQL statement**
whose guard reads committed state. D1 serializes writes (single writer), so the guard sees prior
commits — **the atomicity comes from the guarded statement, not from `db.batch`** (which only pipelines;
eventRepository.ts:152 confirms it is not a rollback txn). There is no prior count-guarded write in the
repo, so this mechanism is net-new and spelled out here.

- **Open-mode join** — one `INSERT … SELECT` computes confirmed-vs-waitlisted atomically; `ON
  CONFLICT(event_id,user_id) DO … RETURNING status`. Under capacity → `confirmed`, else `waitlisted`.
- **Approval-mode request** → `pending` always (no capacity math at request time).
- **Approve (pending→confirmed)** — one guarded `UPDATE … WHERE id=? AND status='pending' AND (capacity
  IS NULL OR confirmed_sum + party_size <= capacity) RETURNING id`. 0 rows is ambiguous → one cheap read
  to return `request.not_pending` vs `capacity.full`.
- **Cancel/withdraw a confirmed seat + promotion** — soft-set `status='cancelled'`, then (open mode
  only) auto-promote the **earliest-requested waitlisted attendee that still fits**:
  `UPDATE attendance SET status='confirmed' WHERE id=(SELECT id FROM attendance WHERE event_id=? AND
  status='waitlisted' AND confirmed_sum + party_size <= capacity ORDER BY requested_at,id LIMIT 1)
  RETURNING user_id` — then notify the returned user. Double-cancel/double-promote is safe by
  write-serialization (the second sees the first committed). In **approval mode** a freed seat does NOT
  auto-promote (would bypass host approval → address leak); instead the host is notified a seat opened.

Over-book is structurally impossible (SC-006): the guard in each `→confirmed` statement prevents the
sum from exceeding capacity. "Earliest that fits" (not "earliest") is the corrected waitlist rule — a
too-large party is skipped, preserving no-overbook. Full guarded SQL is in
[contracts/api.md](./contracts/api.md).

**Alternatives**: app-side read-then-write — rejected (race → overbook). A `db.batch`-provides-atomicity
framing — rejected (the batch pipelines but does not roll back; the guard must be self-contained).

---

## R5 — Occasion as a cross-cutting tag (fixed enum, not a type, not a calendar dependency)

**Decision**: `event.occasion` = a nullable/`"none"` fixed enum `OccasionSchema` =
`[shabbat, rosh_hashanah, yom_kippur, sukkot, pesach, shavuot, chanukah, purim, none]` (spec
assumption). It is a discovery **filter**, orthogonal to `type`+`category` (a hosting event *or* a
minyan can be "Pesach").
No third-party Jewish-calendar library and no auto-derivation from the date in v1 — the host picks it.

**Rationale**: Keeps v1 dependency-free (constitution licensing/YAGNI), matches the spec's fixed set,
and avoids coupling occasion correctness to a calendar library's edge cases. Auto-suggesting occasion
from the date is a clean future enhancement, explicitly out of scope.

**Alternatives**: derive occasion from `event_date` via `kosher-zmanim`/a Hebrew-calendar lib —
rejected for v1 (adds a dependency + tz/edge-case surface for a field the host can just pick).

---

## R6 — Tiered address/contact reveal reuse (the SC-003 invariant, per type)

**Decision**: Reuse `eventService.withRosterFields` / `buildPublic` **unchanged in shape**: exact
`lat/lng` + `address_private` + `address_notes` + host contact are added to a DTO **only when the
viewer is confirmed** (or host). "Confirmed" generalizes from "has a commitment" to "has a
`status='confirmed'` attendance" (Option A) or "has a commitment OR a confirmed rsvp" (Option B). For
an approval-mode (hosting) gathering, a `pending`/`waitlisted` requester is a non-confirmed viewer →
sees city/neighborhood + fuzzed coords only, exactly like a non-committed minyan viewer. "Confirmed" is `status='confirmed'` on the
unified `attendance` table (R2 Option A). The structural strip (`toPublic…DTO`) is the zero-leak
guarantee (SC-003).

**Rationale**: This is the app's core privacy invariant and already correct for minyan; the only change
is what "confirmed" resolves to. Keeping the strip structural (fields absent, not nulled) means a new
type cannot accidentally leak.

---

## R7 — Discovery: surface all types + type/occasion filters

**Decision**: Generalize `eventRepository.listMinyanimInBbox` → `listEventsInBbox` (drop the
hard-coded `type='minyan'`; accept optional `types: EventType[]` + `categories?: Category[]` +
`occasion?`); generalize
`discoveryService.toPublicMinyan` → a type-parameterized public projection. `DiscoveryResult` gains the
non-minyan events (or a generalized `events` field); FE `DiscoveryPage` gains a **kind filter** (chips
mapping to `types`+`categories`: הכל · מניינים · אירוח · מפגשים) + an **occasion filter** (select). The existing nusach/seferTorah controls become **minyan-only
sub-filters**, shown only when the minyan type is in scope, so the minyan discovery UX is unchanged.

**Rationale**: The index already supports `(status,type,event_date)`; the only real work is removing
the minyan literal and adding the filter params. Keeping nusach/seferTorah minyan-scoped avoids
regressing the flagship discovery surface.

**Alternatives**: a separate hosting-discovery endpoint — rejected: fragments the "everything near my
Stay" promise (US2) and duplicates the bbox/tz machinery.

---

## R8 — Notifications for the new flows

**Decision**: Add `NotificationKind`s: `seat_requested` (→ host), `request_approved` /
`request_declined` (→ requester), `waitlist_promoted` (→ promoted guest); reuse
`onCancelled`/host-changed for the shared paths. Fan-out reuses `notificationService.fanOut` +
`ctx.defer` email; make the hard-coded `/minyan/${eventId}` URL **type-aware**
(`/${typeSlug}/${eventId}` or a single `/event/${id}`). Approve/decline MAY link into 008 messaging
(FR-015) so host+guest can coordinate — a link, not a rebuild.

**Rationale**: The notification subsystem is already event-generic (recipient rows + deferred email +
idempotency ledger); only the kinds + URL builder need touching. Per-requester request/approve
notifications are 1:1 (not threshold crossings), so they bypass the ledger — simpler than quorum.

---

## R9 — Moderation & active-user enforcement reuse

**Decision**: No moderation changes. `flag.contentType='event'` is fixed by the route and already
type-agnostic; `hidden` gating in `getEvent`/discovery covers gatherings unchanged;
`assertUserActive` guards create + request/join for every type (FR-013). A hidden hosting event /
suspended host cannot be discovered or take new requests — same code path as minyan.

**Rationale**: The moderation seam was built polymorphic (006/011); a new event type inherits it for
free. Verified by extending the existing moderation tests to a hosting-gathering fixture.

---

## R10 — Frontend generalization without regressing minyan

**Decision**: Generalize by **branching, not replacing**. `HostMinyanForm` → `HostEventForm` with a
kind picker whose `minyan` branch renders today's exact fields; `MinyanDetail` → `EventDetail` whose
`type==='minyan'` branch renders today's exact hero/quorum/readiness/roles. Hosting/social are new
branches (hosting: seats/kashrut/dietary/offering/bring + request-approve panel; social: subcategory +
open RSVP). The generic `/api/events/*` wire is already type-neutral, so query/mutation hooks extend
rather than change. Route `/minyan/$id` stays (public join links); add a `/event/new?kind=` kind-picker
entry while keeping `/minyan/new?fromStay=` working.

**Rationale**: Preserves every shipped minyan pixel and URL (SC-005) while sharing the chrome. The
detail page is the highest-risk regression surface, so the minyan branch is copied, not refactored.

---

## R11 — RSVP cutoff + terminal "closed" state (no background job)

**Decision**: `event.rsvp_cutoff` (nullable timestamp). New requests/joins are rejected (`rsvp.closed`)
once `now > rsvp_cutoff` OR the event date has passed. There is no scheduled auto-decline (the stack has
no Queues/cron — 003 D5): "closed" and a pending request's terminal state are **derived at read time**.
Past the cutoff alone, an existing pending request stays pending (and resolvable) — the viewer sees
"registration closed, your request still awaits the host"; only past the **event date** does a
still-pending request read as terminal "closed". A host may still resolve already-pending requests
until the event date. Resolves the dropped-cutoff gap (Arch #4/PM #4) and the "pending hangs forever"
gap (PM #3) without new infra.

## R12 — Host seat semantics (per-type `hostSelfAttends`)

**Decision**: `capacity` counts **guest** party sizes only. The per-behavior strategy carries
`hostSelfAttends`: **minyan = true** (host self-commits as a man, counts toward quorum — unchanged,
SC-005), **gathering = false** (host is the organizer via `event.hostUserId`, not an attendance
row). `seatsRemaining = capacity − SUM(confirmed guest party sizes)`. Bonus: the capacity guard SQL
needs no host-exclusion clause because the host simply isn't an attendance row for gatherings. Resolves
the "does the host consume a seat" ambiguity (Arch/PM #5).

## R13 — Route surface: `/attendance` canonical, `/commit` kept as alias

**Decision**: The canonical new surface is `POST/PATCH/DELETE /api/events/:id/attendance` +
`/api/events/:id/requests(/:id/approve|decline)`. The shipped minyan FE keeps calling the existing
`POST/PATCH/DELETE /api/events/:id/commit` **unchanged** — those routes stay as thin aliases delegating
to the attendance service (open mode, `status='confirmed'`). Zero minyan FE/wire change (SC-005). Avoids
two RSVP wire surfaces (Arch #3).

## R14 — Withdraw = soft-cancel (preserves waitlist ordering)

**Decision**: `withdraw`/cancel sets `status='cancelled'` (soft) rather than deleting the row, so
waitlist `requested_at` ordering + the freed-seat promotion trigger survive. Re-join **UPDATEs** the
existing `(event_id,user_id)` row back to `pending`/`confirmed` (not a second INSERT). Behaviorally
identical for minyan (cancelled rows are excluded from quorum/roster by the R2 confirmed-predicate).
Resolves the withdraw-semantics gap (Arch #4).

## Consolidated decisions

| # | Decision | Status |
|---|----------|--------|
| R1 | Behavior (`type: minyan\|gathering`) + extensible `category` (hosting/social); one `gathering` detail (attrs union); two-entry strategy map | Fixed (revised) |
| **R2** | **Attendance model: Option A (unified `attendance`)** | **Decided (loop)** |
| R3 | Independent `rsvp_mode` + `visibility` enums; invite scaffolded, UI deferred | Fixed |
| R4 | Capacity = confirmed party-size SUM; guarded single-statement writes; "earliest that fits" promotion; approval-mode never auto-confirms | Fixed (loop-corrected) |
| R5 | Occasion = fixed in-code enum, host-picked, no calendar dep | Fixed |
| R6 | Reuse tiered reveal; "confirmed" = status='confirmed' (13-site audit) | Fixed |
| R7 | Generalize discovery query + add kind (types+categories)/occasion filters; nusach/sefer minyan-scoped | Fixed |
| R8 | New notification kinds; type-aware URL; optional 008 messaging link | Fixed |
| R9 | Reuse moderation + enforcement unchanged | Fixed |
| R10 | Frontend: branch don't replace; preserve minyan URLs/pixels | Fixed |
| R11 | `event.rsvp_cutoff` + read-time-derived "closed" (no cron) | Fixed (loop) |
| R12 | Host not counted against capacity (`hostSelfAttends` per type) | Fixed (loop) |
| R13 | `/attendance` canonical; `/commit` kept as alias | Fixed (loop) |
| R14 | Withdraw = soft-cancel; re-join UPDATEs the row | Fixed (loop) |
