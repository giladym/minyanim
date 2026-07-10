# Implementation Plan: Beit Chabad → Places Consolidation

**Branch**: `011-beit-chabad-consolidation` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-beit-chabad-consolidation/spec.md`

## Summary

Make the generic `place`/`layer` model (010) the single source of truth for Chabad houses and delete
the legacy `beit_chabad_pin` table and every code path that reads it. A destructive migration (0012)
reconciles any legacy pin not already copied into the "Chabad houses" layer, then drops the table.
Discovery stops calling the bespoke `beitChabadInBbox`/`BeitChabadPinDTO` path and instead reuses the
generic `placesInBbox` + active-layer list (the same query the places view uses), returning
`places`/`layers` on the discovery result; the discovery map renders place markers grouped by layer
(Chabad houses among them) with per-layer toggles. Zero user-facing regression: for today's data
(only the Chabad layer is seeded) the same houses show with the same fields + attribution.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 22 tooling; Cloudflare Workers runtime.

**Primary Dependencies**: Hono (backend), Drizzle ORM + D1, TanStack Router/Query + React (frontend),
MapLibre GL (maps), Zod (shared contracts), i18next. All pre-existing — this feature adds none.

**Storage**: Cloudflare D1 (SQLite). Migration 0012 (reconcile `beit_chabad_pin` → `place`, then
`DROP TABLE beit_chabad_pin`). `place.(source, source_id)` unique index already guarantees idempotency.

**Testing**: vitest-pool-workers (backend, per-file isolated D1), Vitest + Testing Library (frontend),
Playwright + axe-core (WCAG AA e2e). i18n he/en parity test.

**Target Platform**: Cloudflare Workers (backend Worker + frontend on Static Assets), mobile-first web.

**Project Type**: Web application — pnpm + Turborepo monorepo (`apps/backend`, `apps/frontend`,
`packages/shared`).

**Performance Goals**: Discovery bbox scan stays a single indexed query (reuses `place_lat_lng_idx` +
`place_layer_idx`); no added round-trips versus today's two parallel scans.

**Constraints**: No production data (pre-launch) → destructive drop approved. Migrations run manually
on deploy (`pnpm db:migrate:remote`); CI does not auto-migrate. `place` provenance stays server-side.

**Scale/Scope**: Dozens–hundreds of Chabad places; single-region dev DB. Small, contained refactor.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hebrew-First & RTL** — The only UI change is the discovery map's marker/toggle rendering; strings
  stay i18n-externalized (he/en), layout stays logical-property based. PASS.
- **II. Accessibility (NON-NEGOTIABLE)** — The map already ships with a screen-reader list alongside it
  (010 pattern); any new per-layer toggle gets an accessible name, keyboard operability, token colors
  (≥ 4.5:1). Covered by the axe e2e gate. PASS.
- **III. Mobile-First** — No new layout; touch targets for any toggle ≥ 44 px. PASS.
- **Architecture & Engineering Standards** — Stays within the layered backend
  (router→service→repository), shared Zod/TS contracts as SoT, service-binding (no CORS), tokens-only,
  i18n-only, structured logging, secrets via env. Removing a table + bespoke path REDUCES surface area
  (KISS). No new dependency. PASS.
- **Contract-first** — The discovery response contract changes (`beitChabad` → `places`/`layers`); the
  shared type is updated first and both sides compile against it. PASS.

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/011-beit-chabad-consolidation/
├── plan.md              # This file
├── research.md          # Phase 0 — resolved decisions
├── data-model.md        # Phase 1 — place as SoT, beit_chabad_pin removal, migration 0012
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   └── discovery.md     # Phase 1 — changed discovery response contract
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/backend/
├── migrations/
│   └── 0012_*.sql                       # reconcile beit_chabad_pin → place; DROP beit_chabad_pin
├── src/db/schema.ts                     # remove `beitChabadPin` table export
├── src/repositories/discoveryRepository.ts  # remove beitChabadInBbox; import placesInBbox
├── src/services/discoveryService.ts     # return places/layers (via placesInBbox + listActiveLayers)
├── seed/beit-chabad.sql                 # retarget (or retire) — seed the place/Chabad layer instead
└── test/                                # near-stay/discovery tests updated; migration reconcile test

apps/frontend/
├── src/features/discovery/DiscoveryMap.tsx   # render place markers grouped by layer + toggles
├── src/features/discovery/DiscoveryPage.tsx  # pass places/layers instead of beitChabad
├── src/features/discovery/DiscoveryPage.test.tsx
└── src/i18n/locales/{he,en}.ts          # layer/label strings; drop dead beitChabad-only keys if unused

packages/shared/
└── src/schemas/discovery.ts             # DiscoveryResult: drop beitChabad + BeitChabadPinDTO;
                                         #   add places: PlaceDTO[] + layers: LayerDTO[]
```

**Structure Decision**: Existing monorepo web-app layout. Changes are confined to the discovery slice
(backend repo/service, shared contract, frontend discovery components) plus one destructive migration and
the schema removal. The generic places read path (`placesInBbox`, `listActiveLayers`, `PlaceDTO`,
`LayerDTO`) from 010 is reused verbatim — no new endpoints or tables.

## Complexity Tracking

> No constitution violations — section intentionally empty.
