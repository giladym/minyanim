# Implementation Plan: Stays — Create & Manage

**Branch**: `002-stays-create-manage` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-stays-create-manage/spec.md` (Status: Clarified
2026-06-19). Builds on **001 Platform Foundation**. Shared context: [ROADMAP](../ROADMAP.md),
[001 data-model](../001-platform-foundation/data-model.md),
[001 contracts](../001-platform-foundation/contracts/api.md).

## Summary

Add the **Stay** entity and its full CRUD on top of the 001 foundation: a search-first
Add-Stay form (server-side geocoding), a nearest-first "My Stays" dashboard (replacing the 001
placeholder), and edit/soft-cancel. The Stay is the product's core data unit and the dependency
for Features 003–005. Technical spine is unchanged from 001 — shared Zod contracts are the single
validation source for both the layered Hono backend (router→controller→service→repository) and the
TanStack frontend; D1 + Drizzle for storage; RTL/Hebrew-first Tailwind v4. Two 002-specific
technical decisions: (1) timezone-correct "not in the past" validation resolved **server-side**
from the destination's coordinates (or the client-timezone header when none), with only structural
rules in shared Zod; (2) **MapTiler** geocoding executed **server-side** behind `/api/geo/*`
(geocoding key a backend secret; the public map-tile key is referrer-restricted client-side), with
an always-available manual-entry fallback.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 (Wrangler v4) — unchanged from 001.

**Primary Dependencies**: Hono (plain routes + manual Zod `safeParse`, matching real 001 code —
D13; `@hono/zod-openapi` only for the app shell/Swagger), Drizzle ORM + drizzle-kit, Zod v4,
better-auth (session/ownership), TanStack Router + Query, react-i18next, Tailwind v4. **New**:
MapTiler Geocoding REST (server-side, Cache-API cached + rate-limited; Google Places a documented
revert, not a hot fallback); **`@photostructure/tz-lookup`** (offline, workerd-safe coords→IANA
tz — no network); **MapLibre GL JS** (OSS, no key lock-in) for the confirmation map (lazy-loaded;
import `maplibre-gl/dist/maplibre-gl.css`).

**Storage**: Cloudflare D1 (SQLite) via Drizzle. New `stay` table; reuses 001's single
migration pipeline (`drizzle-kit generate` → `wrangler d1 migrations apply`).

**Testing**: vitest-pool-workers (backend: service/repository + cascade-orphan integration;
temporal tests via `vi.setSystemTime` + real tz-lookup with date-line coords; injectable geo
provider). Playwright + axe-core (e2e + WCAG 2.1 AA on form/map/dashboard); geocoding mocked via a
backend `GEO_MODE=mock` env (Playwright can't intercept a server-side fetch). A setup task **adds
Vitest + Testing Library + jsdom** to `apps/frontend` (currently Playwright-only) for
form-validation/dashboard unit tests; Playwright still covers the full flows.

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo (apps/frontend, apps/backend, packages/shared).

**Performance Goals**: dashboard list p95 < 200 ms API (served by a `(user_id, arrival_date)`
index); first-Stay creation < 90 s end-to-end (SC-001); saved Stay visible < 2 s (SC-002/003).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA; i18n-only strings (keyed error codes); tokens-only
colors; secrets via env bindings only — the **geocoding** MapTiler key is a backend secret (never
client-side), the **tile** key is public + referrer-restricted (build-time Vite var); D1 has no
interactive transactions (002 writes are single-row); geocoding provider ToS must permit
persisting coordinates (MapTiler does — verify at integration); private address is never
geocoded.

**Scale/Scope**: single-user feature; tens of Stays per user (no pagination in v1). 3 user
stories (create / view+sort / edit+cancel), ~5 API endpoints + geo proxy, 1 new table, 1 new
frontend feature module replacing the Stays placeholder.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.1.0 (5 principles + Architecture & Engineering Standards):

| Gate | Status | Notes |
|------|--------|-------|
| Two-app monorepo, layered backend (router→controller→service→repository) | ✅ | Stay routes follow the same layering; geocoding isolated in a service. |
| Contract-first (shared Zod → OpenAPI + FE validation) | ✅ | All Stay schemas/DTOs/error-codes in `packages/shared`. |
| i18n-only strings, tokens-only colors | ✅ | Keyed error codes; he/en added; no hardcoded colors. |
| Secrets via `env` bindings only | ✅ | MapTiler key as `wrangler secret`; geocoding server-side. |
| Structured logging (no Winston), JSDoc on exports, KISS | ✅ | Reuse 001 logger; JSON column + derived status over new infra. |
| Server-side licensing rigor (cf. kosher-zmanim) | ✅ | Geocoding provider chosen for *storage-permitting* ToS; flagged for confirmation. |
| Testing: vitest-pool-workers + Playwright/axe; verified D1 cascade | ✅ | Extends 001's cascade-orphan test to `stay`. |

**Result**: PASS — no deviations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/002-stays-create-manage/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── api.md           # Phase 1 output (Stay + geo endpoints)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/stay.ts            # StaySchema, CreateStayInput, UpdateStayInput, PrayerNeedsSchema,
│                              #   OwnerStayDTO, PublicStayDTO, geo result schema
└── errors/ (extend)           # stay/date/geo error-code keys

apps/backend/src/
├── db/schema.ts               # + stay table (FK user(id) ON DELETE CASCADE, indexes)
├── routes/stays.ts            # OpenAPI route defs (list/create/get/update/cancel)
├── routes/geo.ts              # /api/geo/search proxy (server-side geocoding)
├── controllers/stayController.ts
├── services/stayService.ts    # TZ-aware validation, Shabbat heuristic, DTO selection
├── services/geoService.ts     # MapTiler client + Google fallback, normalization
├── repositories/stayRepository.ts  # Drizzle queries (incl. nearest-first), db.batch writes
└── lib/timezone.ts            # coords → IANA tz (tz-lookup) + destination-local date helpers
└── migrations/                # new generated migration for `stay`

apps/frontend/src/
├── features/stays/
│   ├── StaysDashboard.tsx     # replaces 001 StaysPlaceholder; empty state + nearest-first list
│   ├── StayCard.tsx
│   ├── AddEditStayForm.tsx    # search-first location, smart defaults, progressive disclosure
│   ├── LocationPicker.tsx     # search box + MapLibre confirmation map + manual fallback
│   └── PrayerNeeds.tsx
├── lib/stays.ts               # typed API client (TanStack Query hooks)
└── router.tsx                 # wire /stays (list) + /stays/new + /stays/:id/edit

tests:
apps/backend/test/stays.test.ts, geo.test.ts, stay-cascade.test.ts
apps/frontend/e2e/stays.spec.ts (create/list/edit/cancel + axe), unit tests for form validation
```

**Structure Decision**: Web two-app monorepo (matches 001). New backend layer files per the
constitution's router→controller→service→repository split; new `features/stays` frontend module
replaces the placeholder; all contracts in `packages/shared`. Geocoding is its own
service+route so the provider is swappable (MapTiler↔Google) behind a stable `/api/geo/*`.

## Complexity Tracking

> No constitution violations — section intentionally empty.
