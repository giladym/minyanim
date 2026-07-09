# Places import (dev-only)

Staged importer that populates the `place`/`layer` catalogue (feature 010) from **OpenStreetMap**
via the Overpass API — synagogues, kosher-tagged eateries, and mikvehs, worldwide. OSM is open data
(**ODbL**, attribution required); every imported place records its source + license and the UI renders
`© OpenStreetMap contributors`.

**Runs locally, dev by default.** The tool never connects to the database — its last stage emits
**SQL you review**, then you apply it with `wrangler`. Applying to `--remote` (prod) is the explicit
authorization step. Requires **Node ≥ 22.6** (built-in TS type-stripping + `node:test`; no deps).

## Staged pipeline

```
  Overpass (bbox) ─▶ fetch ─▶ raw.json
                                │
                                ▶ map + validate ─▶ mapped.json        (named + located + classified)
                                │
                                ▶ gate ─▶ accepted.json + rejected.json (dedupe by source id + proximity)
                                │
                                ▶ emit ─▶ upsert.sql                    (layers + idempotent place upsert)
```

## Run

```sh
# bbox is "south,west,north,east" (Overpass order). Start with --dry-run to review before emitting SQL.
node tools/places-import/src/cli.ts --bbox "51.28,-0.51,51.69,0.33" --out ./places-out --dry-run
node tools/places-import/src/cli.ts --bbox "51.28,-0.51,51.69,0.33" --out ./places-out

# review ./places-out/accepted.json + rejected.json, then apply:
wrangler d1 execute minyanim --local  --file=./places-out/upsert.sql   # dev
wrangler d1 execute minyanim --remote --file=./places-out/upsert.sql   # prod — explicit authorization
```

- **Idempotent**: the upsert keys on the unique `(source, source_id)` index — re-running updates
  existing rows, never duplicates.
- **Dedupe**: exact source-id repeats and same-name places within ~40 m are rejected (reported in
  `rejected.json`).
- **Layers**: creates `Synagogues` / `Kosher restaurants` / `Mikvehs` via `INSERT OR IGNORE`
  (won't clobber an admin-renamed layer; if a layer *name* already exists under a different id,
  resolve manually — the SQL is reviewable). Admins can rename/reorder afterwards in `/admin`.

## Tests

```sh
node --test tools/places-import/src/*.test.ts
```

## Status

- [x] Overpass query + fetch, map + classify, quality gates, idempotent upsert SQL, CLI, tests.
- [ ] Optional later: scheduled runs (Cloudflare Cron Trigger / CI); Google Places live-lookup
      enrichment (never stored — ToS); proprietary directories (by permission).
