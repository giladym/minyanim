# Architecture Decision Records (ADRs)

Each ADR captures one decision: its context, the decision, consequences, and the alternatives
considered. ADRs record the **rationale** behind the standards; the **binding** form of each
standard lives in the [constitution](../../.specify/memory/constitution.md).

Format per record: **Status · Context · Decision · Consequences · Alternatives**.

| # | Decision | Status |
|---|----------|--------|
| [0001](./0001-monorepo-two-app.md) | pnpm + Turborepo monorepo, two-app (frontend + backend) split | Accepted |
| [0002](./0002-frontend-stack.md) | Frontend: Vite React SPA + TanStack Router/Query on Workers Static Assets | Accepted |
| [0003](./0003-backend-layering-and-contracts.md) | Backend: layered Hono + Zod/OpenAPI contract-first | Accepted |
| [0004](./0004-logging.md) | Structured logging via Workers Observability (no Winston) | Accepted |
| [0005](./0005-fe-be-origin-service-binding.md) | FE↔BE via Service Binding (same origin, first-party cookies) | Accepted |
| [0006](./0006-deployment-git-connected.md) | Deployment via Git-connected Workers Builds (main→prod, previews on other branches) | Accepted |
| [0007](./0007-zmanim-server-side.md) | Zmanim computed server-side; only formatted times cross to the client | Accepted |
| [0008](./0008-contact-visibility.md) | Contact reachable before join, with a per-user phone opt-out (revises 003 SC-005/FR-011) | Accepted |

New ADRs are append-only; supersede rather than rewrite (note "Superseded by ADR-XXXX").
