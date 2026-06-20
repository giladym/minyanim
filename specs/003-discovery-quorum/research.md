# Phase 0 Research — Discovery & Quorum Formation

Date: 2026-06-20. Resolves the spec's Clarifications (D1–D22) into concrete technical decisions,
**reconciled against the live codebase** after a two-role plan review (Architect + Developer).
Format: Decision · Rationale · Alternatives rejected. Verified-codebase notes are called out where
the original draft over-claimed reuse.

---

## R1 — Generic event physical layout (D21)

**Decision**: One base **`event`** table (common fields + `type` + `notes`) + a **1:1 `minyan`
detail** table keyed by `event_id` ("class-table inheritance"). Minyan columns: `nusach`,
`sefer_torah` (indexable SQL columns, for FR-008 filters), and a **`services` typed-JSON array**
`[{ tefilla, time? }]` (the gathering's tefillot, D3 — the 002 `prayer_needs` JSON pattern, since
services aren't filtered individually). Commitments/notifications reference `event`. Roles live in
`event_role` (R5). **Rationale**: the FR-008 filters (nusach, Sefer Torah) stay indexable columns;
the per-tefilla services are descriptive and fit a typed JSON array. A future type = a new `type` +
detail table, no rewrite. **Alternatives rejected**: nullable per-type columns on `event` (sprawl);
Zod-typed JSON `details` (the 002 `prayer_needs` pattern) — fine for non-filtered attributes but
`json_extract` is unindexed and hurts SC-001/FR-008.

## R2 — Potential aggregation: bounding-box over an indexed `stay(lat,lng)` (D1)

**Decision**: Bounding box from centre + radius:
`latΔ = radiusKm/111`, `lngΔ = radiusKm/(111·max(cos(lat), 0.01))` (the `cos` floor avoids the
near-pole blow-up). Query
`stay WHERE status='active' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`, then apply the
date-overlap + Shabbat bucketing (R3) in the service on the bounded subset. New composite index
`stay(lat,lng)` (the D15 seam). **Default radius = 15 km** (planning constant).

**Coordless-Stay union (verified: `stay.lat/lng` are nullable — `schema.ts`)**: manual-entry Stays
have null coords and are silently excluded by the bbox. Potential = **(bbox-matched coord Stays)
UNION (coordless Stays whose normalized `city`+`country` equals the query's)**, **deduped by stay
id**. Normalization = `trim` + `lower` + Unicode NFC on city/country. A coordless Stay in potential
is an explicit test (R: data-model tests).

**Rationale**: D1/SQLite has no spatial index; a bounded range scan + small-N in-service tz filter
keeps SC-001 (<2 s) realistic. **Index note**: SQLite range-scans only the leading column (`lat`);
`lng` is a residual filter — acceptable at v1 N. **Out of scope (v1)**: antimeridian-crossing
boxes (lng wrap at ±180) — target communities (EU/IL/US) are far from it; documented limitation.
**Alternatives rejected**: full scan + per-row tz (fails SC-001 at scale); geohash buckets
(premature).

## R3 — Per-Shabbat bucketing (D2) — corrected against real `timezone.ts`

**Verified**: 002's `coversShabbat(arrival, departure, _tz)` **ignores the tz arg** and derives the
weekday from `getUTCDay()` of the **UTC-midnight stored date** — which, by the 002 storage
convention ("epoch-ms @ UTC midnight of the civil date"), **is** the civil weekday by construction.
There is no range→buckets helper and no single-date weekday helper.

**Decision**: lean on the UTC-midnight convention — **no `tzFromCoords` needed for weekday**. Add
one small tz-free helper to `apps/backend/src/lib/timezone.ts`:
`shabbatSaturdaysInRange(arrival, departure, from, to): number[]` → the UTC-midnight epochs of the
Saturdays (`getUTCDay()===6`) inside `[arrival,departure] ∩ [from,to]`. A Stay counts toward each
returned Saturday bucket. **Bucket key** = the Saturday civil date `YYYY-MM-DD` (via `civilDate(...,
"UTC")`). A Friday-night (Maariv) event surfaces under that weekend's Saturday bucket. **Rationale**:
matches the exact convention 002 already relies on; tz-free and correct across the date line for
weekday (the bug 002 itself avoids). `tzFromCoords` is still used for the *not-past/completed* check
(R4), exactly as 002's `assertNotPast`/`isPast` do. **Alternatives rejected**: pretending
`coversShabbat` is tz-aware (it isn't); a zmanim API (out of scope, 005).

## R4 — Derived status + readiness (D7/D8, SC-004) — corrected weekday source

**Decision**: `event` stores only `forming`/`cancelled`; `quorum`/`ready`/`completed` are
**derived** in `eventService`, never stored. Inputs:
- `committedMen` = `SUM(commitment.num_men)` for the event (single grouped query, R15).
- `isShabbatShacharit` = `services.some(s => s.tefilla==='shacharit') AND isSaturday(event_date)`
  (Saturday via the UTC-midnight convention — **no tz**, R3). The `isSaturday(epoch)` helper, not
  `coversShabbat`. (A gathering "includes a Shabbat-morning Shacharit" — D3.)
- `seferTorah` (minyan), `baalKoreiClaimed` = an `event_role` row with role `baal_korei`.
- `isPast` (→ `completed`) = `civilDate(event_date,"UTC") < todayCivil(tzFromCoords(lat,lng))`
  (reuse 002's tz-based past check — coords are mandatory on events).

**Ba'al Tefila is display-only**: it never gates `ready`. Only ≥10 + Sefer Torah + Ba'al Korei (on
a Shabbat-Shacharit event) gates `ready`.

The **full SC-004 decision table (24 rows)** is the test oracle — enumerated in
[data-model.md](./data-model.md#sc-004-readiness-decision-table). **Alternatives rejected**: stored
status (drift).

## R5 — Roles via `event_role`, claimed atomically (D9, FR-009)

**Decision**: `event_role(id, event_id, role, user_id)` `UNIQUE(event_id, role)`. Claim =
**`db.insert(...).onConflictDoNothing().returning()`** — an **empty array means already taken** →
`role.already_claimed` (mirrors the length-check on `stayRepository.cancelStay`'s
`UPDATE…RETURNING`). Release = `DELETE WHERE event_id+role+user_id`. A user may hold both roles.
Caller must be committed (`not_committed` otherwise). **Rationale**: insert-with-unique is a clean
compare-and-set, no interactive tx, generalizes. **Alternatives rejected**: nullable FK columns on
`minyan` (minyan-specific, doesn't generalize); the "catch the unique-violation" variant (opaque
D1 error) — **removed**; commit to the `.onConflictDoNothing().returning()` empty-array path only.

## R6 — Commitment & concurrency (D3/D9, FR-004) — D1 reality

**Decision**: `commitment(id, event_id, user_id, num_men, stay_id?)` `UNIQUE(event_id, user_id)`;
duplicate insert → `commitment.duplicate`. `num_men` bounds **1..50** enforced by a **net-new**
shared-Zod rule. **Verified**: 002's `numMen` has only `.min(1)` (`schemas/stay.ts`) — there is
**nothing to "mirror"**; this is new (`party_size.invalid`, added to `ERROR_CODES`, R13).
Change = update `num_men`; withdraw = delete + recompute + release held roles.

**`db.batch` is NOT a transaction** (verified — only existing batch is `userRepository`'s plain
deletes): it pipelines statements with no rollback on partial failure, and does **not** give usable
cross-statement `RETURNING`. Therefore **host-create** (D11) = `db.batch([insert event, insert
minyan, insert host commitment])` for ordering, and the returned `OwnerMinyanDTO` is **assembled
from the validated inputs + generated ids**, not from batch RETURNING. **Alternatives rejected**:
read-then-insert (race); a counter column on `event` (drifts/races).

## R7 — Live counts via polling (D5, SC-002)

**Decision**: discovery + minyan-detail TanStack Query hooks use `refetchInterval` (8 s discovery /
5 s detail), `refetchOnWindowFocus`, `refetchIntervalInBackground:false` (pause when tab hidden),
and `refetchInterval` returns **`false` once `status ∈ {completed,cancelled}`** (stop polling dead
minyanim). Mutations `invalidate` the relevant keys (`["discovery",params]`, `["event",id]`) —
extends 002's `onSettled: invalidateQueries` pattern in `lib/stays.ts`. **Rationale**: zero new
infra; bounded read load. **Alternatives rejected**: Durable Object + WebSocket (new binding/cost;
web push is v2); D1 cannot push.

## R8 — Notifications: sync in-app row + deferred email, idempotent (D6, SC-003) — seam defined

**Verified gaps**: (1) the route→controller→service chain threads only `(db,userId,…)` — **no
`executionCtx`**; `waitUntil` has no seam. (2) `lib/email.ts#sendEmail({to,subject,html})` is
**Hebrew-only, single-template, not injectable, no try/catch**. Both must be addressed; this is
**net-new**, not reuse.

**Decision**:
- **Context seam**: thread a small `Ctx = { db, env, log, defer }` from each mutating route into
  controller/service, where `defer = c.executionCtx.waitUntil.bind(c.executionCtx)`. Services that
  notify take `Ctx`.
- **Crossing detection**: after the authoritative write, recompute status, diff prev→new, and write
  the **in-app `notification` rows synchronously in the same request** (they're cheap D1 inserts and
  are the source of truth). Only the **email send** is deferred via `defer(...)`.
- **Idempotency**: a `notification_event_log` `UNIQUE(event_id, kind, threshold)`; insert via
  `onConflictDoNothing().returning()` — only a newly-inserted row triggers fan-out. A downward
  crossing (R9) deletes the matching row so a genuine re-cross re-fires. Fires **exactly once** per
  crossing despite oscillation around 10.
- **Localized email (net-new)**: a backend `notification-email.ts` map keyed by `lang` (`he`/`en`)
  with the 4 templates (`quorum_reached`, `near_quorum`, `quorum_lost`, `cancelled`) — subject +
  body — read from `user.language` (column exists, default `he`). Email **copy lives in the backend
  template map, NOT the FE react-i18next bundle**. Built on a language-driven `shell()` (dir/lang).
- **Injectable + resilient**: refactor `sendEmail` behind an `EmailSender` interface on `Ctx.env`
  (or `vi.mock("../lib/email")` capturing `{to,subject,html,lang}`) so SC-003 is assertable; wrap
  each per-recipient send in try/catch, **log and continue** (one bad address never aborts the
  fan-out). In-app row is authoritative; email is best-effort.

**Rationale**: meets the 1-min SLA without a queue; the request stays fast; exactly-once + resilient.
**Alternatives rejected**: inline blocking send; Cloudflare Queues (new binding/consumer — beyond
v1); no-dedupe (flapping spam).

## R9 — Bidirectional recompute, lifecycle & Stay reconciliation (D10/11/12/14, FR-005/013/014/015)

**Decision**: every readiness-affecting mutation (commit, withdraw, change size, claim/release role,
**host edit incl. Sefer Torah toggle via `PATCH /api/events/:id`** — R-contracts, host cancel,
Stay-driven auto-withdraw) recomputes derived status. A **down** crossing (≥10→<10 or losing
Torah/Korei on a ready minyan) deletes the matching `notification_event_log` row(s) and fires
`quorum_lost` (deduped). `completed` is derived (R4). Host cancel → `status='cancelled'` + `db.batch`
voiding commitments/roles → fan out `cancelled`; cancelling an already-cancelled event is
**idempotent** (no re-fan-out).

**Stay reconciliation call-site (cross-feature edit — explicit)**: 002's
`stayService.cancelStay`/`updateStay` will **call `commitmentService.reconcileCommitmentsForStay(ctx,
stayId)`** after their write (002 service importing a 003 service — the cleaner dependency
direction). It auto-withdraws commitments whose linked Stay no longer **covers the event's date**
(coordinate moves do **not** trigger withdrawal in v1 — D12 literal), notifies the user, and
recomputes. Commitments with no `stay_id` are untouched. **This adds `stayService.ts` to the
files-to-modify.** **Alternatives rejected**: DB cascade for soft Stay-cancel (it's a status change,
not a delete — must be app logic); one-way status.

## R10 — Three-tier privacy DTOs (D4, FR-011/SC-005)

**Decision**: three Minyan shapes in `packages/shared`: `PublicMinyanDTO` (address + contact
**structurally absent**), `ParticipantMinyanDTO` (adds address + host contact + participant
names/phones), `OwnerMinyanDTO`. The controller selects by the caller's relationship (host /
committed / other), computed from `commitment` membership (one extra read on detail; discovery list
always uses `PublicMinyanDTO`). Share + pre-auth join use `PublicMinyanDTO`. **Rationale**:
structural absence makes a leak impossible (SC-005), proven by a non-exposure test (002 T030).
**Alternatives rejected**: single DTO with runtime field-stripping (002 rejected this).

## R11 — Auth-agnostic join deep-link + optional-auth reads (D13, FR-012)

**Verified**: every 002 route uses `requireUserId` (throws 401); the only public route is
`routes/calendar.ts` (no session). **Decision**: add an **`optionalUserId(c): string | null`**
helper (never throws). `GET /api/events/:id` and the discovery reads use it: unauthenticated →
`PublicMinyanDTO` + sign-in CTA; the share/join URL is `/minyan/:id` (public id), routed through
sign-in (**Google or email/password**) preserving a redirect (reuse `lib/redirect.ts`).
**Alternatives rejected**: Google-only flow (violates ROADMAP decision 8); details in URL (leak).

## R12 — Map, Beit Chabad, moderation seam, filters, grouping & conflict (D14/16–20)

- **Map/tiles** (D20): reuse 002 MapLibre + MapTiler tiles + ODbL attribution; geocoding via the
  existing `/api/geo/*` proxy.
- **Beit Chabad** (D18): `beit_chabad_pin` table (admin-curated, not user-owned), source-decoupled;
  manual seed if licensing unresolved.
- **Moderation seam** (D19): `event.hidden` boolean (default false) excluded from discovery; a
  `flag` affordance writes a `flag` row (`UNIQUE(event_id,user_id)`). The 3-flag auto-hide threshold
  + moderation UI are **Feature 006**.
- **Filters** (D16/D17): `nusach` (`'any'` matches every filter and always appears); `seferTorah`
  **present+true = only-with-Torah, absent = no filter** (`false` is ignored); date range. SQL
  `WHERE` on indexed columns.
- **Place grouping** (D3/FR-003): discovery returns a flat `minyanim[]`; the **client groups by
  rounded coordinates** — proximity key = `(round(lat,4), round(lng,4))` (~11 m; planning constant).
- **Commitment conflict** (D14): v1 conflict = the caller already has an active commitment on the
  **same `event_date`** (same Shabbat/day — gathering model). Soft, non-blocking; uses the
  `commitment.user_id` index.

## R13 — Error codes & shared enums (FR-004/006/009/016)

New keyed codes added to `packages/shared/src/errors.ts` `ERROR_CODES` (verified absent today):
`commitment.duplicate`, `commitment.conflict`, `role.already_claimed`, `minyan.cancelled`,
`minyan.completed`, `party_size.invalid`, `not_committed`. New shared **Zod enums** (SSOT, mirroring
`StayStatusSchema`): `tefilla` (`shacharit|mincha|maariv`), `nusach`
(`ashkenaz|sefard|chabad|mizrachi|any`), `role` (`baal_tefila|baal_korei`), `notificationKind`
(4 values), `eventType` (`minyan`). `eventTime` validated by `/^([01]\d|2[0-3]):[0-5]\d$/`.

## R14 — Structured logging (constitution)

Named log events via the request logger (`c.get("log")`, threaded on `Ctx`): `discovery.query`
(`durationMs, bboxCount, minyanimCount`), `event.hosted`, `commitment.changed` (`delta, committedMen`),
`notification.fanout` (`eventId, kind, recipientCount`), `notification.idempotent_skip`,
`notification.email_failed` (`recipient, err`). **Rationale**: SC-001 latency + the fan-out are the
two new heavy paths and must be observable; services currently don't receive the logger — `Ctx`
fixes that (R8).

## R15 — Discovery aggregation: one grouped query, not N+1 (SC-001/SC-002)

**Decision**: discovery computes counts in a **single grouped query**
(`SELECT event_id, SUM(num_men) AS men FROM commitment WHERE event_id IN (…) GROUP BY event_id`)
joined to the bounded event list, plus one batched `event_role` fetch for readiness — **not** a
per-event aggregate. The FR-019 dashboard "N near this stay" uses a **single batched count endpoint**
(`/api/discovery/near-stay-counts` or a `count` field on the stays list), never one request per
card. **Rationale**: with tens–hundreds of minyanim × a 5–8 s poll × many viewers, per-event
aggregates would swamp D1 reads against SC-001/SC-002. **Alternatives rejected**: per-event
`SUM`/readiness queries (N+1, the original draft's implicit shape).

## Planning constants (centralized in shared config — tunable)

radius 15 km · near-quorum threshold 8/10 · party-size 1..50 · place-grouping coord rounding 4 dp ·
discovery poll 8 s / detail poll 5 s. Beit Chabad licensing remains a ROADMAP open item (build
source-agnostic, D18). **Pre-launch: no real data → migrations may drop/recreate freely.**
