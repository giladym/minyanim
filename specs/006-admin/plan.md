# Implementation Plan: Admin — Moderation, Curation & Metrics

**Branch**: `006-admin` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-admin/spec.md` (US1 flag; US2 auto-hide at 3;
US3 moderation queue + actions; US4 Beit Chabad curation; US5 metrics; FR-001..009; SC-001..005).

## Summary

Deliver v1 admin moderation, curation, and metrics **on top of the already-shipped 010 admin
foundation** — do **not** rebuild auth. 010 gives us `requireAdmin` (env `ADMIN_EMAILS` allowlist →
idempotent `user.is_admin` promotion), the `/api/admin/*` router (`routes/admin.ts` + `GET
/api/admin/me`), and the `/admin` frontend shell (`AdminLayout.tsx` + `useAdminMe`). 006 mounts its
routes and screens on that surface.

Three still-needed pieces:

- **Moderation input (US1/US2)** — 003 already ships a `flag` table (unique `(event_id, user_id)`,
  idempotent `flagEvent`), an `event.hidden` column (honoured in `eventService.getMinyan` → 404 to
  non-hosts), and a `FlagButton`. 006 (a) adds a `reason` to flags, (b) **generalizes the flag to a
  polymorphic `(content_type, content_id)`** so a Stay can be flagged too — which requires a
  `stay.hidden` column and a discovery-list filter on it, and (c) implements the **3-distinct-reporter
  auto-hide** the 003 flag path deliberately deferred.
- **Moderation review + sanctions (US3)** — `user` gains a `status` (`active`/`suspended`/`banned`)
  + optional `suspended_until`; an admin queue lists flagged/hidden content ordered by urgency;
  actions are dismiss(restore) / remove / warn / suspend / ban; suspended/banned users are blocked
  from create/host/commit; and the **last active admin can never be suspended/banned** (FR-009).
- **Metrics (US5)** — one admin metrics endpoint + view with v1 counts (users, stays, minyanim,
  quorum funnel, flags/hidden, top locations).

**US4 (Beit Chabad curation) is already delivered by 010** — its `AdminPlacesManager` CRUDs places,
including the "Chabad houses" layer. 006 does **not** re-implement a separate Chabad CRUD; the plan
records US4 as covered, with a pointer that fully retiring the standalone `beit_chabad_pin` table is
**011** (out of scope here).

Technical spine: a `flag.reason` + polymorphic `content_type`/`content_id` reshape and a
`stay.hidden` + `user.status`/`suspended_until` migration (one migration, next number `0011`); a new
`moderationService`/`moderationRepository` + `moderation` routes mounted on the admin surface (thin —
no controller, mirroring `routes/admin.ts`/`routes/messages.ts`); an auto-hide count-distinct rule
invoked from the flag path; a `metricsService` + endpoint; an enforcement read of `user.status` on the
create/host/commit paths; and frontend `ModerationQueue.tsx` + `AdminMetrics.tsx` tabs under the
existing `/admin` shell. No cron, no new runtime deps.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 — unchanged.

**Primary Dependencies**: Hono, Drizzle, Zod v4, better-auth (`additionalFields` for the new
`user.status`/`suspendedUntil`, mirroring `isAdmin`/`sharePhone`), TanStack Router/Query,
react-i18next, Tailwind v4. Reuse `lib/auth.ts` (`requireAdmin`, `requireUserId`), the 003
`flagRepository`, `eventService` hidden-handling, `stayService`/`discoveryService`. **No new runtime
deps.**

**Storage**: Cloudflare D1 (SQLite) via Drizzle. **No new table** (the existing `flag` table is
reshaped in place — pre-launch, destructive migration approved per MEMORY `dev-no-real-data`). One
migration (`0011_*.sql`) carries: `flag` → drop `event_id` FK-column, add `content_type` +
`content_id` + `reason` + optional `reported_user_id`, new unique `(content_type, content_id,
user_id)`; `stay` += `hidden` (boolean, default false); `user` += `status` (text default `active`) +
`suspended_until` (timestamp, nullable). Assign the real number at `db:generate` time; **apply to
remote dev on deploy** (`pnpm db:migrate:remote` — CI/Workers Builds do NOT auto-migrate).

**Testing**: vitest-pool-workers (auto-hide at the 3rd *distinct* reporter, idempotent; stay + event
flag with reason; queue projection + ordering; each action's state transition; enforcement blocks a
suspended/banned user from create/host/commit; last-admin guard rejects; metrics counts). Vitest +
Testing Library (queue rows + action buttons, metrics cards, flag-reason picker). Playwright + axe
(moderation queue + metrics WCAG 2.1 AA under the `/admin` shell).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo.

**Performance Goals**: auto-hide visible "within seconds" (SC-001) — synchronous count-distinct in the
same request as the 3rd flag, no cron. Queue + metrics reads p95 < 200 ms (indexed aggregate scans;
human-scale admin volume). Admin action → visible restore/hide within one request (SC-003/SC-004).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA; i18n-only strings; tokens-only colors; secrets via
`env` only. All admin surfaces behind `requireAdmin` (403 non-admin, 401 signed-out); the public flag
endpoints require an authenticated user only. FR-009: never zero active admins — enforced in the
sanction service, not the UI. FR-008: admin actions logged via the structured logger (auditable).

**Scale/Scope**: 5 user stories (US4 done via 010); 1 migration; 1 flag reshape; 1 new service +
repository + routes group on the admin surface; enforcement touch-points on create/host/commit; 2
frontend admin tabs; i18n. Founder-scale admin volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ | New `moderationService`/`moderationRepository` + `metricsService`; thin admin routes skip a controller (mirrors `routes/admin.ts`/`routes/messages.ts`). Reuses `flagRepository`, `eventService`, `stayService`. |
| Contract-first (shared Zod → DTOs + FE) | ✅ | `flagContentSchema` (with `reason`), `ModerationQueueEntryDTO`, `SanctionInput`, `AdminMetricsDTO` in `packages/shared`; new error codes there. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | Queue + metrics tabs axe-verified under the `/admin` shell; RTL. |
| i18n-only strings, tokens-only colors | ✅ | New he/en keys (`admin.moderation.*`, `admin.metrics.*`, `flag.reason.*`); no hardcoded colors. |
| Secrets via env bindings only | ✅ | No new secrets; admin identity via the existing `ADMIN_EMAILS` allowlist. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Every admin action logged with actor + target (FR-008 audit). Thin routes; no speculative abstraction. |
| Edge-first, no high-latency round trips | ✅ | Synchronous in-D1 count-distinct + aggregate reads; no cron, no external calls. |
| Least-privilege / access control | ✅ | Every moderation/metrics route behind `requireAdmin` (403/401); flag endpoints behind `requireUserId`; FR-009 last-admin guard in the service. |

**Result**: PASS — no deviations. Notable additions are all deliberate + in-scope: a `user.status`
sanction field (mirrors the `isAdmin`/`sharePhone` `additionalFields` pattern), a polymorphic flag
reshape, and a `stay.hidden` column paralleling the existing `event.hidden`. No Complexity Tracking
entries.

## Project Structure

### Documentation (this feature)

```text
specs/006-admin/
├── plan.md            # This file
├── spec.md            # The feature (source of truth)
├── data-model.md      # Phase 1 — flag reshape, stay.hidden, user.status, auto-hide rule, migration
├── contracts/
│   └── api.md         # Phase 1 — moderation queue/actions, user sanctions, metrics, updated flag
└── tasks.md           # Phase 2 — phased T0## tasks
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/moderation.ts        # NEW: flagContentSchema { contentType: z.enum(["stay","event"]), reason: z.enum(["spam","inappropriate","fake","other"]), reportUser?: boolean }; ContentType, FlagReason types; ModerationQueueEntryDTO, ModerationActionInput (dismiss|remove); SanctionInput { action: z.enum(["warn","suspend","ban","reinstate"]), suspendDays?: number }; UserStatus = z.enum(["active","suspended","banned"])
├── schemas/metrics.ts           # NEW: AdminMetricsDTO (TS interface — counts + funnel + top locations, hand-built like stay DTOs)
├── errors.ts (extend)           # add ADMIN_LAST_ADMIN "admin.last_admin", USER_SUSPENDED "user.suspended", USER_BANNED "user.banned", FLAG_TARGET_INVALID "flag.target_invalid"
└── schemas/index.ts (extend)    # export the new schemas

apps/backend/src/
├── db/schema.ts (extend)        # flag: replace eventId with contentType/contentId + reason + reportedUserId, unique (contentType,contentId,userId); stay += hidden (boolean default false); user += status (text default 'active') + suspendedUntil (timestamp nullable)
├── auth.ts (extend)             # register status + suspendedUntil in better-auth user.additionalFields (input:false — set only by the sanction service; mirror isAdmin)
├── ../migrations/0011_*.sql     # NOTE: apps/backend/migrations/ (drizzle out). Reshape flag + ADD COLUMN stay.hidden + user.status + user.suspended_until. VERIFY the user/stay ALTERs are single ADD COLUMNs, not a PRAGMA rebuild (better-auth-owned user + FK-childed stay — same 004 caveat)
├── repositories/flagRepository.ts (extend)  # flagContent(db, contentType, contentId, userId, reason, reportedUserId?) idempotent on (contentType,contentId,userId); distinctReporterCount(db, contentType, contentId); contentExists(db, contentType, contentId)
├── repositories/moderationRepository.ts     # NEW: queue rows (flagged/hidden content grouped by (contentType,contentId) with reporter count, reasons, hidden flag), setContentHidden(db, contentType, contentId, hidden), clearFlags(db, contentType, contentId)
├── repositories/userRepository.ts (extend)  # widen updateUser fields to include status + suspendedUntil; activeAdminCount(db); setUserStatus helper
├── services/moderationService.ts # NEW: flagContent (reason + optional user report → after write, if distinctReporterCount>=3 setContentHidden idempotent → SC-001); getQueue (auto-hidden first, then by reporter count); dismiss (restore + clearFlags); remove (hide, keep flags); warn/suspend/ban/reinstate (FR-009 last-admin guard: block if target is an admin AND would leave 0 active admins); every action logged (FR-008)
├── services/metricsService.ts    # NEW: counts (users, stays, minyanim), quorum funnel (potential→hosted→quorum via event status), flagged/hidden counts, top locations
├── services/eventService.ts (reuse)   # hidden already honoured; no change beyond enforcement note
├── lib/enforcement.ts             # NEW (thin): assertUserActive(db, userId) → throws user.suspended (with suspendedUntil) / user.banned; auto-clears an expired suspension back to active. Called on create-stay, host-minyan, commit
├── routes/moderation.ts           # NEW: all behind requireAdmin — GET /api/admin/moderation; POST /api/admin/moderation/:contentType/:contentId/{dismiss|remove}; POST /api/admin/users/:id/{warn|suspend|ban|reinstate}; GET /api/admin/metrics. Mount in index.ts (app.route("/", moderation))
├── routes/events.ts (extend)      # POST /api/events/:id/flag → accept { reason, reportUser? } via flagContentSchema, delegate to moderationService.flagContent(contentType:"event"); host-minyan path calls assertUserActive
└── routes/stays.ts (extend)       # NEW POST /api/stays/:id/flag (auth'd user, contentType:"stay"); create-stay path calls assertUserActive

apps/frontend/src/
├── features/admin/ModerationQueue.tsx  # NEW: queue table (auto-hidden first), reason + reporter count, per-row dismiss/remove + per-user warn/suspend/ban; under the /admin shell tab
├── features/admin/AdminMetrics.tsx     # NEW: metric cards + funnel + top locations
├── features/admin/AdminLayout.tsx (extend) # add "moderation" + "metrics" tabs beside layers/places
├── lib/admin.ts (extend places.ts pattern) # useModerationQueue, useModerationAction, useUserSanction, useAdminMetrics queries/mutations
├── features/stays/StayCard.tsx (extend)     # FlagButton for a Stay (reason picker) — mirrors MinyanDetail's; show "under review" when hidden
├── features/events/MinyanDetail.tsx (extend)# FlagButton gains the reason picker
└── i18n/locales/{he,en}.ts (extend)         # admin.moderation.*, admin.metrics.*, flag.reason.*, sanction.*, user status banners

app router (apps/frontend/src/routes or route tree)
└── /admin/moderation + /admin/metrics       # child routes of the existing /admin shell
```

**Structure Decision**: Web two-app monorepo (unchanged). All new backend logic mounts on the 010
admin surface (`requireAdmin`, `/api/admin/*`); the frontend adds tabs to the existing `AdminLayout`.
The 003 flag path is generalized rather than duplicated. All contracts in `packages/shared`.

## Phasing

- **Phase 1 — Foundational**: shared schemas + error codes; `flag` reshape (reason + polymorphic
  `content_type`/`content_id` + optional `reported_user_id`); `stay.hidden`; `user.status` +
  `suspended_until`; `auth.ts` additionalFields; migration `0011` (generate → verify single ALTERs →
  apply local). Widen `userRepository.updateUser`. BLOCKS the stories.
- **Phase 2 — US1 + US2 (P1, MVP)**: flag-with-reason for **both** Stay and Minyan (idempotent per
  reporter); optional user report; the auto-hide-at-3-distinct rule (`setContentHidden`, idempotent,
  SC-001); discovery-list filter on `stay.hidden`; FlagButton reason picker + "under review" state.
- **Phase 3 — US3 (P1)**: moderation queue (auto-hidden first) + actions (dismiss/remove/warn/
  suspend/ban/reinstate); enforcement (`assertUserActive` on create/host/commit; suspension auto-
  expiry); FR-009 last-admin guard; `ModerationQueue.tsx` tab. All behind `requireAdmin`.
- **Phase 4 — US5 (P3)**: `metricsService` + `GET /api/admin/metrics` + `AdminMetrics.tsx` tab.
- **US4 — done via 010**: no implementation. The `AdminPlacesManager` (010) already CRUDs the Chabad
  layer (SC-004 satisfied through places). Retiring the standalone `beit_chabad_pin` table is **011**.
- **Phase 5 — Polish**: i18n he/en parity; e2e + axe on the two new admin tabs; quickstart run.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
