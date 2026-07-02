# Architecture Overview

High-level map of the Minyanim system. **Binding standards** live in the
[constitution](../.specify/memory/constitution.md); **rationale** for each choice lives in
[`adr/`](./adr/); **product decomposition** lives in [`specs/ROADMAP.md`](../specs/ROADMAP.md).

## Shape

A **pnpm + Turborepo monorepo** with two deployable Cloudflare applications and shared code:

```text
minyanim/
├── apps/
│   ├── frontend/            # React SPA (Vite) on Workers Static Assets
│   │   ├── src/
│   │   │   ├── routes/      # TanStack Router (file-based, type-safe)
│   │   │   ├── components/  # base/shared components
│   │   │   ├── features/    # feature-scoped UI + hooks
│   │   │   ├── lib/         # api client, query client (TanStack Query)
│   │   │   ├── i18n/        # he/en resources (no hard-coded strings)
│   │   │   └── theme/       # token CSS vars, no-flash script, ThemeProvider
│   │   └── wrangler.jsonc
│   └── backend/             # Hono API on Workers (private, behind a Service Binding)
│       ├── src/
│       │   ├── routes/      # router layer (Hono + @hono/zod-openapi)
│       │   ├── controllers/ # I/O mapping (validate → call service → shape response)
│       │   ├── services/    # business logic
│       │   ├── repositories/# data access (Drizzle); isolates the ORM
│       │   ├── db/          # schema.ts, client, migrations source
│       │   ├── middleware/  # auth, security headers, CORS, rate-limit, error, request-id
│       │   ├── lib/         # logger, errors, calendar (server-side)
│       │   └── openapi/     # OpenAPI doc + Swagger UI mount
│       └── wrangler.jsonc
├── packages/
│   └── shared/              # Zod schemas + inferred types + error shapes + constants
│                            #   (single source of truth for request/response payloads)
├── docs/                    # this folder (architecture, ADRs, secrets, integrations)
├── design/                  # design system + homepage assets
└── specs/                   # spec-kit features + ROADMAP
```

## Request flow

```
Browser → Frontend Worker (SPA + static) ──Service Binding──▶ Backend Worker (Hono)
                                                              router → controller → service → repository → D1
```

The browser only ever talks to the frontend origin; the backend Worker is private and reached
via a **Service Binding**, so session cookies are first-party and there is no CORS
([ADR-0005](./adr/0005-fe-be-origin-service-binding.md)).

## Conventions (summary — see constitution for the binding form)

- **Contract-first**: payload schemas are Zod in `packages/shared`; backend publishes them via
  `@hono/zod-openapi` + Swagger UI; frontend imports the same types. ([ADR-0003](./adr/0003-backend-layering-and-contracts.md))
- **i18n only**: no hard-coded user-facing strings. **Tokens only**: no hard-coded colors.
- **Secrets** via `env` bindings only — see [secrets.md](./secrets.md).
- **Logging**: structured JSON → Workers Observability (no Winston). ([ADR-0004](./adr/0004-logging.md))
- **Errors**: centralized handler + typed error hierarchy + shared error schema.
- **Comments**: JSDoc on exported symbols, concise, *why* not *what*.
- **Testing**: vitest-pool-workers (backend), Vitest + Testing Library (frontend), Playwright +
  axe-core (e2e + WCAG AA).

## Key references

- Standards (binding): [constitution](../.specify/memory/constitution.md) v1.1.0
- Decisions (rationale): [`adr/`](./adr/)
- Secrets handling: [secrets.md](./secrets.md)
- API-key retrieval guides: [`integrations/`](./integrations/)
- Design tokens: [`design/DESIGN-SYSTEM.md`](../design/DESIGN-SYSTEM.md)
