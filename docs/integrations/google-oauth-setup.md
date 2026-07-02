# Integration Setup — Google OAuth (Sign in with Google)

How to obtain the Google OAuth credentials the backend needs for Google SSO, and where to put
them. Secrets handling follows [`../secrets.md`](../secrets.md) — values go in `.dev.vars`
(local) / `wrangler secret` (prod), never in `.env` or the repo.

## What you'll get

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Steps

1. Open the **Google Cloud Console** → create or select a project.
2. **APIs & Services → OAuth consent screen**: configure it (External), app name, support
   email, and the scopes `openid`, `email`, `profile`. Add test users while in "Testing".
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. **Authorized redirect URIs** — add the backend callback for each environment:
   - Local dev: `http://localhost:5173/api/auth/callback/google`
   - Staging/Prod: `https://<your-domain>/api/auth/callback/google`
   (Path matches the better-auth Google callback; adjust if the auth base path changes.)
6. Create → copy the **Client ID** and **Client secret**.

> Use a **separate OAuth client per environment** (dev/staging/prod). Never point a local run
> at production credentials or data.

## Where to put them

**Local** — `apps/backend/.dev.vars` (git-ignored):

```
GOOGLE_CLIENT_ID="…"
GOOGLE_CLIENT_SECRET="…"
```

**Production**:

```bash
cd apps/backend
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

The backend reads them via the `env` binding (see [`../secrets.md`](../secrets.md)). The
frontend never sees the client secret.

## Verify

Run the app, click "התחברו עם Google", complete consent, and confirm you land on the
dashboard with a session cookie set. If you get `redirect_uri_mismatch`, the URI in step 5
does not exactly match the callback URL (scheme, host, port, and path must match).
