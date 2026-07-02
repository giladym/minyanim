# ADR-0003 — Backend layering & contract-first API

**Status**: Accepted (2026-06-18)

## Context

The backend must be maintainable, testable, and expose a typed, documented API whose payload
schemas stay in sync with the frontend. Runtime is Cloudflare Workers.

## Decision

- **Hono** as the Worker API framework.
- **Layered architecture**: `router → controller → service → repository`.
  - *router*: route definitions + validation (`@hono/zod-openapi`).
  - *controller*: maps validated input → service calls → response shape.
  - *service*: business logic; framework-agnostic.
  - *repository*: data access via **Drizzle ORM** (isolates D1; use `db.batch`, no interactive
    transactions). Keep layers thin — a trivial read need not traverse all four.
- **Contract-first**: request/response payloads are **Zod schemas in `packages/shared`**. The
  backend builds its routes with `@hono/zod-openapi`, auto-generates the **OpenAPI document**,
  and serves **Swagger UI** (`@hono/swagger-ui`). The frontend imports the same shared types
  directly (no codegen); external consumers can use the OpenAPI doc.
- **Cross-cutting**: centralized error handler + typed `AppError` hierarchy + shared error
  schema; middleware for auth, security headers, CORS (n/a behind a service binding),
  rate-limiting, and request-id; structured logging ([ADR-0004](./0004-logging.md)).

## Consequences

- Single source of truth for payloads; FE and BE cannot drift.
- Swagger UI gives live API docs for free from the Zod route definitions.
- Clear testing seams (service logic unit-tested without HTTP).

## Alternatives

- **No repository layer** (services call Drizzle directly): fewer files, but couples business
  logic to the ORM. Rejected for maintainability; repositories may be thin.
- **`openapi-typescript` codegen for FE types**: viable, but importing shared Zod is simpler
  (KISS). Revisit if external/non-TS consumers need generated clients.
- **Manual OpenAPI authoring**: drifts from code; rejected in favor of generation from Zod.
