# Seed import (dev-only)

A staged pipeline for loading a one-time spreadsheet of community members into the app as **seed
users** (temporary, unregistered people whose trips/minyanim are visible; they get claimed & merged
when the real person signs up with a matching phone — see feature F4).

**Runs locally, against DEV only.** It never runs in CI or against production. It processes personal
data (names/phones/locations), so it stays on your machine — no data is uploaded anywhere by these
scripts. Requires **Node ≥ 22.6** (uses built-in TypeScript type-stripping + `node:test`; no deps).

## Why staged

Each step writes a reviewable artifact so we can inspect and gate the data before anything touches
the database:

```
  your sheet ──(export CSV)──▶ inspect ──▶ raw.json + profile.json      ← STEP 1  (done)
                                              │  (review: what is a row? which cols map to what?)
                                              ▼
                                           map + schema-validate ──▶ records.json        ← STEP 2
                                              │  (Zod against a seed contract; per-row errors)
                                              ▼
                                           quality gates ──▶ accepted.json + rejected.json ← STEP 3
                                              │  (valid E.164 phone, resolvable location via geocode)
                                              ▼
                                           create seed users/stays(/events)  ← STEP 4 (dev D1, --dry-run first)
```

Only rows that pass every gate are eligible to create. `--dry-run` (step 4) reports exactly what
*would* be created without writing.

## Step 1 — inspect / convert  ✅

Export the sheet to CSV (Google Sheets → *File → Download → Comma-separated values*), then:

```sh
node tools/seed-import/src/inspect.ts <path/to/export.csv> --out <path/to/outdir>
```

Writes:
- **`raw.json`** — every row as an object keyed by its column header (ordered as in the sheet).
- **`profile.json`** — per-column report: fill rate, distinct count, up to 5 sample values, and a
  **guessed kind** (`phone` / `email` / `date` / `number` / `location` / `name` / `text` / `empty`)
  inferred from the header name *and* the values.

Use `profile.json` to answer **"what does a row represent?"** (one person + one trip? one person
with many trips across rows? does a row also describe a hosted minyan?) — that decision drives the
seed schema and steps 2–4.

## Steps 2–4 — map → gate → SQL (dry-run)  ✅

One command runs the rest of the pipeline and writes reviewable artifacts (never touches a DB):

```sh
# 1) capture the phones already owned by REAL users (collision-gate input):
wrangler d1 execute minyanim --remote --json \
  --command "SELECT p.e164 AS e164 FROM phone_number p JOIN \"user\" u ON u.id=p.user_id WHERE u.kind='real'" \
  > existing-real-phones.json

# 2) map + gate + generate SQL (dry-run):
node tools/seed-import/src/build.ts <export.csv> --out <outdir> --existing-phones existing-real-phones.json
```

Writes `records.json` (Step 2 map), `accepted.json` / `rejected.json` (Step 3 gates), and `upsert.sql`
(Step 4). Gates: **E.164 phone**, **resolvable city** (`MappingConfig.cityCountry`), **valid dates**,
and the **collision gate** — a seed whose phone already belongs to a real user is reported + excluded
(never create a redundant seed the person would "claim" from themselves). Candidate minyanim are derived
from stay coverage (a person attends a Shabbat within their dates); each event is hosted by a real seed
attendee. `upsert.sql` leads with `DELETE FROM "user" WHERE kind='seed'` → idempotent re-apply.

The sheet layout lives in **`ZAKOPANE_MAPPING`** (`mapping.ts`) — header-row offset + column→field map
+ city→country/coords + the season's Shabbatot. Point it at a different sheet by editing/adding a config.

**Apply (dev only, manual — writes real PII):**

```sh
wrangler d1 execute minyanim --remote --file <outdir>/upsert.sql
```

## Tests

```sh
node --test tools/seed-import/src/*.test.ts
```

## Status

- [x] Step 1 — inspect / convert (`inspect.ts`, `csv.ts`, `profile.ts`)
- [x] Step 2 — map (`mapping.ts`: `MappingConfig` + `mapSheet`; `ZAKOPANE_MAPPING`)
- [x] Step 3 — quality + collision gates (`gates.ts`: `toE164`, `toIso`, `gate`, `deriveEvents`)
- [x] Step 4 — SQL generation + dry-run CLI (`sql.ts`, `build.ts`) → reviewable `upsert.sql`, applied manually via wrangler
