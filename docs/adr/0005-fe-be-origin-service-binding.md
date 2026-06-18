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

## Alternatives

- **Subdomains** (`app.` + `api.` of one domain): public backend; `SameSite=Lax` still works
  but requires CORS-with-credentials config. More moving parts.
- **Cross-site** (different registrable domains): requires `SameSite=None; Secure` + full CORS.
  Most friction; only if the apps genuinely cannot share a domain.
