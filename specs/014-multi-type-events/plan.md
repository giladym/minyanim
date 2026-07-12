# Implementation Plan: Multi-type events (hosting, gatherings, occasions)

**Branch**: `014-multi-type-events` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-multi-type-events/spec.md`

## Summary

Generalize the already-generic `event` model (003 D21: an `event` row + a 1:1 `type` detail table)
from a single `minyan` type to **two behavior classes — minyan + gathering — with an extensible
user-facing category for gatherings** (`hosting` + `social` in v1; `learning`/`celebration` are
model-ready fast-follows), a **generalized RSVP/attendance model**, a cross-cutting **occasion** tag,
and per-event **RSVP mode / visibility / capacity**. The flagship mission flow is a
**hosting-category gathering** that opens seats to travelers with **request-and-approve** and a
**waitlist**; a **social gathering** is a lighter open-RSVP get-together. Discovery surfaces all kinds
near a Stay, filterable by kind (type + category) and occasion. The shipped **minyan** flow (host →
commit → quorum → readiness → cancel, tiered address reveal, 013 location guard) MUST NOT regress — it
is the flagship event type and the P1 regression story (US4/SC-005) gates the release.

Technical spine (grounded in the real code seams): widen `EventTypeSchema` to
`minyan|gathering` + add `CategorySchema` (`hosting|social|learning|celebration`; v1 builds
hosting+social); add ONE sibling 1:1 detail table `gathering` (`event_id`, category-discriminated
`attrs` JSON) + an `event.category` column (migration 0014); add a
generalized attendance model + `event.occasion`/`rsvp_mode`/`visibility`/`capacity`/`start_time`/
`end_time`/`rsvp_cutoff` columns; make a **per-behavior strategy** (exactly TWO entries: minyan,
gathering) the single branch point for the pieces that are genuinely behavior-specific (readiness
derivation, detail insert/read, discovery projection, join semantics, `hostSelfAttends`), with a small
data-level `CATEGORY_META` map in `packages/shared` (label key, icon, `defaultRsvpMode` per category)
carrying the category config. Everything already type-agnostic — roles/notifications/moderation/media
(`kind:"event"`)/the `Ctx` seam/the tiered DTO gating rule — is reused, not rebuilt. **The
attendance-model decision (R2) was resolved by the Architect/PM validation loop: Option A — generalize
`commitment` into a unified `attendance` table (status + party_size); a minyan is an open-mode event
whose host self-attends and whose attendances are always `confirmed`, so its behavior is unchanged
(SC-005). See [validation-report.md](./validation-report.md) for the decision, the 13-site
confirmed-predicate audit checklist (the `getCommitment` reveal-gate is the SC-003 leak site), and the
corrected capacity/waitlist state machine (party-size-sum capacity; per-`rsvp_mode` promotion; RSVP
cutoff; host-not-a-seat).** The request-flow notifications (seat_requested / request_approved /
request_declined) go in-app AND by email (he/en, deep-linked — FR-014), and a "My events" surface
(FR-017, `GET /api/me/events`) gives hosts a reliable path back to the pending-requests queue — the
async re-engagement loop is in v1 scope.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 (Wrangler v4) — unchanged from 001–013.

**Primary Dependencies**: Hono (plain routes + manual Zod `safeParse`, DTOs via `*.parse()` before
`c.json()` — the real house pattern), Drizzle ORM + drizzle-kit, Zod v4, better-auth
(session/ownership), TanStack Router + Query (polling via `refetchInterval`), react-i18next, Tailwind
v4 (logical props, RTL), MapLibre GL JS (reuse the lazy discovery map). Reuses: tiered
address/contact visibility (`eventService.withRosterFields`), moderation (`moderationService` +
polymorphic `flag.contentType='event'`), active-user enforcement (`assertUserActive`), images
(`kind:"event"`), in-app messaging (008), notification fan-out (`notificationService` +
`notification_event_log` idempotency ledger + `ctx.defer`), the `Ctx` seam (`lib/context.ts`).
**No net-new infra binding** (no Queues/DO/WebSockets) — the existing polling + `waitUntil` model
covers the new flows.

**Storage**: Cloudflare D1 (SQLite) via Drizzle. Migration **0014**: new columns on `event`
(`category`, `occasion`, `rsvp_mode`, `visibility`, `capacity`, `start_time`, `end_time`,
`rsvp_cutoff`); ONE new detail table `gathering` (`event_id`, `attrs` JSON — no `meal` table; hosting
is a gathering category); the generalized attendance model (final shape per research R2). **Pre-launch: no real data —
destructive/recreate migrations are acceptable; favor the simplest correct path (dev-no-real-data).**
Remote dev D1 must be migrated on deploy (`pnpm db:migrate:remote`; CI does NOT auto-migrate).

**Testing**: vitest-pool-workers (backend: per-behavior readiness/join decision tables; hosting
request→approve→confirm; **capacity + waitlist promotion concurrency** (unique-constraint /
compare-and-set, the SC-006 no-overbook guarantee); occasion+kind discovery filtering;
address-leak DTO non-exposure per type (SC-003); cascade-orphan extended to `gathering`/
attendance; **minyan regression** decision-table unchanged). Vitest + Testing Library (FE: kind-aware
create flow, discovery filters, hosting request/approve panel, RSVP/waitlist states). Playwright +
axe-core (e2e + WCAG 2.1 AA: create-hosting-event → discover → request → approve → address-reveal;
minyan regression e2e; `GEO_MODE=mock`). **Run the backend suite in small batches** (vitest-pool-workers
port exhaustion, per project memory).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo (`apps/frontend`, `apps/backend`, `packages/shared`).

**Performance Goals**: create a hosting event in < 3 min (SC-001); traveler find→request→approve→address in one
session (SC-002); discovery query p95 < 2 s (reuses the bounded-box scan over `event_lat_lng_idx` +
`event_status_type_date_idx`); RSVP/seat state reflected ≤ ~8 s via existing polling;
request/approve/waitlist notifications ≤ 1 min via `ctx.defer` fan-out.

**Constraints**: RTL/Hebrew-first; WCAG 2.1 AA (type/occasion filter controls, request/approve panel,
`aria-live` seat-count + status changes); i18n-only strings (keyed codes, he+en, parity-tested);
tokens-only colors (Heritage Voyage); secrets via `env` bindings only; **D1 has no interactive
transactions** — capacity/waitlist correctness via unique constraints + atomic conditional writes /
`db.batch` (the 003 R6 pattern); **exact address/entry-notes/contact never in a non-confirmed DTO for
any type** (SC-003, same structural invariant as minyan). Minyan behavior byte-for-byte unchanged
(SC-005).

**Scale/Scope**: v1 tens–hundreds of events per active area (no pagination). 4 user stories (3 P1,
1 P2/regression); ~9–11 API endpoints (create/update/cancel per type via the generic `/api/events`
surface; a request/approve/decline attendance surface; discovery filter params; `GET /api/me/events` —
the FR-017 "My events" feed). 1 new detail table
+ attendance changes + 8 new `event` columns (incl. `category`); email templates for the request flow
(seat_requested/request_approved/request_declined, he/en); frontend: a kind-picker create flow,
kind/occasion discovery filters, a hosting request/approve panel (`RequestsPanel` — any approval-mode
gathering), generalized RSVP/waitlist UI, and a "My events" surface (dashboard/profile entry with
pending-request badges) — all additive to the
existing `events`/`discovery` feature modules, leaving the minyan surfaces intact.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 (5 principles + Architecture & Engineering Standards):

| Gate | Status | Notes |
|------|--------|-------|
| Hebrew-first / RTL | ✅ | All new copy (event kinds, occasions, hosting fields, RSVP states) he+en, parity-tested; logical props only; user-facing kind names localized (מניין / אירוח / מפגש lead). |
| Accessibility WCAG 2.1 AA (non-negotiable) | ✅ | Filter controls keyboard-reachable + labeled; request/approve actions have accessible names; `aria-live` for seat-count/status; axe in e2e. |
| Mobile-first | ✅ | Kind-picker + hosting form + requests panel built at 375 px first; ≥44 px touch targets; the create flow is a single scrollable column. |
| Edge-first performance | ✅ | Discovery reuses the indexed bbox scan (`event_status_type_date_idx` already keyed `(status,type,eventDate)`); no new round-trip patterns; polling not push. |
| Simplicity / YAGNI | ✅ | Reuses the 003 `event` + 1:1 detail pattern (one new column set + one detail table + one attendance model); categories are data (`CATEGORY_META` + attrs variants), not a plugin framework. Invite-mode is model-scaffolded only, UI deferred (spec assumption). |
| Two-app monorepo, layered backend | ✅ | New gathering/attendance logic lands in the existing router→controller→service→repository layers; the per-behavior strategy is a plain two-entry function map, not a new layer. |
| Contract-first (shared Zod → FE + DTOs) | ✅ | Widened `EventTypeSchema`, plus `OccasionSchema`, `RsvpModeSchema`, `VisibilitySchema`, `CategorySchema`, the per-category `ATTRS_BY_CATEGORY` schema map + `GatheringAttrs` union + `CATEGORY_META` + `EVENT_KINDS`, generalized attendance DTOs + tiered event DTOs all in `packages/shared`; new error codes in `errors.ts`. |
| Secrets via `env` bindings only | ✅ | No new secrets; reuses Resend + MapTiler bindings. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse the 001 logger + `Ctx.log`; JSDoc on new exports; derived status/readiness per type stays a pure function. |
| No interactive D1 txns; verified cascade | ✅ | Capacity/waitlist via unique constraint + compare-and-set + `db.batch`; cascade-orphan test extended to `gathering`/attendance. |
| Server-side licensing rigor | ✅ | No new external data source; occasions are a fixed in-code enum (no third-party calendar dependency in v1). |

**Result**: PASS (no violations). Complexity Tracking table below is empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-multi-type-events/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions incl. R2 attendance-model alternatives
├── data-model.md        # Phase 1 — event columns (incl. category), gathering detail, attendance, occasion
├── quickstart.md        # Phase 1 — runnable validation scenarios (hosting happy path + regression)
├── contracts/
│   └── api.md           # Phase 1 — generic /api/events surface + attendance/request-approve
├── design/              # UX design doc (this feature) — see design/DESIGN-SYSTEM.md for tokens
│   └── ux.md
├── checklists/
│   └── requirements.md  # already PASS
└── tasks.md             # Phase 2 (/speckit-tasks) — generated after the validation loop
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/
│   ├── event.ts         # WIDEN: EventTypeSchema (minyan|gathering); add Category/Occasion/RsvpMode/
│   │                    #        Visibility, capacity; per-category ATTRS_BY_CATEGORY schema map +
│   │                    #        GatheringAttrs union + CATEGORY_META + EVENT_KINDS (the ONE
│   │                    #        kind→(type,category) map: minyan→{type:'minyan',category:null,
│   │                    #        labelKey,icon}, hosting/social→{type:'gathering',category,…} —
│   │                    #        read by the FE picker, discovery chips, ?kind= deep links, and
│   │                    #        server default-resolution; CATEGORY_META alone has no minyan
│   │                    #        entry); generalized event DTOs
│   ├── attendance.ts    # NEW (or generalize commitment.ts) — final per research R2
│   └── index.ts         # barrel: export the new module
└── errors.ts            # NEW codes: rsvp.*, capacity.full, request.*, occasion.invalid, event.type_invalid, category.invalid, gathering.attrs_invalid

apps/backend/src/
├── db/schema.ts         # event columns (incl. category); gathering table (event_id, attrs JSON); attendance (per R2)
├── repositories/
│   ├── eventRepository.ts   # generalize SELECT_JOINED + createEventBatch (per-type detail); listEventsInBbox
│   └── attendanceRepository.ts  # request/approve/decline/promote; capacity compare-and-set
├── services/
│   ├── eventService.ts      # per-type create/read; buildPublic parameterized by type
│   ├── attendanceService.ts # request/approve/decline; waitlist promotion; capacity guard
│   ├── discoveryService.ts  # surface all types; type+occasion filter
│   └── notificationService.ts  # new kinds: seat_requested, request_approved/declined, waitlist_promoted; type-aware URL
├── lib/
│   └── eventStrategy.ts     # NEW — per-behavior map, exactly TWO entries (minyan = today's minyanStatus; gathering = capacity/RSVP); category config lives in shared CATEGORY_META
├── controllers/eventController.ts   # + attendance controllers
└── routes/events.ts         # + /events/:id/requests, /events/:id/requests/:id/{approve,decline}

apps/frontend/src/
├── features/events/
│   ├── HostEventForm.tsx    # generalize HostMinyanForm: kind picker → branch fields (minyan branch = today)
│   ├── EventDetail.tsx      # generalize MinyanDetail: kind-driven hero/CTA (minyan branch unchanged)
│   ├── RequestsPanel.tsx    # NEW — host approve/decline list (any approval-mode gathering); guest request/waitlist state
│   └── ...                  # RolesSection/quorum stay minyan-only branches
├── features/discovery/
│   ├── DiscoveryPage.tsx    # + kind (types+categories) + occasion filters (nusach/seferTorah become minyan-only sub-filters)
│   └── DiscoveryMap.tsx     # per-kind pin styling
├── lib/events.ts            # + attendance hooks (useRequestSeat/useApprove/useDecline)
└── i18n/locales/{he,en}.ts  # new namespaces: eventKind, occasion, hosting, social, rsvp
```

**Structure Decision**: Web two-app monorepo (Option 2). No new top-level directories. All changes
are additive extensions of the existing `events`/`discovery` feature modules and the shared contracts;
the minyan code paths become the `type==='minyan'` branch of the two-entry per-behavior strategy so
they are structurally unchanged.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
