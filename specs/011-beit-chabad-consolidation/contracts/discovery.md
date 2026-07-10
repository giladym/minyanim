# Contract change — Discovery response (011)

Only the **discovery read** contract changes. No new endpoints. The 010 places endpoints
(`GET /api/places`, `GET /api/layers`, `/api/admin/places`, `/api/admin/layers`) are unchanged and remain
the admin/user path for Chabad houses.

## `GET /api/discovery` and `GET /api/near-stay` — response shape change

Both return `DiscoveryResult`. The Beit Chabad field is replaced by the generic places + layers the
`/places` view already uses.

### Before (003 + 010)

```jsonc
{
  "potential": [ /* PotentialBucket[] */ ],
  "minyanim":  [ /* PublicMinyanDTO[] */ ],
  "beitChabad": [ { "id", "name", "address", "phone", "city", "country", "lat", "lng" } ],
  "attribution": "…"
}
```

### After (011)

```jsonc
{
  "potential": [ /* PotentialBucket[] */ ],
  "minyanim":  [ /* PublicMinyanDTO[] */ ],
  "places":    [ /* PlaceDTO[] — active-layer places in the viewport (010 shape) */ ],
  "layers":    [ /* LayerDTO[] — active layers, for the per-layer toggle list */ ],
  "attribution": "…"
}
```

- `places` / `layers` come from the existing `placesInBbox(db, bbox)` + `listActiveLayers(db)` (010) — the
  same query and DTOs as `GET /api/places`. `PlaceDTO` already carries `layerId`, `name`, `lat`, `lng`,
  `address`, `phone`, `attribution`, etc.
- Signed-out callers: discovery is signed-in only today; unchanged. Places carry no private data
  (server-side provenance like `license` is not on `PlaceDTO`).
- Empty viewport → `places: []`, `layers: [...]` (toggle list can still render). No error.

### Removed shared types

- `BeitChabadPinDTO` — deleted from `packages/shared/src/schemas/discovery.ts`.
- `DiscoveryResult.beitChabad` — removed (replaced by `places` + `layers`).

### Error/482 behavior

Unchanged from 003: `401 auth.required` signed-out; bbox parsing + date handling identical. This feature
adds no new error codes.

## Non-contract internal removals (for reference, not API surface)

- `discoveryRepository.beitChabadInBbox` — removed; `discoveryService` imports `placesInBbox` +
  `listActiveLayers` from `placesRepository`.
- `apps/backend/src/db/schema.ts` — `beitChabadPin` export removed.
- Frontend `DiscoveryMap`/`DiscoveryPage` — consume `places`/`layers` instead of `beitChabad`.
