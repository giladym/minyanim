---
description: "Task list for Platform Foundation (001)"
---

# Tasks: Platform Foundation

**Input**: Design documents from `specs/001-platform-foundation/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D16), data-model.md, contracts/api.md

**Tests**: Included where the **constitution mandates them** — the WCAG 2.1 AA gate (Principle
II), the cascade-delete guarantee (FR-008/SC-007), and security-critical auth flows. Not full
TDD for every unit.

**Organization**: by user story (spec.md priorities). Stack & paths per
[plan.md](./plan.md) and [docs/architecture.md](../../docs/architecture.md): monorepo with
`apps/frontend`, `apps/backend`, `packages/shared`.

## Format: `[ID] [P?] [Story] Description with file path`
- **[P]** = parallelizable (different files, no incomplete-task dependency)
- **[USx]** = user-story phase tasks only

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create pnpm + Turborepo monorepo skeleton (`pnpm-workspace.yaml`, `turbo.json`, root `package.json`, `tsconfig.base.json`) at repo root
- [x] T002 [P] Configure ESLint + Prettier + TS strict + a no-hardcoded-color lint rule at root (`eslint.config.js`, `.prettierrc`)
- [x] T003 [P] Create `packages/shared` (package.json, tsconfig, `src/index.ts`) for Zod schemas / types / error codes / constants
- [x] T004 Scaffold `apps/backend` (Hono) + `apps/backend/wrangler.jsonc` (`compatibility_date` ≥2024-09-23, `compatibility_flags:["nodejs_compat"]`, `observability.enabled`, `workers_dev:false`, D1 binding)
- [x] T005 Scaffold `apps/frontend` (Vite + React + TanStack Router/Query) + `apps/frontend/wrangler.jsonc` (`assets` SPA fallback, Service Binding → backend) + `vite.config.ts` (`@cloudflare/vite-plugin`)
- [x] T006 [P] Add Tailwind v4 + AA-corrected Jerusalem Stone tokens as CSS vars in `apps/frontend/src/theme/tokens.css`; define `dark` `@custom-variant`
- [x] T007 [P] Self-host Assistant font (woff2) in `apps/frontend/public/fonts/` + `@font-face` (research D11 / GDPR)
- [x] T008 [P] Create `apps/backend/.dev.vars.example` (GOOGLE_CLIENT_ID/SECRET, BETTER_AUTH_SECRET, RESEND_API_KEY)
- [x] T009 Configure `drizzle.config.ts` + `apps/backend/src/db/client.ts` (D1)
- [x] T010 Create D1 database (`wrangler d1 create minyanim`) and bind it in `apps/backend/wrangler.jsonc`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Must complete before any user story.**

- [x] T011 Shared error-code enum + error-response Zod schema in `packages/shared/src/errors.ts`
- [x] T012 [P] Shared base Zod schemas/types (profile, phone E.164, calendar, auth) in `packages/shared/src/schemas/`
- [x] T013 Drizzle schema — `user` (+ better-auth `additionalFields` language/theme), `account`, `session`, `verification`, `phone_number`; FK `ON DELETE CASCADE` + indexes in `apps/backend/src/db/schema.ts`
- [x] T014 Generate + apply initial migration (`drizzle-kit generate`; `wrangler d1 migrations apply minyanim --local`) → `apps/backend/migrations/`
- [x] T015 better-auth config (Google + email/password incl. verify+reset, account-linking by verified email, D1 adapter, 30-day + shared-device sessions, cookie cache) in `apps/backend/src/auth.ts`
- [x] T016 `sendEmail()` util (Resend, swappable) + localized he/en verify/reset templates in `apps/backend/src/lib/email.ts` (key via `env`)
- [x] T017 [P] Structured JSON logger (Workers Observability) in `apps/backend/src/lib/logger.ts`
- [x] T018 [P] Typed `AppError` hierarchy mapped to shared error codes in `apps/backend/src/lib/errors.ts`
- [x] T019 Hono app + middleware chain (request-id, **security headers/CSP w/ script nonce**, **rate-limit binding**, centralized error handler, auth) in `apps/backend/src/index.ts` + `apps/backend/src/middleware/`
- [x] T020 Mount better-auth at `/api/auth/*` + **open-redirect validation** of the `redirect` param
- [x] T021 [P] `@hono/zod-openapi` + `@hono/swagger-ui` (OpenAPI doc + `/docs`) in `apps/backend/src/openapi/`
- [ ] T022 Frontend Worker entry proxying `/api/*` to backend via Service Binding (`apps/frontend/src/worker.ts`) + local multi-worker dev config
- [ ] T023 [P] Frontend bootstrap — TanStack Router + Query providers, root layout, react-i18next (he/en), `dir`/`lang` sync in `apps/frontend/src/main.tsx` + `src/i18n/`
- [ ] T024 [P] Theme infra — `ThemeProvider` + no-flash inline script (reads `localStorage['minyanim_theme']`, OS fallback) in `apps/frontend/src/theme/`
- [ ] T025 [P] Typed API client + auth client (TanStack Query) in `apps/frontend/src/lib/`
- [ ] T026 [P] CI gate — GitHub Actions (typecheck, lint, vitest, axe) in `.github/workflows/ci.yml` (research D12)
- [x] T027 [P] `GET /api/health` (incl. D1 check) in `apps/backend/src/routes/health.ts`

**Checkpoint**: foundation ready — user stories can begin.

---

## Phase 3: User Story 1 — Marketing Homepage (P1) 🎯 MVP

**Goal**: a premium RTL marketing page that explains the product and converts to sign-in.
**Independent test**: an unfamiliar visitor reads it and can explain the product; renders on desktop + 375px.

- [ ] T028 [US1] Port the homepage from the design (Jerusalem Stone) to prerendered static HTML/React in `apps/frontend/src/routes/index.tsx` + prerender build step
- [ ] T029 [P] [US1] Animated globe component (canvas, honors `prefers-reduced-motion`, `aria-hidden`) in `apps/frontend/src/components/Globe.tsx`
- [ ] T030 [P] [US1] Homepage sections (hero, early-access, how-it-works, mission, testimonials, footer CTA) using tokens + i18n strings in `apps/frontend/src/features/home/`
- [ ] T031 [US1] Wire CTAs to auth; authenticated-state CTA ("Go to My Stays")
- [ ] T032 [P] [US1] e2e + axe test (mobile/desktop, reduced-motion) in `tests/e2e/homepage.spec.ts`

**Checkpoint**: homepage live and accessible (no auth required).

---

## Phase 4: User Story 2 — Sign In & Register (Google + Email/Password) (P1)

**Goal**: identity via Google SSO or email+password (verify, reset), 30-day/shared-device sessions, account linking.
**Independent test**: register w/ email → verify → sign in → still signed in after reopen; Google sign-in reaches the same dashboard.

- [ ] T033 [P] [US2] Auth Zod schemas (sign-up, sign-in, reset, password rules) in `packages/shared/src/schemas/auth.ts`
- [ ] T034 [US2] Sign-in/Register UI (Google button + email/password forms + "shared device" checkbox) in `apps/frontend/src/routes/auth/`
- [ ] T035 [P] [US2] Email-verification + password-reset UI flows in `apps/frontend/src/routes/auth/`
- [ ] T036 [US2] Protected-route guard + redirect-after-login (validated relative path) in `apps/frontend/src/lib/auth.ts`
- [ ] T037 [US2] Verify Google + email/password server flows + account-linking by verified email in `apps/backend/src/auth.ts`
- [ ] T038 [P] [US2] Apply rate-limit to sign-in / register / reset endpoints
- [ ] T039 [P] [US2] Backend tests (vitest-pool-workers): register/verify/reset, 30d vs shared-device session, account linking, no account enumeration
- [ ] T040 [P] [US2] e2e (test-auth path): sign-in→dashboard + reset flow; axe on auth pages

**Checkpoint**: users can authenticate (both methods) and reach a protected dashboard.

---

## Phase 5: User Story 3 — App Shell, Nav & RTL Theme (P1)

**Goal**: consistent RTL shell, theme toggle, language switcher, accessible navigation.
**Independent test**: navigate the authed shell on 375px + keyboard; theme/lang persist across reload + devices.

- [ ] T041 [US3] App shell — header (logo, Hebrew-date slot, theme toggle, lang switcher, avatar) + bottom nav, RTL, in `apps/frontend/src/components/AppShell.tsx`
- [ ] T042 [P] [US3] Theme toggle (light/dark/system) persists to profile + localStorage in `apps/frontend/src/theme/`
- [ ] T043 [P] [US3] Language switcher (he/en) flips `dir`/`lang`, persists to profile
- [ ] T044 [P] [US3] SPA a11y — route-change live-region announcements, focus management, skip-to-content link (research D15)
- [ ] T045 [P] [US3] e2e + axe — shell at 375px, keyboard nav, theme/lang persistence

**Checkpoint**: the authenticated app shell is usable, themeable, bilingual, and accessible.

---

## Phase 6: User Story 4 — Hebrew Date & Holidays Header (P2)

**Goal**: header shows the current Hebrew date + upcoming holiday, rolling at local nightfall.
**Independent test**: header shows today's Hebrew date matching an authoritative source incl. nightfall rollover.

- [ ] T046 [US4] Server calendar (kosher-zmanim, **server-only**) → `GET /api/calendar/today` returning keyed holiday + `monthKey` in `apps/backend/src/lib/calendar.ts` + route
- [ ] T047 [P] [US4] Header calendar widget (localized names, nightfall rollover, graceful degrade) in `apps/frontend/src/features/header-calendar/`
- [ ] T048 [P] [US4] Tests: calendar correctness vs known dates + cache/expiry; widget render

**Checkpoint**: Hebrew date + holiday visible across the app.

---

## Phase 7: User Story 5 — Profile (P2)

**Goal**: edit name, language, theme, and multiple phone numbers (E.164).
**Independent test**: edit name, add a 2nd phone, switch language/theme → all persist after reload.

- [ ] T049 [US5] Profile endpoints (`GET`/`PATCH /api/me`, `POST`/`DELETE /api/me/phones`) — router→controller→service→repository in `apps/backend/src/routes/me.ts`
- [ ] T050 [P] [US5] Profile UI (name, language, theme, multiple phones) in `apps/frontend/src/routes/profile/`
- [ ] T051 [P] [US5] Tests: phone E.164 validation (error codes), profile-update persistence

**Checkpoint**: profile editable; contact fields ready for later features.

---

## Phase 8: User Story 6 — Delete Account & Data (P2)

**Goal**: self-service account deletion that cascade-removes all owned data.
**Independent test**: delete account → signed out → former data unretrievable; zero orphans.

- [ ] T052 [US6] `DELETE /api/me` — explicit confirm → better-auth `deleteUser` + cascade our tables in `apps/backend/src/routes/me.ts`
- [ ] T053 [US6] Delete-account UI with explicit confirmation in `apps/frontend/src/routes/profile/`
- [ ] T054 [US6] **Integration test** (vitest-pool-workers): create user + children → delete → assert **zero orphans** (verifies D1 FK cascade) + session invalidated (FR-008/SC-007)

**Checkpoint**: GDPR-grade deletion verified.

---

## Final Phase: Polish & Cross-Cutting

- [ ] T055 [P] Manual a11y pass (keyboard + screen reader) across all pages; fix findings
- [ ] T056 [P] Performance — route code-splitting, font/asset cache headers, bundle check (p95 < 200 ms API)
- [ ] T057 [P] Audit: no hard-coded strings (i18n he/en complete), no hard-coded colors (tokens only)
- [ ] T058 Run `quickstart.md` validation scenarios end-to-end
- [ ] T059 Deploy to **dev** via Wrangler (frontend + backend); smoke test (per-env D1/secrets, research D14)
- [ ] T060 Connect Git (Workers Builds) per ADR-0006 — `main`→prod gated, previews on branches
- [ ] T061 Pre-ship gate checklist: legal sign-off (kosher-zmanim), email provider + sending domain (SPF/DKIM/DMARC), brand wordmark decision, English/LTR homepage variant

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** block everything.
- **US1 (P1)** depends only on Setup/Foundational (no auth) — true MVP, shippable alone.
- **US2 (P1)** depends on Foundational (auth/email/rate-limit).
- **US3 (P1)** depends on Foundational; **US4, US5, US6** depend on **US2 (auth) + US3 (shell)**.
- **Polish** after the desired stories.

Recommended build order: **Setup → Foundational → US1 → US2 → US3 → (US4 ∥ US5 ∥ US6) → Polish**.

## Parallel Opportunities

- Setup: T002, T003, T006, T007, T008 in parallel.
- Foundational: T017, T018, T021, T023, T024, T025, T026, T027 in parallel after the schema/auth core (T013–T016, T019).
- Within stories: `[P]` tasks (different files) run together — e.g. US2 T035/T038/T039/T040; US3 T042/T043/T044/T045.
- After Foundational, US4/US5/US6 can proceed in parallel (different files), once US2+US3 exist.

## Implementation Strategy

- **MVP**: Setup + Foundational + **US1** → a live, accessible marketing homepage.
- **Usable product**: add **US2 + US3** → authenticated, themed, bilingual shell.
- **Increment**: US4 (calendar), US5 (profile), US6 (deletion) in parallel.
- **Ship gate**: T061 must clear before production (legal/email/brand/LTR).

## Notes

- Tests included per constitution (AA gate, cascade-delete, auth security) — not exhaustive TDD.
- Calendar/zmanim library is **server-side only**; never bundled into client JS (research D7).
- Secrets via `env` bindings only (`docs/secrets.md`); deploy targets **dev/staging** (prod gated).
