# Integration Setup — Cloudflare (Workers, D1, bindings)

How to set up the Cloudflare side for both apps: tool versions, the exact `wrangler.jsonc`
flags, and the bindings. Secrets handling follows [`../secrets.md`](../secrets.md).

## Account & naming (decided 2026-06-18)

- **Shared Cloudflare account** (subdomain `count-game` — one per account; cannot add a second).
- Workers kept separate by **name**: `minyanim-frontend`, `minyanim-backend`.
- Dev URLs: `minyanim-frontend.count-game.workers.dev` (backend stays private via the Service
  Binding, `workers_dev = false`).
- **Custom domain deferred** — attach later to the frontend Worker without rework; the
  `count-game` URL never needs to be public.

## Versions (pin these in `package.json`)

| Tool | Version | Notes |
|------|---------|-------|
| **Wrangler** | **v4** (latest stable) | CLI + local runtime; pin the exact version. Prefer `wrangler.jsonc` over `wrangler.toml`. |
| **@cloudflare/vite-plugin** | **v1.x** (GA) | Runs the real `workerd` runtime in `vite dev`; builds the frontend for Workers. |
| **Node** (tooling only) | **22 LTS+** | wrangler v4 requires Node ≥22; for the build toolchain; the Workers runtime itself is not Node. |
| pnpm | latest | Monorepo package manager (see ADR-0001). |

```bash
wrangler login              # authenticate the CLI to your Cloudflare account
wrangler --version          # confirm v4
```

## Required compatibility flags

- **`compatibility_date`**: set to a **recent date** (the date you scaffold) and pin it. Use a
  date **≥ 2024-09-23** so Node.js compatibility v2 is active.
- **`compatibility_flags: ["nodejs_compat"]`**: **required** — `better-auth` needs Node.js
  compat on the Workers runtime. Set this on the **backend** Worker (and the frontend Worker
  only if it imports code that needs it — usually it does not).
- **`observability: { enabled: true }`**: turns on Workers Logs (our logging sink — see
  [ADR-0004](../adr/0004-logging.md)).

## Backend Worker — `apps/backend/wrangler.jsonc`

```jsonc
{
  "name": "minyanim-backend",
  "main": "src/index.ts",
  "compatibility_date": "2025-XX-XX",          // set to scaffold date, ≥ 2024-09-23
  "compatibility_flags": ["nodejs_compat"],     // required for better-auth
  "observability": { "enabled": true },         // Workers Logs
  "d1_databases": [
    { "binding": "DB", "database_name": "minyanim", "database_id": "<from `wrangler d1 create`>" }
  ]
  // KV (optional, ephemeral data):
  // "kv_namespaces": [{ "binding": "KV", "id": "<from `wrangler kv namespace create`>" }]
}
```

Secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`) are **not** listed
here — they come from `.dev.vars` (local) / `wrangler secret put` (prod). See
[`../secrets.md`](../secrets.md).

## Frontend Worker — `apps/frontend/wrangler.jsonc`

```jsonc
{
  "name": "minyanim-frontend",
  "main": "src/worker.ts",                       // entry that serves assets + proxies /api
  "compatibility_date": "2025-XX-XX",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"   // SPA fallback to index.html
  },
  "services": [
    { "binding": "BACKEND", "service": "minyanim-backend" }   // Service Binding (ADR-0005)
  ]
}
```

The browser only hits the frontend origin; `/api/*` is forwarded to `BACKEND` via the Service
Binding (first-party cookies, no CORS).

## Deployment — Git-connected Workers Builds (ADR-0006)

CI/CD via **Cloudflare Workers Builds** connected to the GitHub repo:

- **Two Workers Builds projects** (one per app), same repo, different **root directory**:
  - `apps/frontend` → build SPA, deploy with the frontend `wrangler.jsonc`
  - `apps/backend` → deploy with the backend `wrangler.jsonc`
- **Branches**: `main` → **production**; `develop`/feature branches → **preview** deployments.
- **First bring-up** uses the Wrangler CLI (no Git connection yet); connect Git once app code
  is pushed. Connecting requires a one-time **GitHub authorization** in the Cloudflare dashboard
  (interactive — account owner does it).
- **Guardrail**: `main` is gated behind PR review; production is never auto-deployed without it.
  Runtime secrets via `wrangler secret` / dashboard — never in the repo or build config.

## Create the resources

```bash
wrangler d1 create minyanim                       # copy database_id into backend wrangler.jsonc
# wrangler kv namespace create KV                 # if using KV

# migrations (from apps/backend)
npx drizzle-kit generate
wrangler d1 migrations apply minyanim --local
wrangler d1 migrations apply minyanim --remote    # when deploying
```

## First manual deploy (dev) — T059

`APP_BASE_URL` in `wrangler.jsonc` `[vars]` is the **local-dev** value (`http://localhost:5173`).
Do NOT hardcode the deployed URL there — it would break local dev. Instead pass the public URL
at deploy time with `--var`:

```bash
# 1) Backend secrets (interactive — values never enter source/chat)
cd apps/backend
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET           # a fresh prod secret, not the .dev.vars one

# 2) Remote D1 migrations
wrangler d1 migrations apply minyanim --remote

# 3) Backend — override APP_BASE_URL with the public frontend origin
wrangler deploy --var APP_BASE_URL:https://minyanim-frontend.count-game.workers.dev

# 4) Frontend (after the backend exists, so the Service Binding resolves)
cd ../frontend && pnpm build:prerender && wrangler deploy
```

Then in the Google Console add the deployed redirect URI:
`https://minyanim-frontend.count-game.workers.dev/api/auth/callback/google`.

(Proper per-environment config — separate Worker names + D1 + secrets per dev/staging/prod —
is research D14, deferred. This deploys the single Worker; treat it as dev/staging.)

## Local secrets from your `.private` vault

You stored the Google credentials in `.private` (git-ignored). For the app to read them
locally, copy the values into **`apps/backend/.dev.vars`** (also git-ignored) — that is where
the Worker's `env` binding reads them. Keep a tracked **`.dev.vars.example`** with empty keys.

## Tip

The `cloudflare-bindings` and `cloudflare-observability` MCP servers (see `.mcp.json`) can
manage D1/bindings and read Workers Logs during development — optional, OAuth-based, no secret
stored.
