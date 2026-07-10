# Places import (dev-only)

Staged importer that populates the `place`/`layer` catalogue (feature 010) from **OpenStreetMap**
via the Overpass API. Categories (see `src/categories.ts`): **Chabad houses**, **synagogues**, **kosher restaurants**,
**kosher shops**, **Jewish cemeteries**, and **mikvehs**. Chabad houses (denomination or
Chabad/Lubavitch name) are classified before synagogues and merge into feature 011's existing
`layer_chabad_houses`. OSM is open data (**ODbL**, attribution
required); every imported place records its source + license and the UI renders
`© OpenStreetMap contributors`.

Two scopes: a **bbox** (`--bbox`, one area) or the **whole world** (`--global`). Global works because
these Jewish/kosher tags are globally rare (~7.4k synagogues, ~5.9k cemeteries, ~2.3k kosher, ~2
mikvehs), so a tag-indexed query needs no bbox tiling. Each category is fetched as its own query
(robust against per-query timeouts + politer to the server), with retry/backoff.

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

# whole world (no bbox). --endpoint points at a mirror when the main server rate-limits:
node tools/places-import/src/cli.ts --global --out ./places-world --dry-run \
  --endpoint https://maps.mail.ru/osm/tools/overpass/api/interpreter

# review ./places-out/accepted.json + rejected.json, then apply:
wrangler d1 execute minyanim --local  --file=./places-out/upsert.sql   # dev
wrangler d1 execute minyanim --remote --file=./places-out/upsert.sql   # prod — explicit authorization
```

`--endpoint <url>` (or `OVERPASS_URL` env) overrides the Overpass server. The main
`overpass-api.de` rate-limits rapid/global bursts (HTTP 406/429); a mirror is more reliable for a
`--global` run.

- **Idempotent**: the upsert keys on the unique `(source, source_id)` index — re-running updates
  existing rows, never duplicates.
- **Dedupe**: exact source-id repeats and same-name places within ~40 m are rejected (reported in
  `rejected.json`).
- **Layers**: creates `Chabad houses` / `Synagogues` / `Kosher restaurants` / `Kosher shops` /
  `Jewish cemeteries` / `Mikvehs` via `INSERT OR IGNORE`
  (won't clobber an admin-renamed layer; if a layer *name* already exists under a different id,
  resolve manually — the SQL is reviewable). Admins can rename/reorder afterwards in `/admin`.

## Tests

```sh
node --test tools/places-import/src/*.test.ts
```

## Status

- [x] Overpass query + fetch (bbox **and** `--global`), map + classify, quality gates, idempotent
      upsert SQL, CLI, tests. Committed seed: `seed/places-world.json` (canonical) + `.sql` (derived).
- [ ] Known OSM data gap: mikvehs are barely tagged (`amenity=mikvah` ≈ 2 worldwide); unnamed
      cemeteries are dropped (name-required). Both are OSM-coverage limits, not tool bugs.
- [ ] Optional later: scheduled runs (Cloudflare Cron Trigger / CI); reconciliation pass to
      soft-delete places removed upstream; Google Places live-lookup enrichment (never stored — ToS);
      proprietary directories (by permission).
