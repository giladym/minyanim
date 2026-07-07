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

## Tests

```sh
node --test tools/seed-import/src/*.test.ts
```

## Status

- [x] Step 1 — inspect / convert (`inspect.ts`, `csv.ts`, `profile.ts`)
- [ ] Step 2 — map + Zod schema validation (pending: row-semantics decision from the profile)
- [ ] Step 3 — quality gates (E.164 phone normalization; location resolution via the app's geocoder)
- [ ] Step 4 — create seed users/stays(/events) against dev D1, `--dry-run` first
