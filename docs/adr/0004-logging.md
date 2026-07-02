# ADR-0004 — Logging

**Status**: Accepted (2026-06-18)

## Context

We want structured, searchable application logs with consistent fields (level, request id,
route, user id where relevant). The runtime is Cloudflare Workers.

## Decision

Use a **thin shared structured-logger utility** that emits **JSON to `console`**, captured by
**Cloudflare Workers Logs / Observability**. Use **Logpush** to forward to R2 or an external
sink (e.g. Axiom/Datadog) if/when richer querying is needed. Every request gets a request id
propagated through the logger; errors are logged centrally by the error middleware.

## Consequences

- Zero runtime-compatibility risk; no Node dependencies.
- Consistent JSON shape enables filtering in the Cloudflare dashboard and downstream tools.
- Adding an external sink later is config (Logpush), not a code rewrite.

## Alternatives

- **Winston** — **forbidden**: depends on Node streams/transports/`process`; does not run
  reliably on the Workers runtime even with `nodejs_compat`.
- **pino**: core console logging works, but its transport ecosystem is Node-oriented and only
  partly supported on Workers — more friction than value here.
- **External SDK (Axiom/Datadog) as primary**: richer, but adds a vendor + cost up front;
  start native, add via Logpush when justified.
