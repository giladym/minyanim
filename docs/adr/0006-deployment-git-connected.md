# ADR-0006 — Deployment via Git-connected Workers Builds

**Status**: Accepted (2026-06-18)

## Context

Two Workers (`minyanim-frontend`, `minyanim-backend`) live in one monorepo on GitHub
(`giladym/minyanim`). We need a deployment/CI-CD model that maps to our branching workflow
and avoids manual prod deploys.

## Decision

Use **Cloudflare Workers Builds (Git connection)** for CI/CD:

- **Two Workers Builds projects** on the same repo, each with its own **root directory** and
  build/deploy command:
  - `apps/frontend` → build SPA → `wrangler deploy` (frontend `wrangler.jsonc`)
  - `apps/backend` → `wrangler deploy` (backend `wrangler.jsonc`)
- **Branch → environment**: **`main` = production**; other branches (`develop`, feature) get
  **preview deployments**. Matches the constitution branching model.
- **Wrangler CLI** is used for **local dev** and the **first bring-up** (before Git is
  connected). The `wrangler.jsonc` files serve both CLI and Workers Builds unchanged.
- **Production guardrail**: `main` is gated behind PR review; production deploys are never
  auto-triggered without that review. Runtime secrets are set via `wrangler secret` /
  dashboard (not in the repo or build config).

## Consequences

- Hands-off deploys on push; preview URL per branch for review.
- The backend stays private (`workers_dev = false`); reached via the Service Binding (ADR-0005).
- Requires: app code pushed to the repo, and a one-time GitHub authorization in the Cloudflare
  dashboard (interactive — done by the account owner).

## Alternatives

- **Wrangler CLI only**: simplest, but no CI/CD; manual deploys. Used only for local dev +
  first bring-up.
- **External CI (GitHub Actions running wrangler)**: viable and more flexible, but Workers
  Builds is native and lower-maintenance. Revisit if build needs outgrow it.
