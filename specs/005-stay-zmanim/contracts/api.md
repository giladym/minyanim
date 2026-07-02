# Phase 1 API Contracts — Per-Stay Zmanim

Base: `/api` on the backend Worker (Hono). Conventions inherited from 001–004: `401 auth.required`;
`404 resource.not_found` if missing **or not owned**; plain Hono; DTOs hand-built before `c.json()`;
`cache-control` on pure-compute reads (mirrors `/api/calendar`). **All zmanim are computed
server-side; only formatted `HH:mm` strings + labels are returned — never `kosher-zmanim` or raw
astronomical data (D1/SC-006).**

---

## Zmanim

### `GET /api/stays/:id/zmanim`  (owner-scoped)
Shabbat zmanim for an **owned** Stay. `404 resource.not_found` if missing or not owned (never leak).
- Coordless Stay (`lat`/`lng` null) → `200 { coversShabbat, hasCoordinates: false, shabbatot: [] }`
  — the FE shows the add-location CTA (D6).
- Past/cancelled Stay → `200 { coversShabbat, hasCoordinates, shabbatot: [] }` (active-only, D9).
- Otherwise → `200 ZmanimResponse` with one entry per Shabbat in range.
→ `200 ZmanimResponse` · `401` · `404`.

### `GET /api/events/:id/zmanim`  (public — mirrors the shipped public minyan detail `GET /api/events/:id`)
Shabbat zmanim for a hosted Minyan. **No auth required** (the shipped `GET /api/events/:id` uses
`optionalUserId`; an unauthenticated read is real). **A Minyan has a single `eventDate`, NOT a range**
— so it yields **at most one** `ShabbatZmanim` entry (no range enumeration; gate on
`isSaturday(eventDate)`). Computed server-side from the event's **exact** stored coordinates via
`getMinyanById` (the sub-second vs-fuzzed difference is immaterial, R10 — do **not** route through the
fuzzed `PublicMinyanDTO`); identical for all viewers.
- Non-Shabbat (weekday) or cancelled/past Minyan → `200 { coversShabbat: false, hasCoordinates, shabbatot: [] }`.
- Shabbat-dated active Minyan → `200 ZmanimResponse` with a single entry.
→ `200 ZmanimResponse` · `404` if the Minyan doesn't exist.

> Path note: the backend has **no `/api/minyan` namespace** — all minyan reads live under
> `/api/events/...`. This endpoint is added to the existing `events` router.

### `ZmanimResponse`
```jsonc
{
  "coversShabbat": true,
  "hasCoordinates": true,
  "candleLightingOffsetMinutes": 18,         // 40 for Jerusalem (D3)
  "shabbatot": [
    {
      "shabbatDate": "2026-07-04",            // the Saturday civil date
      "candleLighting": "21:08",              // Friday sunset − offset, location tz (HH:mm | null)
      "havdalahGeonim": "22:43",              // Sat tzeit 8.5° (HH:mm | null)
      "havdalahRabbeinuTam": "23:32",         // Sat 72 min (HH:mm | null)
      "note": null                            // "uncomputable" (polar) | "havdalah_yom_tov" | null
    }
  ]
}
```
Times are `HH:mm` in the **location's IANA timezone** (DST-correct). **Implementation note**: the
`kosher-zmanim` getters return a **UTC-zoned** luxon `DateTime` — they MUST be formatted as
`dt.setZone(tzFromCoords(lat,lng)).toFormat("HH:mm")`, NOT `dt.toFormat(...)` (which would emit UTC,
a silent wrong time). luxon is re-exported by `kosher-zmanim` (no new dep; pinned v1.28). Any time may
be `null` when uncomputable (polar) or guarded (Yom-Tov-adjacent Havdalah) — the `note` says which
(D7/D2). The FE chooses which Havdalah to show from the user's `havdalahOpinion` preference (default
`geonim`; `both` shows both — D4).

**Caching**: `GET /api/stays/:id/zmanim` → `cache-control: private, max-age=…` (owner-private);
`GET /api/events/:id/zmanim` → `cache-control: public, max-age=…` (public projection).

---

## Profile (extends 001)

### `GET /api/me` / `PATCH /api/me` (existing)
The shipped profile type is **`Profile`** (not `ProfileDTO`), updated via `updateProfileSchema` /
`UpdateProfileInput`. `Profile` gains **`havdalahOpinion`** (`"geonim" | "rabbeinu_tam" | "both"`,
default `"geonim"`); `updateProfileSchema` accepts it (the `havdalahOpinion` z.enum). Mirrors the
existing `language`/`theme` round-trip. → `200 Profile`.

**Round-trip touch-points (ALL required, else the field silently drops — the 004 hand-built-shape
trap):**
1. `packages/shared/src/schemas/common.ts` — `havdalahOpinionSchema = z.enum(["geonim","rabbeinu_tam","both"])` (beside `languageSchema`).
2. `packages/shared/src/schemas/profile.ts` — add to `updateProfileSchema` (optional) AND the `Profile` interface.
3. `apps/backend/src/auth.ts` — register `havdalahOpinion` in better-auth `user.additionalFields` (mirror `language`/`theme`: `{ type:"string", required:false, defaultValue:"geonim", input:true }`).
4. `apps/backend/src/db/schema.ts` — `havdalahOpinion` column (default `'geonim'`).
5. `apps/backend/src/repositories/userRepository.ts` — widen `updateUser`'s `fields` type to include `havdalahOpinion` (currently `Partial<{ name; language; theme }>` — it would TS-reject/drop the key).
6. `apps/backend/src/services/profileService.ts` — `getProfile` hand-builds the returned object field-by-field (no spread) → add `havdalahOpinion` to the map.

---

## Errors

No new error codes. Reuses `auth.required`, `resource.not_found`. Validation of `havdalahOpinion`
uses the shared enum (an invalid value → the standard `400 { errors:[{field,code}] }` shape from the
profile update path).

## Shared contracts (`packages/shared`)
- `schemas/zmanim.ts`: `ShabbatZmanim`, `ZmanimResponse` (TS interfaces); `HavdalahOpinion =
  z.enum(["geonim","rabbeinu_tam","both"])` (or place the enum in `common.ts` per round-trip #1).
- `schemas/profile.ts` (extend): `havdalahOpinion` on the `Profile` interface + `updateProfileSchema`.
