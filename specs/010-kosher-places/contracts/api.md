# Phase 1 API Contracts — Kosher Places & Map Layers (+ Admin Foundation)

Base: `/api` on the backend Worker (Hono). Conventions inherited from 001–009: `401 auth.required`;
`404 resource.not_found` if missing; DTOs hand-built before `c.json()`; `cache-control` on
public/institutional reads (mirrors `/api/config`, `/api/discovery`). **NEW**: `403 auth.forbidden`
for a non-admin hitting an admin route (SC-006 — refused at the API, not merely hidden). All
coordinate resolution/geocoding stays server-side / in the offline importer; the client receives
coords + builds public navigation deep links (D8).

---

## User-facing reads (any signed-in user — D10)

### `GET /api/places?lat&lng&radiusKm?` (also accepts `from?`/`to?` for parity; bbox variant)
Kosher/Jewish places near a point, grouped by layer, within the discovery radius (reuses the 003
`bboxFrom` bbox). `radiusKm` defaults to `DISCOVERY_RADIUS_KM`. Only places under **active** layers
whose license permits display are returned (D5).
- Coordless / missing `lat`/`lng` → `200 { layers, groups: [], attribution }` — the FE shows the
  "add a precise location" degraded state (edge case, mirrors 005 coordless handling).
- No places nearby → `200` with empty `groups` (a clear empty state, not an error — US1 scenario 5).
- → `200 PlacesResponse` · `401`.

### `GET /api/layers`
All **active** layers (ordered by `displayOrder`) for the user-facing toggle list. Admins get retired
layers too via `/api/admin/layers`.
- → `200 { layers: LayerDTO[] }` · `401`.

Both reads: `cache-control: public, max-age=…` (institutional data, no per-user projection).

---

## Admin (all behind `requireAdmin` — D2/FR-008; non-admin → `403 auth.forbidden`)

### `GET /api/admin/me`
Whether the caller is an admin (drives the FE `/admin` guard + nav entry). Signed-in non-admin → `403`.
- → `200 { isAdmin: true }` · `401` · `403`.

### Layers — `POST /api/admin/layers`, `PATCH /api/admin/layers/:id`, `DELETE /api/admin/layers/:id`
- `POST` body `CreateLayerInput` → `201 LayerDTO`. Duplicate name → `409 layer.name_taken`.
- `PATCH` body `UpdateLayerInput` (rename / reorder / retire) → `200 LayerDTO`.
- `DELETE` → `204`; **refused `409 layer.has_places`** if the layer still has places (retire instead —
  edge case, no orphans).
- → `401` · `403` · `404` · `409`.

### Places — `POST /api/admin/places`, `PATCH /api/admin/places/:id`, `DELETE /api/admin/places/:id`
- `POST` body `CreatePlaceInput` (must reference an existing layer) → `201 PlaceDTO`. Manual entries
  get `source:"manual"`, `license:"internal"`, `sourceId:null`.
- `PATCH` body `UpdatePlaceInput` → `200 PlaceDTO`.
- `DELETE` → `204`.
- → `401` · `403` · `404` · `400` (validation).

---

## DTOs

### `PlaceDTO`
```jsonc
{
  "id": "plc_…",
  "layerId": "layer_chabad",
  "name": "Chabad of Kraków",
  "description": null,
  "lat": 50.0614,
  "lng": 19.9372,
  "address": "ul. Kupa 18, Kraków",
  "phone": "+48 12 …",
  "hours": "Mo-Fr 09:00-17:00",           // raw opening-hours string, best-effort (D9)
  "images": [],                            // string[] URLs
  "kosherMeta": {                          // all optional (D9); null when unknown
    "certification": "OU",
    "agency": "Orthodox Union",
    "dietary": "meat"                      // "meat" | "dairy" | "parve"
  },
  "source": "openstreetmap",               // provenance (D5)
  "license": "ODbL-1.0",
  "attribution": "© OpenStreetMap contributors"   // rendered by the UI (SC-008); null → no extra line
}
```
Every displayed place carries `source` + `license` and, where required, a renderable `attribution`
(SC-008). No private fields exist (institutional data — D10); no coordinate fuzzing (fixed
institutions; navigation needs the exact point — unlike discovery minyanim).

### `LayerDTO`
```jsonc
{ "id": "layer_chabad", "name": "Chabad houses", "icon": "chabad", "displayOrder": 0, "active": true }
```

### `PlacesResponse`
```jsonc
{
  "layers": [ /* LayerDTO[] — active layers, for the toggle UI */ ],
  "groups": [
    { "layerId": "layer_chabad", "places": [ /* PlaceDTO[] */ ] }
    // one group per active layer that has places in the bbox
  ],
  "attribution": "© MapTiler © OpenStreetMap contributors"   // map-tile + aggregate data attribution
}
```
`groups` is empty for a coordless query or when nothing is nearby (both `200`, not errors).

### Admin inputs (Zod, `packages/shared/src/schemas/place.ts`)
- `CreateLayerInput`: `{ name: string(min1), icon?: string, displayOrder?: number }`.
- `UpdateLayerInput`: all of the above optional **+** `active?: boolean` (retire/restore).
- `CreatePlaceInput`: `{ layerId, name: string(min1), lat: number, lng: number, description?, address?,
  phone?, hours?, images?: string[], kosherMeta?: KosherMeta }`. `source`/`license`/`sourceId` are set
  server-side for manual entries (not client-supplied).
- `UpdatePlaceInput`: partial of `CreatePlaceInput` (no `source`/`license` churn from the admin UI).
- `KosherMeta`: `{ certification?: string, agency?: string, dietary?: "meat" | "dairy" | "parve" }`.
- `PlacesQuery`: `{ lat?: coerce.number, lng?: coerce.number, radiusKm?: coerce.number.default(…),
  from?: coerce.number.int, to?: coerce.number.int }` (mirrors `DiscoveryQuery`).

---

## Errors (new — extend `packages/shared/src/errors.ts`)

| Code | HTTP | When |
|------|------|------|
| `auth.forbidden` (`AUTH_FORBIDDEN`) | 403 | signed-in non-admin hits an admin route (SC-006) |
| `layer.name_taken` (`LAYER_NAME_TAKEN`) | 409 | create/rename a layer to an existing (NOCASE) name |
| `layer.has_places` (`LAYER_HAS_PLACES`) | 409 | delete a layer that still has places (retire instead) |

Reuses `auth.required` (401), `resource.not_found` (404), `server.error` (500), and the standard
`400 { errors:[{field,code}] }` shape for input validation.

## Shared contracts (`packages/shared`)
- `schemas/place.ts` (new): `PlaceDTO`, `LayerDTO`, `PlacesResponse`, `KosherMeta` (interfaces/types);
  `PlacesQuery`, `CreateLayerInput`, `UpdateLayerInput`, `CreatePlaceInput`, `UpdatePlaceInput` (Zod).
- `schemas/index.ts` (extend): `export * from "./place"`.
- `errors.ts` (extend): the three codes above.

## Guard note (`requireAdmin`)
`apps/backend/src/lib/auth.ts` — `requireAdmin(c)`: `const userId = await requireUserId(c)` → load the
user row → **admin iff** `user.isAdmin === true` **or** the user's **verified** email is in
`env.ADMIN_EMAILS` (comma-separated allowlist secret); on an allowlist hit with `isAdmin` still false,
**idempotently promote** the row (so the first admin is set purely by config + sign-in — no DB edit,
no self-service promotion). Not admin → `throw Forbidden()` (403). This is the **only** writer of
`isAdmin`; it is `input:false` in better-auth and absent from `updateProfileSchema`.
