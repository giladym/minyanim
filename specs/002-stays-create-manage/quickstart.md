# Quickstart & Validation — Stays: Create & Manage

End-to-end validation scenarios proving Feature 002 works. References
[contracts/api.md](./contracts/api.md) and [data-model.md](./data-model.md) rather than
duplicating them. Implementation details live in `tasks.md` + the code.

## Prerequisites

- 001 running locally (see 001 quickstart): `pnpm install`, backend + frontend dev servers via
  the monorepo, local D1 migrated.
- Apply the new `stay` migration locally: `wrangler d1 migrations apply minyanim --local`.
- Geocoding: set `MAPTILER_API_KEY` in `apps/backend/.dev.vars` for live search, **or** rely on
  the mocked `geoService` (tests + offline dev). Map tiles use a separate public tile key.
- Signed-in user (Google or email/password — feature is auth-method-agnostic).

## Scenario 1 — Register a Stay in < 90s (US1, SC-001)

1. From the empty My Stays dashboard, click **"הוסף יעד"**.
2. In the location search, type a city (Hebrew or English) → pick a result; the map confirms and
   city/country/coordinates auto-fill (`GET /api/geo/search`).
3. Required fields only: arrival + departure dates, `numMen` (defaults to 1). Shabbat tefillot
   auto-suggested ON because the range covers a Saturday. Optional fields stay collapsed under
   "פרטים נוספים".
4. Submit → `POST /api/stays` → `201`. **Expected**: return to the dashboard, new Stay
   highlighted, success toast, visible within 2 s (SC-002).

**Validation checks**:
- Past arrival (destination-local) → rejected inline with `date.in_past` (try a US destination
  near date boundaries from an Israel clock — must judge "past" at the destination).
- Departure before arrival → `date.range_invalid`. `numMen = 0` → `num_men.too_low`. The pickers
  also grey out invalid days at entry (departure can't precede arrival; soft past-floor), though
  the schema + server stay the authoritative guard if an out-of-order range is forced.
- Geocoding empty/unreachable → "enter city/country manually" path still completes the Stay.
- Failed submit UX (FR-012): the "Save stay" button stays enabled; an error summary
  (`stays.fixErrors`) appears by the button, focus jumps to the first invalid field, and the
  "פרטים נוספים" disclosure auto-expands if the flagged field lives inside it.

## Scenario 2 — View & sort (US2)

1. Create three Stays with different arrival dates.
2. Open the dashboard. **Expected**: nearest arrival first (server-sorted); each card shows
   location, date range, men count, Sefer Torah badge when set.
3. Create a Stay whose departure already passed (destination-local). **Expected**: rendered as
   past (derived `isPast`), visually distinct; cancelled Stays absent.
4. Empty state: a brand-new user sees the explanation + single "הוסף יעד" CTA.

## Scenario 3 — Edit & cancel (US3)

1. Edit a Stay's dates + man count → save → `PATCH /api/stays/{id}` → reflected within 2 s
   (SC-003). Moving a date into the past is rejected.
2. Cancel a Stay → confirmation dialog → `POST /api/stays/{id}/cancel` → leaves the active list;
   the row persists (`status='cancelled'`).

## Scenario 4 — Privacy (FR-007, D8)

- The Add-Stay form shows privacy microcopy at the address field + a form-level note.
- `GET /api/stays` returns `OwnerStayDTO` (private fields present for the owner). Confirm
  `PublicStayDTO` (used by 003) has **no** `addressPrivate`/`contactPhone`/`contactEmail` keys at
  the schema level.

## Automated checks (CI)

- **Backend** (vitest-pool-workers): create/list(sort)/get/update/cancel; structural Zod
  rejections; **temporal** TZ validation (destination-local, with a mocked `tz-lookup`); geo
  proxy normalization + `geo.unavailable` degradation (mocked provider); **cascade-orphan**:
  create user + stays → `deleteUser` → assert zero orphan `stay` rows.
- **Frontend** (Vitest + Testing Library): form validation messages (he), smart defaults,
  progressive disclosure.
- **e2e** (Playwright + axe): full create→list→edit→cancel; empty state; WCAG 2.1 AA on the
  form/date-picker/map/dashboard at 375px + desktop; keyboard operability + RTL.
- No live geocoding calls in CI (provider mocked). Optional non-blocking smoke test: Hebrew
  autocomplete + attribution placement.

## Done when

- [ ] All three user stories pass their scenarios locally + in CI.
- [ ] SC-001..SC-004 met (90s create, 2s reflect, 100% invalid rejected with field codes).
- [ ] Cascade-orphan test green; no private field in `PublicStayDTO`.
