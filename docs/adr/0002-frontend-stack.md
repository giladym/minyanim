# ADR-0002 — Frontend stack

**Status**: Accepted (2026-06-18)

## Context

React is fixed by the constitution. We need routing, server-state/caching, i18n (Hebrew/RTL),
extensible theming, and SEO for the marketing homepage — without meta-framework lock-in — on
Cloudflare.

## Decision

- **Vite + React SPA** on **Cloudflare Workers Static Assets** via `@cloudflare/vite-plugin`.
- **TanStack Router** (type-safe, file-based) for routing; **TanStack Query** for server state
  and caching.
- **react-i18next** for i18n; **Tailwind v4** logical properties for RTL-first layout.
- **CSS-variable design tokens** with light/dark/system + a no-flash inline script; theme
  preference persisted to profile + localStorage.
- **Marketing homepage prerendered to static HTML** for SEO; the app shell is client-rendered.

## Consequences

- Type-safe routing/data with minimal boilerplate; no SSR framework to maintain.
- Themes are layered/extensible via tokens; switching is instant and flash-free.
- SEO covered for the public page without adopting SSR everywhere.

## Alternatives

- **TanStack Start** / React Router framework mode (SSR): more capability, but meta-framework
  lock-in and unnecessary for the app shell. Reconsider only if per-request SSR is needed.
- **Redux/Zustand for server state**: TanStack Query already covers caching/sync; keep global
  client state minimal (constitution Principle V).
