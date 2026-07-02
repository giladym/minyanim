# Phase 0 Research — Platform Foundation

Date: 2026-06-18 · Feature: 001-platform-foundation

The stack is fixed by the [constitution](../../.specify/memory/constitution.md) (React +
Cloudflare Workers + D1 + Tailwind RTL). Research below resolves *how* to assemble it.

---

> **Revision (2026-06-18)**: architecture moved to a **two-app pnpm+Turborepo monorepo**
> (frontend + backend Workers via Service Binding) and **TanStack Router/Query**, per
> constitution v1.1.0. See [docs/architecture.md](../../docs/architecture.md) and
> [docs/adr/](../../docs/adr/) 0001–0005. D1/D2/D4 below reflect this.

## D1. App architecture & hosting

- **Decision**: **pnpm + Turborepo monorepo**. `apps/frontend` = Vite + React **SPA on Workers
  Static Assets** (`@cloudflare/vite-plugin`) using **TanStack Router** (type-safe, file-based)
  + **TanStack Query** (server-state/caching). `apps/backend` = layered Hono Worker.
  `packages/shared` = Zod contracts. Marketing homepage **prerendered to static HTML** for SEO.
- **Rationale**: Two-app split per product direction (ADR-0001); TanStack Router/Query give
  type-safe routing + caching without meta-framework lock-in (ADR-0002). Workers Static Assets
  is Cloudflare's recommended host; Vite plugin runs the real `workerd` in dev.
- **Alternatives**: single deployable Worker (original 001 plan — superseded); React Router
  framework mode / TanStack Start (SSR lock-in); Cloudflare Pages (converging into Workers).

## D2. Backend framework, layering & contracts

- **Decision**: **Hono** (v4) in a **layered architecture** — router → controller → service →
  repository (Drizzle). Define routes with **`@hono/zod-openapi`** (Zod schemas from
  `packages/shared`), auto-generate the **OpenAPI** doc, and serve **Swagger UI** via
  **`@hono/swagger-ui`**. Frontend imports the shared Zod types directly (no codegen).
- **Rationale**: Cloudflare's default API framework; layering gives testable seams and
  maintainability; contract-first keeps FE/BE payloads in sync (ADR-0003). Keep layers thin
  per KISS.
- **Alternatives**: `@hono/zod-validator` only (no OpenAPI doc); manual OpenAPI authoring
  (drifts); `openapi-typescript` codegen for FE (viable, but importing shared Zod is simpler).

## D3. Database, ORM & migrations

- **Decision**: **Drizzle ORM** (`drizzle-orm`) with **`drizzle-kit generate`** for SQL and
  **`wrangler d1 migrations apply`** to run them (`--local` then `--remote`).
- **Rationale**: De-facto edge standard, thin runtime (Prisma is heavier / cold-start prone).
- **Gotcha (must respect)**: D1 has **no interactive transactions** — `db.transaction()`
  fails; use **`db.batch([...])`** for atomic multi-statement writes (relevant to cascade
  account deletion).

## D4. Authentication & sessions

- **Decision**: **`better-auth`** (MIT) with its **Drizzle/D1 adapter**, the **Google social
  provider**, **and email+password** (registration, email verification, password reset) with
  **account linking by verified email** (FR-013/FR-014; reverses "Google-only"). Email sending
  uses the provider in D16. **Server-side sessions stored in D1** plus better-auth's **signed cookie
  cache** (~5 min) to limit per-request D1 reads. `expiresIn = 30 days`, `updateAge ≈ 1 day`
  (sliding). **Shared-device** option = create the session with a short `expiresIn` via
  per-call override. Cookies: `HttpOnly; Secure; SameSite=Lax; Path=/`. Deploy with
  `nodejs_compat`. **Origin**: the frontend Worker reaches the backend via a **Service
  Binding** (ADR-0005), so the browser sees one origin → cookies are **first-party** and there
  is **no CORS** to configure.
- **Rationale**: Actively maintained, Workers-compatible (Web Crypto), gives session
  management + **revocation** + account linking with far less code than hand-rolling.
  Server-side sessions enable true "sign out everywhere" and account-deletion invalidation,
  which stateless JWTs cannot. The cookie cache preserves edge-first latency.
- **Account deletion / sign-out-everywhere**: better-auth `revokeSessions` / `deleteUser`;
  delete the user's session + account rows (cascade) → all devices invalidated on next
  non-cached request.
- **Alternatives**: OpenAuth (separate OIDC issuer — overkill); Auth.js (`@auth/core` edge-ok
  but ecosystem leans on Node APIs / Next.js); hand-rolled `arctic` + `jose` (viable, more
  code to own). **Lucia is deprecated (2025) — do not use.** Avoid `jsonwebtoken`/Node
  `crypto`/`Buffer` (don't run on Workers); use `jose` if anything is hand-rolled.

## D5. i18n & RTL

- **Decision**: **`react-i18next`** + **`i18next`** + `i18next-browser-languagedetector`.
  **Tailwind v4** logical-property utilities (`ms-/me-`, `ps-/pe-`, `start-/end-`,
  `rounded-s-/e-`) + `rtl:`/`ltr:` variants. On language change, set
  `document.documentElement.dir = i18n.dir(lng)` and `lang`.
- **Rationale**: Authoring in logical properties means layout auto-mirrors with one
  stylesheet (constitution Principle I). Reserve explicit `rtl:` only for non-mirroring cases
  (e.g. icon rotation). Default language Hebrew; persisted to profile + localStorage.

## D6. Theming (light / dark / system, no flash)

- **Decision**: CSS-variable tokens (the **AA-corrected Jerusalem Stone** set, see
  [design/DESIGN-SYSTEM.md](../../design/DESIGN-SYSTEM.md)) under `:root` / `[data-theme=dark]`.
  Tailwind v4 `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`.
  Preference stored as an **extensible theme identifier** in localStorage **and** the user
  profile; absent = follow OS. **No-flash blocking inline script** in `<head>` sets the
  theme before paint.
- **Rationale**: Satisfies FR-009 (instant apply, cross-device via profile, no FOUC,
  extensible to future named themes).

## D7. Jewish calendar & zmanim provider — LICENSING DECISION ⚠️

This affects the header (001) and per-Stay zmanim (005). **All strong libraries are
copyleft — there is no permissive drop-in.** Findings:

| Option | License | Workers? | Notes |
|--------|---------|----------|-------|
| `@hebcal/core` | **GPL-2.0** | pure-JS (validate) | Most mature; Hebrew dates, holidays, candle-lighting, Havdalah, zmanim |
| `kosher-zmanim` (KosherJava JS port) | **LGPL-3.0** | yes (luxon + big.js, uses runtime `Intl`) | Rich zmanim + Hebrew dates + holidays; README marked "alpha"; ships no LICENSE text file |
| Hebcal REST API | **CC BY 4.0** | n/a (network) | Commercial OK with visible attribution; 90 req / 10 s; adds external dependency + latency |

- **Decision (recommended)**: Use **`kosher-zmanim` (LGPL-3.0)** for Hebrew dates, holidays,
  candle-lighting, Havdalah, and zmanim, **computed server-side on the Worker** (return only
  JSON/HTML to clients). LGPL permits proprietary use; computing at the edge satisfies
  edge-first. Include the required LGPL notice/attribution. **Fallback**: the Hebcal REST API
  (CC BY 4.0, visible "Powered by Hebcal" attribution) if counsel prefers zero copyleft code
  on our servers.
- **Why not `@hebcal/core`**: GPL-2.0 is a genuine exposure for a proprietary product. The
  GPL "SaaS loophole" (copyleft triggers on *distribution*, not server execution) means
  server-only use is likely fine, **but** any byte shipped to the browser = "conveying" and
  forfeits it. LGPL avoids that knife-edge.
- **MUST DO before shipping**: (1) **legal sign-off** on the chosen library/license; (2)
  **never ship the calendar/zmanim library in client JS** — compute server-side, return data;
  (3) validate `kosher-zmanim` output against an authoritative source for several known dates
  (it is labeled "alpha"); confirm its LICENSE/version. This aligns with org copyright policy.

## D8. Testing

- **Decision**: **`@cloudflare/vitest-pool-workers`** for Worker unit/integration tests (real
  bindings, isolated per-file storage); **Playwright** for e2e; **`@axe-core/playwright`**
  for WCAG 2.1 AA audits (`withTags(['wcag2a','wcag2aa','wcag21aa'])`).
- **Rationale**: Runs tests in the real `workerd` runtime; axe automates the AA gate
  (constitution Principle II) — but automated tools catch ~30–50% of issues, so keyboard /
  screen-reader manual passes remain required. Pin vitest-pool-workers config to the installed
  version (newer `cloudflareTest()` plugin replaced the older `defineWorkersConfig` form).

---

## D9. Logging

- **Decision**: thin **shared structured-logger** util emitting **JSON to `console`**,
  captured by **Cloudflare Workers Logs / Observability**; **Logpush** to R2/external later if
  needed. Request id propagated; errors logged centrally. (ADR-0004)
- **Rationale / flag**: **Winston is forbidden** — it depends on Node streams/transports and
  does not run reliably on Workers even with `nodejs_compat`. Native is zero-risk + CF-native.

## D10. Secrets & configuration

- **Decision**: secrets accessed only via the Worker **`env` binding** — `.dev.vars` locally,
  `wrangler secret put` / Secrets Store in prod. Non-secret config in `wrangler.jsonc`
  `[vars]`. Frontend public config via `VITE_`-prefixed `.env`. See
  [docs/secrets.md](../../docs/secrets.md). API-key retrieval guides in
  [docs/integrations/](../../docs/integrations/).
- **Rationale / flag**: **`.env` is NOT used for Worker secrets** (it is for public Vite vars
  only). One consistent rule so all utils resolve config the same way.

## D11. Security headers, CSP & fonts

- **Decision**: set security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
  frame-ancestors) on the **frontend Worker** (it serves the static assets). The no-flash theme
  script uses a **CSP nonce/hash** (no blanket `unsafe-inline` for scripts). **Self-host the
  Assistant font** (woff2) from Workers Static Assets — removes `fonts.gstatic.com` from CSP.
- **Rationale**: strict CSP + self-hosted fonts. Self-hosting also avoids a **GDPR exposure**
  (hotlinking Google Fonts sends EU users' IPs to Google — a real risk for our EU-traveling
  audience) and improves performance. Inline styles from the design are refactored to classes
  (or scoped) to keep `style-src` tight.

## D12. CI/CD quality gate

- **Decision**: **GitHub Actions** runs the PR gate — typecheck, lint, `vitest`
  (vitest-pool-workers), and `@axe-core/playwright` — on every PR. **Cloudflare Workers Builds**
  (ADR-0006) handles build + deploy (main→prod, branches→preview). The two are separate.
- **Rationale**: the constitution's AA gate (Principle II) + type/lint checks must be *enforced*
  somewhere; Workers Builds only deploys. Actions is the enforcement point.
- **e2e auth**: real Google OAuth can't run in CI — use a **test-only auth path** (better-auth
  test mode / seeded session) so Playwright exercises post-login flows.

## D13. Rate limiting

- **Decision**: use Cloudflare's **native Rate Limiting binding** on sensitive routes (sign-in,
  account deletion, profile writes). Returns `429` (`code: rate.limited`).
- **Rationale**: edge-native, no extra store to manage; protects auth + destructive endpoints.

## D14. Multi-environment configuration

- **Decision**: distinct **dev / staging / prod** environments, each with its own **D1
  database**, **Google OAuth client + redirect URI**, and **secrets**. Map to Workers Builds
  branches: `main` → prod bindings; preview branches → staging bindings. Local dev uses
  `.dev.vars` + a local D1.
- **Rationale**: isolation + the dev/staging-only guardrail; prevents a local/preview run from
  ever touching prod data. (Per-env Google clients already noted in quickstart.)

## D16. Transactional email provider (for email/password)

- **Context**: email+password (D4/FR-013) needs **email verification + password reset**, and
  **Workers cannot send email directly** — MailChannels' free Workers sending ended in 2024;
  Cloudflare Email Routing is inbound-only.
- **Decision (recommended, confirm)**: **Resend** (`resend` SDK; HTTP API, Workers-friendly,
  generous free tier, good DX). API key via the `env` binding (a secret). Requires a **sending
  domain** with **SPF/DKIM/DMARC**. Setup guide: `docs/integrations/email-provider-setup.md`.
- **Alternatives**: Postmark (deliverability-focused), Amazon SES (cheapest at scale), Brevo/
  Mailgun/SendGrid. All are HTTP-API based and Workers-compatible; the choice is swappable
  behind a small `sendEmail()` util in `apps/backend/src/lib`.
- **Notes**: localize email templates (he/en); keep the API key out of the repo (secrets
  policy); the provider/domain is a **pre-ship requirement**. This same infra unlocks future
  passwordless (magic-link) with no new dependency.

## D15. SPA accessibility (beyond axe)

- **Decision**: announce **route changes** via an ARIA live region, manage focus on navigation
  (TanStack Router), and provide a **skip-to-content** link. axe catches ~30–50%; these plus a
  manual keyboard/screen-reader pass complete the AA gate.

## Resolved unknowns

All Technical Context items are resolved. The only item carrying a **pre-ship gate** is D7
(calendar/zmanim licensing — requires legal sign-off and server-only usage), tracked in the
ROADMAP open items and the plan's Complexity/risk notes.
