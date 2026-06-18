# ADR-0005 — Frontend↔Backend wiring via Service Binding

**Status**: Accepted (2026-06-18)

## Context

The two-app split (ADR-0001) raises a question that directly affects authentication: how does
the browser reach the backend, and what does that mean for session cookies and CORS?

## Decision

The **frontend Worker** is the only public origin. It forwards API calls to the **backend
Worker** via a **Cloudflare Service Binding** (the backend is not publicly routed). To the
browser there is a single origin, so the session cookie is **first-party**
(`HttpOnly; Secure; SameSite=Lax`) and there is **no CORS**.

## Consequences

- Simplest, safest cookie story — no `SameSite=None`, no cross-origin credential handling.
- Backend is private (reduced attack surface); FE proxies `/api/*` to it via the binding.
- Local dev mirrors this with the `@cloudflare/vite-plugin` binding configuration.
- Slight coupling: the binding must be configured in the frontend Worker's `wrangler.jsonc`.

## Implementation note — SPA fallback vs. the `/api/*` proxy (critical)

The frontend uses Workers Static Assets with `not_found_handling: "single-page-application"`.
By default the asset layer serves `index.html` for **navigation requests** (those carrying
`Accept: text/html` / `Sec-Fetch-Mode: navigate`) **before the Worker script runs** — even for
`/api/*` paths. Plain `fetch`/XHR and `curl` (no navigation headers) fall through to the Worker
and proxy correctly, which makes this easy to miss in testing.

The trap surfaces on **top-level navigations to `/api/*`** — most importantly the **OAuth
callback** (`GET /api/auth/callback/google?code=…`), which Google reaches via a browser
redirect. Without mitigation the SPA shell is served instead of the proxy running, so the
callback never reaches the backend and the router renders "Not Found".

**Required config** in `apps/frontend/wrangler.jsonc`:

```jsonc
"assets": {
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]   // proxy Worker wins for API paths; SPA serves the rest
}
```

Any future first-party path the browser *navigates* to (not just `fetch`es) and that must reach
the backend has to be covered by `run_worker_first`. Verify with navigation headers, not bare
`curl`:

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  -H "Accept: text/html" -H "Sec-Fetch-Mode: navigate" \
  https://<frontend>/api/auth/callback/google   # expect 302 application/json, NOT 200 text/html
```

## Alternatives

- **Subdomains** (`app.` + `api.` of one domain): public backend; `SameSite=Lax` still works
  but requires CORS-with-credentials config. More moving parts.
- **Cross-site** (different registrable domains): requires `SameSite=None; Secure` + full CORS.
  Most friction; only if the apps genuinely cannot share a domain.
