# ADR-0001 — Monorepo with a two-application split

**Status**: Accepted (2026-06-18)

## Context

The product needs a clearly separated frontend and backend, each able to follow its own
best practices, while sharing request/response schemas and types. The runtime is Cloudflare.

## Decision

Use a **pnpm + Turborepo monorepo** with two deployable Cloudflare Worker apps —
`apps/frontend` and `apps/backend` — and a `packages/shared` package holding Zod schemas,
inferred types, error shapes, and constants consumed by both.

## Consequences

- Clean separation of concerns; each app has its own `wrangler.jsonc`, tests, and deploy.
- `packages/shared` is the single source of truth for payload contracts (no drift).
- Turborepo gives task caching and orchestrated build/test/lint across packages.
- Slightly more setup than a single app; justified by maintainability and the shared contract.

## Alternatives

- **Single deployable Worker** (the original 001 plan): simpler, but mixes FE/BE concerns and
  blocks independent evolution. Rejected per the product owner's two-app preference.
- **npm workspaces only**: works, but no task caching/orchestration.
- **Nx**: more powerful but heavier/more opinionated than needed.
