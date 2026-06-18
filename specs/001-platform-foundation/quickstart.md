# Quickstart & Validation — Platform Foundation

How to run the foundation locally and validate it end-to-end. Details live in
[plan.md](./plan.md), [data-model.md](./data-model.md), and [contracts/api.md](./contracts/api.md).

## Prerequisites

- Node 18+ and a Cloudflare account with Wrangler authenticated (`wrangler login`)
- A **Google OAuth client** (Authorized redirect URI → `http://localhost:5173/api/auth/callback/google`
  for dev, and the production URL)
- A **D1 database** created (`wrangler d1 create minyanim`) and bound in `wrangler.jsonc`

## Setup

```bash
# scaffold (Vite React template for Cloudflare Workers)
npm create cloudflare@latest        # or install into the existing repo
npm install                          # incl. better-auth, drizzle-orm, hono, react-i18next,
                                     #       tailwindcss@4, kosher-zmanim, dev: drizzle-kit,
                                     #       @cloudflare/vite-plugin, vitest-pool-workers,
                                     #       @playwright/test, @axe-core/playwright

# secrets (never commit; dev/staging only — not production from a workstation)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put BETTER_AUTH_SECRET

# database migrations
npx drizzle-kit generate             # emits SQL from worker/db/schema.ts → migrations/
wrangler d1 migrations apply minyanim --local
wrangler d1 migrations apply minyanim --remote   # when deploying
```

> Set `nodejs_compat` in `wrangler.jsonc` (better-auth). Configure `GOOGLE_*` in dev/staging
> only; do not wire a production database to a local run.

## Run

```bash
npm run dev      # Vite + @cloudflare/vite-plugin (real workerd runtime, HMR)
```

## Validation scenarios (map to spec acceptance criteria)

| # | Scenario | Expected | Spec |
|---|----------|----------|------|
| 1 | Open `/` | Marketing homepage renders (hero, how-it-works, CTA); desktop split → single column at 375 px | US1 |
| 2 | Click "התחברו עם Google" | Google OAuth → redirected to dashboard; session cookie set | US2 |
| 3 | Reopen browser after sign-in | Still signed in (30-day session) | US2 / SC-002 |
| 4 | Sign in with "מכשיר משותף" checked | Short-lived session (ends on browser close) | US2 |
| 5 | Toggle theme Light/Dark/System | Applies instantly; persists to profile + localStorage; no flash on reload | US3 / FR-009 / SC-008 |
| 6 | Switch language עב↔EN | UI text + `dir` flip (RTL↔LTR); saved to profile | US3 / FR-004 |
| 7 | Header on any page | Shows current Hebrew date; upcoming holiday chip; rolls at local nightfall | US4 / FR-005 |
| 8 | Profile: edit name, add 2nd phone (intl), bad format | Persists; bad format → Hebrew "use international format" error | US5 / FR-006 |
| 9 | Profile: delete account (confirm) | Cascade-deletes all owned data, signs out; re-sign-in = fresh empty user | US6 / FR-008 / SC-007 |
| 10 | Visit a protected route while signed out | Redirected to sign in, then back to intended destination | FR-001/003 |

## Automated checks

```bash
npm run test          # vitest-pool-workers: auth, profile, phone validation, cascade delete, calendar
npm run test:e2e      # playwright: flows 1–10 above
npm run test:a11y     # @axe-core/playwright on each page (wcag2a/2aa/21aa) — zero critical (SC-003)
```

Manual a11y pass still required (keyboard nav + screen reader), since axe catches ~30–50%.

## Pre-ship gate

Before production: obtain **legal sign-off** on the calendar/zmanim library (`kosher-zmanim`,
LGPL) and confirm it is used **server-side only** (no calendar library shipped in client JS) —
see [research.md](./research.md) D7.
