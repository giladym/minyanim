# dev-seed — local test data for the Stay location-change guard (013)

A **dev-only**, zero-dependency Node script that seeds test users and a **linked minyan** through the
real API (better-auth email/password + `/api/stays`, `/api/events`, `/api/events/:id/commit`). It is
meant for **local, throwaway** dev databases only — it never runs migrations and never targets prod.

It exists to make the feature-013 "Stay location-change guard" easy to test by hand: it creates a
host who hosts a minyan **from** a stay, and a guest who joins that minyan **from** their own stay, so
both have a minyan linked to their stay via `commitment.stayId` (what the guard reads).

## What it creates

| Login (password `password123`) | Data |
| --- | --- |
| `regular@test.local` | one plain stay, no minyan |
| `host@test.local` | **Stay S**, then **Minyan M** hosted *from* S (`event.stayId = S`) |
| `guest@test.local` | **Stay G** (same city/date as M), then a commitment to M *from* G (`commitment.stayId = G`) |
| `admin-e2e@example.com` | account only — see "Admin" below |

Dates: the script computes the next Saturday at least 14 days out (the minyan's Shabbat) and sets each
stay to Friday → Sunday around it, so the server's "not in the past" checks always pass. Override the
base date with `--date YYYY-MM-DD`.

## Prerequisites — run a local backend on port 8787

Because better-auth stores **hashed** passwords, the script seeds via real sign-up/sign-in flows, so a
backend must be running locally. Start it with dev-friendly flags (no email verification, no rate
limits, mocked geocoding, and the admin allowlist):

```sh
pnpm --filter @minyanim/backend dev --port 8787 --local \
  --var REQUIRE_EMAIL_VERIFICATION:false \
  --var RATE_LIMIT_DISABLED:true \
  --var GEO_MODE:mock \
  --var ADMIN_EMAILS:admin-e2e@example.com
```

- `REQUIRE_EMAIL_VERIFICATION:false` — lets a freshly signed-up user sign in immediately.
- `RATE_LIMIT_DISABLED:true` — avoids throttling during the burst of seed requests.
- `GEO_MODE:mock` — no external geocoding calls (the script passes explicit lat/lng anyway).
- `ADMIN_EMAILS:admin-e2e@example.com` — promotes that account to admin on sign-in (see below).

`--local` keeps everything in the local Miniflare D1 — a disposable dev database.

## Run

```sh
node tools/dev-seed/seed.mjs
# custom API base:
node tools/dev-seed/seed.mjs --api http://localhost:8787
API_BASE=http://localhost:8787 node tools/dev-seed/seed.mjs
# custom base date (minyan lands on the next Saturday ≥ 14 days after this):
node tools/dev-seed/seed.mjs --date 2026-08-01
```

The script logs every step, tolerates "user already exists" (it re-signs-in), and exits non-zero only
on a real failure (network error / 5xx / unexpected rejection). At the end it prints the logins, stay
ids, and the minyan id, plus the manual test steps.

## Admin

Admin is **env-gated** — the script does **not** try to create an admin. It only ensures the
`admin-e2e@example.com` account exists so it can sign in. That account becomes an admin **only** when
its email is in the backend's `ADMIN_EMAILS` allowlist (as in the local command above, which mirrors
the Playwright config). On the deployed dev environment the real admin is the operator's own account —
do not rely on the seeded admin identity there.

## Manual test — Stay location-change guard (013)

1. Sign in as `host@test.local`, open **Stay S**, edit it and change the **city**. The location-change
   guard should list **Minyan M** with the host relationship.
2. Sign in as `guest@test.local`, edit **Stay G** and change the **city**. The guard should list the
   same **Minyan M** with the participant relationship.

API-level check (either stay id): `GET /api/stays/<id>/linked-minyanim` returns Minyan M.

## Notes / safety

- Dev-only. Do not point `--api` / `API_BASE` at a production or shared deployment.
- Zero dependencies — uses Node's built-in `fetch` (Node 18+). Node's fetch does not persist cookies,
  so the script keeps a tiny per-user cookie jar: it captures `set-cookie` from sign-in and replays it
  as the `cookie` header on that user's subsequent requests.
- Idempotent-ish: re-running signs the same users back in and creates **additional** stays/minyan each
  time (stays/events are not deduplicated). Reset by wiping the local D1 if you want a clean slate.
