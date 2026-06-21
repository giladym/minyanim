# Phase 1 Data Model — Per-Stay Zmanim

Date: 2026-06-21 · Storage: Cloudflare D1 (SQLite) via Drizzle. **No new table.** Zmanim are
**derived at read time** (mirrors 002 `isPast`/`coversShabbat`, 004 history). One profile-column
addition.

---

## Derived (not stored) — `lib/zmanim.ts` + `zmanimService`

### `ShabbatZmanim` (per Shabbat)

| Field | Type | Notes |
|-------|------|-------|
| shabbatDate | string `YYYY-MM-DD` | the Saturday civil date (from `shabbatSaturdaysInRange`) |
| candleLighting | string `HH:mm` \| null | Friday (Sat−1) sunset − offset; null if uncomputable (R8) |
| havdalahGeonim | string `HH:mm` \| null | Saturday `getTzaisGeonim8Point5Degrees()`; null if uncomputable |
| havdalahRabbeinuTam | string `HH:mm` \| null | Saturday `getTzais72()`; null if uncomputable |
| note | `"uncomputable"` \| `"havdalah_yom_tov"` \| null | high-latitude null (R8) / motzaei-Shabbat-into-Yom-Tov Havdalah suppressed (R9) |

All times formatted in the **location's IANA timezone** (`tzFromCoords(lat,lng)`), DST-correct (D8).

### `ZmanimResponse` (the endpoint payload)

| Field | Type | Notes |
|-------|------|-------|
| coversShabbat | boolean | does the Stay/Minyan range include a Shabbat (002 helper) |
| hasCoordinates | boolean | false → coordless; FE shows the add-location CTA (D6); `shabbatot` empty |
| shabbatot | `ShabbatZmanim[]` | one per Shabbat in range, ascending; empty when `!coversShabbat` or `!hasCoordinates` |
| candleLightingOffsetMinutes | number | 18, or 40 for Jerusalem (D3) — for FE labeling |

`ShabbatZmanim` / `ZmanimResponse` are **TS interfaces hand-built** in the controller (like the stay
DTOs) — not Zod (no inbound parsing). `HavdalahOpinion` IS a `z.enum` (it's a profile input value).

## Compute (R2/R3/R9) — `lib/zmanim.ts`

`computeShabbatZmanim(lat, lng, saturdayCivil): ShabbatZmanim` (`saturdayCivil` is a `YYYY-MM-DD`
string from `shabbatSaturdaysInRange`):
1. `tz = tzFromCoords(lat,lng)`; `geo = new GeoLocation("", lat, lng, 0, tz)`.
2. `czc = new ComplexZmanimCalendar(geo)`; `czc.setCandleLightingOffset(isJerusalem(lat,lng) ? 40 : 18)`.
3. Parse `saturdayCivil` → a **UTC-midnight Date** (`new Date(\`${saturdayCivil}T00:00:00Z\`)`).
   candle-lighting: `setDate(saturday − 1 day)` (**Friday**) → `getCandleLighting()`.
4. Havdalah: `setDate(saturday)` → `getTzaisGeonim8Point5Degrees()` + `getTzais72()`.
5. Each getter may return `null` (polar) → that field null + `note:"uncomputable"`.
6. Yom-Tov guard (`new JewishCalendar(sunday=saturday+1d).isYomTov()`): if motzaei Shabbat runs into
   Yom Tov → null the Havdalah fields + `note:"havdalah_yom_tov"` (candle-lighting still shown).
7. **Format**: the getters return a **UTC-zoned** luxon `DateTime` — format as
   `dt.setZone(tz).toFormat("HH:mm")` (NOT `dt.toFormat(...)`, which emits UTC — a silent wrong time).
   luxon is re-exported by `kosher-zmanim` (no new dep). The UTC-midnight storage convention is
   load-bearing: `setDate` reads the Date's civil Y/M/D in the workerd UTC runtime.

## Change to `user` (the 001 profile, R5)

`user` gains:

```
havdalahOpinion: text("havdalah_opinion").notNull().default("geonim")  // 'geonim' | 'rabbeinu_tam' | 'both'
```

Migration (`apps/backend/migrations/00XX_*.sql`): intended `ALTER TABLE user ADD COLUMN
havdalah_opinion text NOT NULL DEFAULT 'geonim';`. **VERIFY after `drizzle-kit generate`** that the
output is exactly that single `ALTER` and **not** a 12-step PRAGMA-wrapped table rebuild — `user` is a
better-auth-owned table with many FK children (`session`/`account`/`stay`/`event`/`commitment`/…), so
a rebuild would hit the same D1 `PRAGMA foreign_keys` rejection as 004. (0003 proves drizzle-kit emits
a clean one-line ADD for a simple column; confirm, and hand-author the one-line ALTER if it doesn't.)
**Also register the column in `auth.ts` better-auth `additionalFields`** (mirror `language`/`theme`)
and widen `userRepository.updateUser`'s field type — the column alone won't round-trip (see
contracts §Profile touch-points). Surfaced via the existing profile read/update.

## Queries / derivation

- **Stay zmanim**: `getStayById(userId, id)` (owner-scoped; 404 if missing/not owned) → if
  `lat==null||lng==null` → `{coversShabbat: coversShabbat(arr,dep,"UTC"), hasCoordinates:false,
  shabbatot:[]}` (note `coversShabbat` takes a tz arg). Else `shabbatSaturdaysInRange(arr, dep, arr,
  dep)` (returns `string[]`) → map `computeShabbatZmanim`. **Active-only**: the endpoint computes from
  the raw row, so it must **re-derive `isPast`** (same `civilDate(departure,"UTC") <
  todayCivil(tzFromCoords(lat,lng))` algorithm `stayService.toOwnerDTO` uses, threading
  `X-Client-Timezone` for the coordless case) — don't assume a DTO; if past or cancelled → empty (D9).
- **Minyan zmanim**: `getMinyanById(db, id)` (returns `MinyanJoined` with **exact** `lat`/`lng`,
  `eventDate`, `storedStatus`). A Minyan has a **single `eventDate`, not a range** → gate on
  `isSaturday(eventDate)` (+ not cancelled, not past) → compute **one** `ShabbatZmanim` from
  `eventDate`; else `{coversShabbat:false, ...}`. Use the exact coords (do NOT route through the
  fuzzed `PublicMinyanDTO` — R10; the time is identical either way).
- **Profile**: `havdalahOpinion` read in `getProfile` (explicit field map, no spread) + accepted by
  `updateProfileSchema`; persisted via `userRepository.updateUser` (field type widened) + registered
  in `auth.ts` additionalFields.

## DTO boundary

- `ZmanimResponse` is owner-only for a Stay (the Stay is owner-scoped) and public for a Minyan (D9).
  It contains no private fields — only Shabbat dates + times (the location/date are already known to
  the viewer). `kosher-zmanim` and raw astronomical values never cross (only `HH:mm` strings, SC-006).
- `ProfileDTO` gains `havdalahOpinion`; `UpdateProfileInput` gains it (`HavdalahOpinion` enum).

## Tests (data-model-critical)

- **Known-value** (R11): fixed coords + Saturday → candle-lighting + both Havdalah within ±1 min
  (Jerusalem 40-min offset asserted).
- **Uncomputable**: Tromsø June → null fields + `note:"uncomputable"`.
- **Yom-Tov guard**: a Saturday whose motzaei runs into Yom Tov → Havdalah null + `note:
  "havdalah_yom_tov"`, candle-lighting present.
- **Coordless**: stay with null lat/lng → `hasCoordinates:false`, empty `shabbatot`.
- **Active-only**: a past/cancelled Stay → empty; a weekday Minyan → `coversShabbat:false`.
- **Profile**: `havdalahOpinion` defaults to `geonim`, round-trips through update.
