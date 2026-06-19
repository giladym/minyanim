# Integration Setup — MapTiler (geocoding + map tiles)

How to obtain the MapTiler credentials Feature 002 (Stays) needs for the Add-Stay location
picker, and where to put them. Secrets handling follows [`../secrets.md`](../secrets.md): the
**geocoding** key is a backend secret (`.dev.vars` local / `wrangler secret` prod, never in the
repo); the **tile** key is public by nature and is a build-time frontend var.

Decision context: `specs/002-stays-create-manage/research.md` D1/D2 — MapTiler is the primary
provider because its ToS permits **persisting resolved coordinates** long-term (unlike Google,
which caps lat/lng caching ~30 days). Geocoding runs **server-side**; the map is search-first
confirmation only.

## What you'll get

- `MAPTILER_API_KEY` — **geocoding** (forward search/autocomplete). **Backend secret.**
- `MAPTILER_TILE_KEY` → exposed to the build as `VITE_MAPTILER_TILE_KEY` — **map tiles** for the
  confirmation map. **Public** (it ships in tile URLs); protect it with an HTTP-referrer
  allowlist instead.

> Use **two separate keys** so the abusable public tile key is never the one that can run paid
> geocoding, and so you can referrer-lock the tile key without breaking server-side geocoding
> (which sends no `Referer`).

## Steps

1. Create a **MapTiler Cloud** account (https://www.maptiler.com/) and sign in to the dashboard.
2. **⭐ Confirm the Terms** permit storing geocoding results (coordinates) long-term for your
   plan — this is the reason MapTiler was chosen over Google. Re-check before go-live; if it ever
   changes, the documented revert is Google Places (requires a `place_id` schema — see research
   D1).
3. **Account → Keys → Create a new key** named e.g. `minyanim-geocoding` (the **secret**
   geocoding key, used server-side):
   - **Allowed HTTP Origins** → leave **empty**. The Worker's server-side `fetch` sends no
     `Origin`/`Referer`, so MapTiler treats it as "unknown"; if *any* origin is listed, unknown
     requests are rejected (you'd have to add the `?` placeholder to allow them). Empty = allowed.
   - **Allowed User-Agent** → set a substring (e.g. `Minyanim-Server`) — MapTiler matches it
     case-sensitively as a substring of the request UA. The geocoding `fetch` in the Worker MUST
     send a matching `User-Agent` header (e.g. `Minyanim-Server/1.0`). This is the only practical
     lock for a server-side key; the primary protection remains keeping it secret + the
     server-side cache/rate-limit.
4. **Create the tile key** (public, used by the browser map). **MapTiler won't accept the
   `*.workers.dev` host as an origin restriction** — `workers.dev` is a shared public-suffix
   domain (so `workers.dev`, `*.count-game.workers.dev` are all rejected), and `localhost` is
   rejected as non-FQDN. So while the app is on `*.workers.dev`:
   - **`minyanim-tiles`** — Allowed HTTP Origins **empty**; guard it with a **usage cap / alert**
     (MapTiler Account → Usage) instead. Allowed User-Agent **empty**. Use this key for both
     `.env.local` and the deployed `VITE_MAPTILER_TILE_KEY`.
   - Exposure from an unrestricted *tile* key is only tile-quota abuse (no data, no geocoding) —
     bounded by the usage cap.
   - **When the app moves to a custom domain you own** (e.g. `minyanim.org`), set the tile key's
     Allowed HTTP Origins to that bare host (`minyanim.org`, `*.minyanim.org`) — those are
     accepted.

   > Gotchas seen: a full URL (`https://host`) → "Invalid origin restriction" (needs bare host);
   > `localhost`, `workers.dev`, and `*.count-game.workers.dev` are all rejected (non-FQDN /
   > public-suffix), which is why the tile key stays unrestricted + usage-capped until a custom
   > domain exists.
5. Note the **Flex tier** (~$25/mo) is generally needed at launch for commercial-style use and
   higher quotas; the free tier is non-commercial. Geocoding is **cached** server-side (Cache API,
   ~24h) and **rate-limited** to control quota — see contracts `/api/geo/search`.
6. Hebrew is supported via the geocoding `language=he` + `country=il` bias (used server-side).

## Where to put them

**Backend (geocoding secret)**

Local — `apps/backend/.dev.vars` (git-ignored):

```ini
MAPTILER_API_KEY=your_geocoding_key
```

Production — set on the deployed Worker (interactive; value never in chat/repo):

```bash
cd apps/backend && npx wrangler secret put MAPTILER_API_KEY
```

Add an empty `MAPTILER_API_KEY=` line to the tracked `apps/backend/.dev.vars.example`.

**Frontend (public tile key)**

The tile key is public and injected at build time via Vite. Until the app is on a custom domain,
the same **unrestricted, usage-capped** tile key is used for both local and deployed builds.

Local — `apps/frontend/.env.local` (git-ignored):

```ini
VITE_MAPTILER_TILE_KEY=your_tile_key   # minyanim-tiles (origins empty, usage-capped)
```

For deployed builds set the same key as a non-secret build var (Workers Builds env var / frontend
`wrangler.jsonc` `vars`). Add `VITE_MAPTILER_TILE_KEY=` to a tracked `apps/frontend/.env.example`.
Once on a custom domain, origin-restrict the key (step 4) — then optionally split dev/prod keys.

## Notes

- **Until a key is provided**, the backend geocoding service is mockable and e2e uses a
  `GEO_MODE=mock` backend var (canned results) — implementation does not block on the live key.
- **Privacy**: only the city search box is sent to MapTiler; the Stay's private specific address
  is never geocoded (research D1, FR-007).
- **Attribution**: render `© MapTiler © OpenStreetMap contributors` wherever results/the map
  appear (ToS requirement; returned by `/api/geo/search`).
- **CSP**: if the planned strict CSP (001 research D11) is implemented on the SPA, allowlist
  `https://api.maptiler.com` in `connect-src`/`img-src` and add `blob:` to `worker-src`/
  `child-src` (MapLibre spawns blob Web Workers); also import `maplibre-gl/dist/maplibre-gl.css`.
