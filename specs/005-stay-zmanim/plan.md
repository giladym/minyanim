# Implementation Plan: Per-Stay Zmanim

**Branch**: `005-stay-zmanim` | **Date**: 2026-06-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-stay-zmanim/spec.md` (Clarified — D1–D10).

## Summary

Compute and surface, **server-side**, each Shabbat's **candle-lighting** and **Havdalah** times for
a Stay (owner) and a hosted Minyan (public), derived at read time from the location's coordinates +
IANA timezone via the already-installed `kosher-zmanim` (LGPL — never shipped to the client). Both
Havdalah opinions (Geonim ~8.5° tzeit, Rabbeinu Tam 72 min) are always computed and returned; the
displayed one follows a new per-user `havdalahOpinion` profile preference (default `geonim`).
Candle-lighting is 18 min before sunset (40 for Jerusalem). Coordless Stays show an add-location CTA;
polar no-sunset Shabbatot show a "cannot compute" note. Zmanim are **detail-scoped** (dedicated
endpoints, gated on the existing `coversShabbat` flag), never computed in list reads.

Technical spine: a new `apps/backend/src/lib/zmanim.ts` (extends the 001 `kosher-zmanim` usage to
`ComplexZmanimCalendar` + `GeoLocation`), a thin `zmanimService` + two read endpoints
(`GET /api/stays/:id/zmanim` owner, `GET /api/minyan/:id/zmanim` public), a `havdalahOpinion` column
on `user` (small ALTER migration), shared Zod/TS contracts, and a frontend expandable zmanim section
+ a profile preference control. No stored zmanim, no cron.

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 — unchanged.

**Primary Dependencies**: `kosher-zmanim` (already a backend dep, LGPL, server-side only) — extend
from `JewishCalendar`/`HebrewDateFormatter` to `ComplexZmanimCalendar` + `GeoLocation`; reuse
`apps/backend/src/lib/timezone.ts` (`tzFromCoords`, `civilDate`, `coversShabbat`,
`shabbatSaturdaysInRange`). Hono, Drizzle, Zod v4, better-auth, TanStack Router/Query,
react-i18next, Tailwind v4. **No new runtime deps.**

**Storage**: Cloudflare D1 (SQLite). **No new table.** One **ADD COLUMN** migration:
`user.havdalah_opinion` (text, default `geonim`). Zmanim themselves are **derived at read time —
never stored, no cron**.

**Testing**: vitest-pool-workers (the `zmanim` lib computed against fixed coords+dates → known
`HH:mm` within ±1 min; high-latitude → null; coordless → empty; Yom-Tov-adjacency guard; endpoint
ownership/public projection; profile preference round-trip). Vitest + Testing Library (card
expandable section, coordless CTA, "cannot compute" note, preference control). Playwright + axe-core
(zmanim UI + preference WCAG 2.1 AA, SC-008).

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding).

**Project Type**: Web — two-app monorepo.

**Performance Goals**: zmanim detail read p95 < 200 ms (in-isolate NOAA compute, no network);
**zero** added cost to dashboard/list reads (zmanim never computed there — D5). HTTP `cache-control`
on the response (mirrors `calendar.ts`).

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (FR-010/SC-008); i18n-only strings; tokens-only colors;
**`kosher-zmanim` (LGPL) MUST stay server-side** — only formatted time strings + opinion labels cross
to the FE (SC-006); legal sign-off remains a launch gate (ADR records containment).

**Scale/Scope**: per-Stay handful of Shabbatot (human-scale trips); 3 user stories; 2 read endpoints
+ 1 profile-field addition; 1 new backend lib + 1 service; new FE zmanim section + preference control;
1 ADD COLUMN migration; 1 ADR.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ | New `zmanimController`/`zmanimService` + `lib/zmanim.ts`; reuses stay/event repositories. |
| Contract-first (shared Zod → DTOs + FE) | ✅ | `ShabbatZmanim`, `ZmanimResponse`, `HavdalahOpinion` in `packages/shared`. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | FR-010/SC-008: zmanim section + preference axe-verified; RTL. |
| i18n-only strings, tokens-only colors | ✅ | New he/en keys; no hardcoded colors. |
| Secrets via env bindings only | ✅ | No new secrets (no external API). |
| Structured logging (no Winston), JSDoc, KISS | ✅ | Reuse logger; thin compute lib; no caching layer in v1. |
| Edge-first, no high-latency round trips | ✅ | In-isolate compute, **no network on the read path** (D1). |
| LGPL containment (kosher-zmanim server-side only) | ✅ | Only formatted strings cross (SC-006); ADR 0007 records it; legal sign-off = launch gate. |

**Result**: PASS — no deviations. The notable additions are a **profile field** (`havdalahOpinion`,
mirrors 001's `language`/`theme` pattern) and **expanding the existing server-side `kosher-zmanim`
surface** (zmanim, not just Hebrew dates) — both deliberate, in-scope. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/005-stay-zmanim/
├── plan.md            # This file
├── research.md        # Phase 0 — decisions (D1–D10 + technical resolutions)
├── data-model.md      # Phase 1 — derived Zmanim shape, profile field, no new table
├── quickstart.md      # Phase 1 — end-to-end validation scenarios
├── contracts/
│   └── api.md         # Phase 1 — zmanim read endpoints + profile preference
└── tasks.md           # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/zmanim.ts        # ShabbatZmanim, ZmanimResponse (TS interfaces — hand-built like stay DTOs)
├── schemas/common.ts (extend)  # havdalahOpinionSchema = z.enum(["geonim","rabbeinu_tam","both"]) (beside languageSchema)
├── schemas/profile.ts (extend) # updateProfileSchema += havdalahOpinion; the `Profile` interface (NOT ProfileDTO) += havdalahOpinion
└── (no new error codes expected; reuse resource.not_found / auth.required)

apps/backend/src/
├── lib/zmanim.ts            # NEW: computeShabbatZmanim(lat,lng,saturdayCivil:string) via ComplexZmanimCalendar+GeoLocation; parse string→UTC-midnight Date, Friday=−1d candle-lighting (18/40-Jlem), Sat Geonim8.5°+RT72; dt.setZone(tz).toFormat("HH:mm"); null on no-sunset; Yom-Tov guard via JewishCalendar(sat+1d).isYomTov()
├── ../migrations/00XX_*.sql # NOTE: apps/backend/migrations/ (drizzle out, NOT src/) — ADD COLUMN user.havdalah_opinion DEFAULT 'geonim'; VERIFY single ALTER not a PRAGMA rebuild (user has FK children)
├── db/schema.ts (extend)    # user += havdalahOpinion text notNull default 'geonim'
├── auth.ts (extend)         # register havdalahOpinion in better-auth user.additionalFields (mirror language/theme)
├── repositories/userRepository.ts (extend) # widen updateUser fields type to include havdalahOpinion (else it drops)
├── routes/zmanim.ts         # GET /api/stays/:id/zmanim (owner, cache private); mount in index.ts
├── routes/events.ts (extend) # GET /api/events/:id/zmanim (PUBLIC, optionalUserId, cache public) — NO /api/minyan namespace exists
├── controllers/zmanimController.ts # stay (owner) + minyan (public, single eventDate) → ZmanimResponse
├── services/zmanimService.ts # Stay: shabbatSaturdaysInRange(arr,dep,arr,dep)→per-Sat compute, re-derive isPast, coordless→hasCoordinates:false. Minyan: getMinyanById, single isSaturday(eventDate) entry from EXACT coords
└── services/profileService.ts (extend) # getProfile explicit field map += havdalahOpinion; reuse stayRepository.getStayById + eventRepository.getMinyanById

apps/frontend/src/
├── lib/zmanim.ts            # useStayZmanim(id) / useMinyanZmanim(id) queries (detail-scoped, enabled on expand)
├── features/stays/StayCard.tsx (extend) # expandable "Shabbat times" section (gated by coversShabbat), lazy-fetch on expand; coordless CTA → edit/map
├── features/stays/ZmanimSection.tsx (new) # per-Shabbat list, opinion-aware Havdalah, "cannot compute" note, aria-live
├── features/events/MinyanDetail.tsx (extend) # public zmanim section for Shabbat-dated minyanim
├── features/profile/Profile.tsx (extend) # havdalahOpinion preference control (geonim/rabbeinu_tam/both)
└── lib/profile.ts (extend)  # havdalahOpinion in get/update

docs/adr/
└── 0007-zmanim-server-side.md # kosher-zmanim (LGPL) stays server-side; only formatted strings cross
```

**Structure Decision**: Web two-app monorepo (unchanged). New `zmanim` lib/service/controller/route
+ frontend zmanim section, reusing 002/003 repositories and the 001 `kosher-zmanim` + profile
patterns. All contracts in `packages/shared`.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
