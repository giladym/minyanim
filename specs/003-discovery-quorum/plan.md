# Implementation Plan: Discovery & Quorum Formation

**Branch**: `003-discovery-quorum` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-discovery-quorum/spec.md` (Clarified — D1–D22).

## Summary

The multiplayer layer over 002 Stays. A user opens a map + search discovery view, sees per-Shabbat
*potential* (men with overlapping Stays in a bounding-box area), **hosts a Minyan** at a precise
point, and others **commit**. Status (quorum/ready/completed) is **derived server-side**; a
Shabbat-morning Torah-reading minyan is "ready" only with ≥10 men + a Sefer Torah + a claimed Ba'al
Korei. Privacy uses three-tier DTOs (the address reveals to committed participants only). Email +
in-app notifications fire asynchronously on quorum events. The core gathering is persisted as a
**generic `event` (type=`minyan`)** so future event types are additive, not a rewrite (D21).

Technical spine: a new `event` + 1:1 `minyan` detail + `commitment` + `event_role` +
`notification` (+ idempotency ledger) + `beit_chabad_pin` schema in D1; potential aggregation via
a **bounding-box** query over a new `stay(lat,lng)` index with the tz-aware date filter applied to
the bounded subset (D1); **polling** (TanStack Query `refetchInterval`) for live counts — no new
infra; notifications fanned out via **`ctx.waitUntil`** through the existing Resend integration,
idempotent per threshold crossing.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 (Wrangler v4) — unchanged from 001/002.

**Primary Dependencies**: Hono (plain routes + manual Zod `safeParse`, DTOs via `*.parse()` before
`c.json()` — the real 002 pattern, D13), Drizzle ORM + drizzle-kit, Zod v4, better-auth
(session/ownership), TanStack Router + Query (Query drives polling — D5), react-i18next, Tailwind
v4, MapLibre GL JS (reuse 002's lazy-loaded map + MapTiler tiles/attribution — D20). Reuses 002's
`@photostructure/tz-lookup` (`tzFromCoords`/`civilDate`/`todayCivil` for the not-past/`completed`
check) + **two net-new tz-free helpers** (`isSaturday`, `shabbatSaturdaysInRange`) since the real
`coversShabbat` ignores tz and returns a range-boolean (R3). Email reuses Resend's transport but
needs **net-new localized templates** (`he`/`en`, keyed by `user.language`) behind an **injectable
`EmailSender`** — the existing `lib/email.ts` is Hebrew-only/single-template/not-injectable (R8). A
new **`Ctx` seam** threads `{db, env, log, defer}` (`defer = c.executionCtx.waitUntil`) into
mutating services — no such seam exists today (R8/R14). A new **`optionalUserId`** helper enables
the public join-link read (R11). **No new infra binding** (no Queues / Durable Objects / WebSockets
— D5/D6).

**Storage**: Cloudflare D1 (SQLite) via Drizzle. New tables: `event`, `minyan`, `commitment`,
`event_role`, `notification`, `notification_event_log`, `beit_chabad_pin`. New index on existing
`stay(lat,lng)` (the D15 geospatial seam). Single migration pipeline (`drizzle-kit generate` →
`wrangler d1 migrations apply`). **Pre-launch: no real data — destructive/recreate migrations are
acceptable; favor the simplest correct path.**

**Testing**: vitest-pool-workers (backend: discovery aggregation incl. bbox + tz date-overlap with
`vi.setSystemTime` + real tz-lookup; readiness **decision-table** test for SC-004; concurrency —
double-commit unique-constraint + concurrent role-claim; notification idempotency; cascade-orphan
extended to the new tables; privacy DTO non-exposure). Vitest + Testing Library (FE: discovery
list/filters, host form, commit flow, notifications inbox). Playwright + axe-core (e2e + WCAG 2.1
AA on the map/list/host/commit; `GEO_MODE=mock`). Email send is injected/mocked in tests.

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo (apps/frontend, apps/backend, packages/shared).

**Performance Goals**: discovery query p95 < 2 s (SC-001) — bounded-box scan over an indexed
`stay(lat,lng)` with tz filtering on the small bounded subset; commit/withdraw reflected ≤ 5 s via
~5 s polling (SC-002); notifications delivered ≤ 1 min via `waitUntil` fan-out (SC-003).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (map + list parity, keyboard-reachable pins,
`aria-live` count updates — FR-018/SC-007); i18n-only strings (keyed error codes); tokens-only
colors; secrets via env bindings (MapTiler geocoding key server-side, tile key public; Resend key a
secret); **D1 has no interactive transactions** — concurrency via unique constraints + atomic
conditional writes / `db.batch` (D9); private address never sent to the geocoder and structurally
absent from non-participant DTOs (D4/SC-005).

**Scale/Scope**: v1 tens–hundreds of Stays/Minyanim per active area (no pagination). 7 user
stories; ~14 API endpoints (discovery, events CRUD, commit/withdraw, roles, notifications, flag,
WhatsApp share is client-side); 6 new tables + 1 index; new frontend `discovery` + `events`
feature modules + a "Minyanim near this stay" entry point on the 002 dashboard (FR-019).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 (5 principles + Architecture & Engineering Standards):

| Gate | Status | Notes |
|------|--------|-------|
| Two-app monorepo, layered backend (router→controller→service→repository) | ✅ | Event/discovery/notification routes follow the same layering; aggregation + readiness + notification fan-out isolated in services. |
| Contract-first (shared Zod → FE validation + DTOs) | ✅ | `event`/`minyan`/`commitment`/role/notification schemas, 3-tier Minyan DTOs, and error codes all in `packages/shared`. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | FR-018/SC-007: map+list parity, keyboard pins, `aria-live`; axe in e2e. User-facing copy "מניין" (D21). |
| i18n-only strings, tokens-only colors | ✅ | Keyed codes; he/en for all new strings + notification email templates (recipient language, D6). |
| Secrets via `env` bindings only | ✅ | MapTiler geocoding key + Resend key as secrets; tile key public. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse 001 logger; derived status + polling + `waitUntil` over new infra. Generic `event` is one table + one detail, not a framework (D21). |
| No interactive D1 transactions; verified cascade | ✅ | Unique constraints + compare-and-set (D9); cascade-orphan test extended to all new tables. |
| Server-side licensing rigor | ✅ | MapTiler ToS (002, storage-permitting) reused; Beit Chabad data decoupled from source, manual seed if licensing unresolved (D18). |

**Result**: PASS — no deviations. The generic `event` model is a deliberate, user-approved
modeling choice (ROADMAP decision 10 / D21), not speculative complexity: one base table + one 1:1
detail, with commitments/notifications referencing the base. No Complexity Tracking entries
required.

## Project Structure

### Documentation (this feature)

```text
specs/003-discovery-quorum/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (D1–D22 + technical resolutions)
├── data-model.md        # Phase 1 — tables, DTOs, derivation, indexes
├── quickstart.md        # Phase 1 — end-to-end validation scenarios
├── contracts/
│   └── api.md           # Phase 1 — discovery / events / commit / roles / notifications endpoints
├── checklists/          # (existing)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/event.ts            # EventBase, CreateEventInput (type-discriminated), Minyan attrs,
│                               #   PublicMinyanDTO / ParticipantMinyanDTO / OwnerMinyanDTO
├── schemas/commitment.ts       # CreateCommitmentInput (numMen bounds D15), CommitmentDTO
├── schemas/discovery.ts        # DiscoveryQuery (bbox/city + date range + filters), DiscoveryResult
├── schemas/notification.ts     # NotificationDTO, kinds enum
└── errors.ts (extend)          # commitment.duplicate, role.already_claimed, minyan.cancelled, …

apps/backend/src/
├── db/schema.ts                # + event, minyan, commitment, event_role, notification,
│                               #   notification_event_log, beit_chabad_pin; + stay(lat,lng) index
├── routes/events.ts            # /api/events (host/get/cancel) + commit/withdraw + roles
├── routes/discovery.ts         # /api/discovery (potential + hosted minyanim, bbox + filters)
├── routes/notifications.ts     # /api/notifications (list/mark-read)
├── routes/flags.ts             # /api/events/:id/flag (affordance; 006 owns thresholds — D19)
├── services/discoveryService.ts# bbox derivation + tz date-overlap + Shabbat bucketing (D1/D2)
├── services/eventService.ts    # host, derived status/readiness (D7/D8), cancel cascade (D11)
├── services/commitmentService.ts# commit/withdraw/change, conflict warning (D14), recompute (D10)
├── services/roleService.ts     # atomic claim/release (D9), readiness recompute
├── services/notificationService.ts# crossing detection + idempotent fan-out (sync in-app + deferred email, R8)
├── services/stayService.ts (MODIFY)# 002 file: cancelStay/updateStay call reconcileCommitmentsForStay (D12/R9)
├── lib/context.ts (NEW)        # Ctx = {db, env, log, defer}; defer = c.executionCtx.waitUntil (R8)
├── lib/notification-email.ts (NEW)# he/en localized templates keyed by user.language; injectable EmailSender (R8)
├── lib/auth.ts (extend)        # + optionalUserId(c): string|null (public join-link read — R11)
└── lib/timezone.ts (extend)    # + isSaturday, shabbatSaturdaysInRange (tz-free, UTC-midnight convention — R3)

apps/frontend/src/
├── features/discovery/         # map+list, filters, potential view (FR-001/007/008/018)
├── features/events/            # host form, minyan detail, commit/withdraw, role claim, share
├── features/notifications/     # in-app inbox + unread badge
├── features/stays/ (extend)    # "Minyanim near this stay" entry point (FR-019)
└── lib/ (events, discovery, notifications TanStack Query hooks; polling refetchInterval — D5)
```

**Structure Decision**: Web two-app monorepo (unchanged). New backend route/service files per
concern (discovery, events, commitment, role, notification) under the existing layered structure;
new frontend feature modules (`discovery`, `events`, `notifications`) plus a small extension to the
002 `stays` dashboard. All contracts live in `packages/shared`.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
