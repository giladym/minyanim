# Secrets & Configuration

One consistent rule for the whole project. `.env` is **not** the mechanism for Worker secrets.

## The model

| Kind | Where (local) | Where (production) | Accessed via |
|------|---------------|--------------------|--------------|
| **Backend secret** (Google client secret, auth secret, API keys, DB tokens) | `apps/backend/.dev.vars` | `wrangler secret put` (or Cloudflare **Secrets Store** binding) | the Worker **`env`** binding |
| **Backend non-secret config** (flags, public IDs) | `[vars]` in `wrangler.jsonc` | `[vars]` in `wrangler.jsonc` | `env` binding |
| **Frontend public config** (e.g. public API base) | `apps/frontend/.env` with `VITE_` prefix | build-time `VITE_` env | `import.meta.env.VITE_*` |

### Rules

1. **Secrets are read only through the `env` binding** — never `process.env`, never hard-coded.
2. **Never** put a secret in `.env`, in `wrangler.jsonc` `[vars]`, or anywhere in client code
   (everything in the frontend bundle is public).
3. `**.dev.vars**` is the local secret file for a Worker and **MUST be git-ignored** (it is, via
   the root `.gitignore`). Commit a **`.dev.vars.example`** with empty placeholders instead.
4. Frontend `VITE_`-prefixed values are **public by definition** — only non-sensitive config.
5. Provide a typed accessor (e.g. an `Env` interface + a small `getConfig(env)`), so all utils
   resolve config the same way.

## Local setup

```bash
# apps/backend/.dev.vars  (git-ignored)
GOOGLE_CLIENT_ID="…"
GOOGLE_CLIENT_SECRET="…"
BETTER_AUTH_SECRET="…"
```

## Production

```bash
cd apps/backend
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET
# or bind entries from Cloudflare Secrets Store in wrangler.jsonc (account-level secrets)
```

## Retrieving the values

Per-integration instructions (how to create credentials) live in
[`integrations/`](./integrations/) — e.g. [Google OAuth](./integrations/google-oauth-setup.md).
