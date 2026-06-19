# Phase 1 API Contracts — Stays: Create & Manage

Base: `/api` on the backend Worker (Hono). Auth via the better-auth session cookie (001). All
routes defined with **`@hono/zod-openapi`** from shared Zod schemas (`packages/shared`).
Conventions inherited from [001 contracts](../001-platform-foundation/contracts/api.md):

- `401 { code: "auth.required" }` if unauthenticated; `404 { code: "resource.not_found" }` if not
  found **or not owned** (never leak existence / never 403); `400` validation as
  `{ "errors": [{ "field": "<name|null>", "code": "<key>", "params"?: {} }] }`; timestamps epoch
  ms. Error-code keys live in `packages/shared`; the frontend localizes (he/en).

All Stay routes are **owner-scoped** to the session user.

---

## Stays

### `GET /api/stays`

List the caller's Stays, **sorted nearest-first server-side** (`arrival_date` ASC). Includes both
active and past (derived) Stays; cancelled Stays are excluded by default. No pagination in v1.
→ `200`
```json
{
  "stays": [
    {
      "id": "stay_…",
      "city": "לונדון", "country": "בריטניה",
      "lat": 51.5074, "lng": -0.1278,
      "arrivalDate": 1750464000000, "departureDate": 1750723200000,
      "numMen": 3,
      "bringsSeferTorah": true,
      "prayerNeeds": { "weekday": { "shacharit": true, "mincha": false, "maariv": false } },
      "status": "active",
      "isPast": false,
      "coversShabbat": true,
      "addressPrivate": "…", "contactName": "…", "contactPhone": "…", "contactEmail": null,
      "groupMembers": "…", "notes": null, "folderId": null,
      "createdAt": 1750000000000, "updatedAt": 1750000000000
    }
  ]
}
```
Shape is **`OwnerStayDTO`** (002 returns the owner's own Stays only — includes private fields).
`isPast` / `coversShabbat` are server-derived (not stored). `401` if unauthenticated.

### `POST /api/stays`

Create a Stay. Body = `CreateStayInput` (shared Zod):
```json
{
  "city": "string", "country": "string",
  "lat": 51.5074, "lng": -0.1278,
  "addressPrivate": "string?|null",
  "arrivalDate": 1750464000000, "departureDate": 1750723200000,
  "numMen": 1,
  "bringsSeferTorah": false,
  "prayerNeeds": { "weekday": { "shacharit": false, "mincha": false, "maariv": false } },
  "contactName": "string?", "contactPhone": "string?|null", "contactEmail": "string?|null",
  "groupMembers": "string?|null", "notes": "string?|null", "folderId": "string?|null"
}
```
Validation: structural via shared Zod (`departure ≥ arrival`, `numMen ≥ 1`, fields well-formed);
**temporal** server-side (`arrivalDate` not before destination-local today, resolved from
`lat`/`lng`; manual-entry fallback ±1 day). → `201` `OwnerStayDTO`.
`400` field codes: `location.required`, `date.in_past`, `date.range_invalid`, `num_men.too_low`.

### `GET /api/stays/{id}`

Fetch one owned Stay. → `200` `OwnerStayDTO` · `404 resource.not_found` if missing/not owned.

### `PATCH /api/stays/{id}`

Partial update (US3). Body = `UpdateStayInput` (all fields optional; same structural + temporal
validation as create, including the no-move-into-the-past edit rule). → `200` `OwnerStayDTO` ·
`400` field codes · `404` if not owned.

### `POST /api/stays/{id}/cancel`

Soft-cancel (state transition `active → cancelled`). Requires explicit client confirmation (e.g.
`{ "confirm": true }`; without it → `400 confirm.required`). The row is retained (003 may
reference it) and drops off the active dashboard. → `200 { ok: true }` · `404` if not owned.
Hard deletion is **not** exposed in v1 (reserved for the 001 account-deletion cascade).

---

## Geocoding proxy (server-side; D1/D2)

Keeps the provider key server-side and normalizes provider output to one internal shape.

### `GET /api/geo/search?q={text}&lang={he|en}`

Forward-geocoding / autocomplete via **MapTiler** (Google Places fallback). Authenticated
(session required — abuse control). The key is a `wrangler secret`, never sent to the client.
→ `200`
```json
{
  "results": [
    { "city": "לונדון", "country": "בריטניה", "lat": 51.5074, "lng": -0.1278,
      "label": "London, United Kingdom" }
  ],
  "attribution": "© MapTiler © OpenStreetMap contributors"
}
```
Empty `results` is valid (UI offers manual city/country entry). `429 rate.limited` under abuse.
`502 geo.unavailable` if the provider is down → UI degrades to manual entry. The client renders
the required `attribution` wherever results/map appear.

> Map **tiles** for the confirmation map load client-side from MapTiler using a separate
> public-scoped tile key (not the geocoding secret). Tiles failing to load never blocks the flow.

---

## Errors (002 additions)

Keyed codes added to `packages/shared` (frontend localizes):

| Code | Meaning |
|------|---------|
| `location.required` | city/country missing |
| `date.in_past` | arrival before destination-local today |
| `date.range_invalid` | departure before arrival |
| `num_men.too_low` | men count < 1 |
| `confirm.required` | cancel without explicit confirmation |
| `geo.unavailable` | geocoding provider unreachable (degrade to manual) |

Plus inherited 001 codes (`auth.required`, `resource.not_found`, `rate.limited`, `server.error`).
