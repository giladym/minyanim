# Quickstart & Validation — Phone-Number Onboarding Nudge

End-to-end scenarios proving Feature 007. References [spec.md](./spec.md) and SC-001…SC-007. This is
a **frontend-only** feature — there is no API or migration to apply.

## Prerequisites
- 002 (profile + phone management) and ADR 0008 (`share_phone` opt-out) present.
- Two test accounts: one with **no saved phone**, one **with** a saved phone.
- App running via `pnpm dev`.

## Scenario 1 — Fresh login, no phone (US1, SC-001)
1. Sign out. Open the **sign-in** screen and sign in with the **phone-less** account (email form).
2. On landing, the browser is at `/profile?onboarding=phone`; the phone-number field is **focused**;
   the explanatory banner is shown ("כדאי להוסיף מספר טלפון" / "Add a phone number").
3. Repeat with **Google SSO** (US1 #2): the flag survives the SSO round-trip and the same nudge shows
   on return.

## Scenario 2 — Add a phone → nudge does not recur (US1, SC-002)
1. From the nudged profile page, add a valid phone number and save.
2. Reload the page: the banner and autofocus are **gone** (the user now has a phone; the one-shot
   flag was already consumed).
3. Sign out and sign in again: no banner (they have a phone) — lands on the intended destination.

## Scenario 3 — Dismiss / ignore (US2, SC-005)
1. Sign in with the phone-less account; on the nudged profile page, **navigate away** (e.g. to
   `/stays`) without adding a phone.
2. The app is fully usable; nothing is blocked. Navigating back to `/profile` (no `?onboarding=phone`)
   shows **no** banner. The nudge does not re-appear in this session.
3. Confirm the `share_phone` opt-out is untouched: a user may add a number and keep it off (private).

## Scenario 4 — Existing users / reload / deep-link not hijacked (US3, SC-002/003)
1. Sign in with the account that **already has a phone**: lands on the redirect target (or `/stays`),
   **no** nudge (SC-003).
2. As the phone-less user, after the one-shot nudge was consumed, reload a deep-linked page (e.g.
   `/stays`): **no** redirect to `/profile` (SC-002).

## Scenario 5 — API-only session never redirected (US3, SC-004)
- The Playwright e2e suite authenticates via the API (no UI login, so no login-intent flag) and
  deep-links into pages. Confirm it is **never** bounced to `/profile` — this is the regression this
  feature was designed around.

## Scenario 6 — sessionStorage unavailable (edge, SC-006)
- With storage blocked (privacy mode), sign in: `armPhoneNudge()` is a silent no-op; the user is
  simply not nudged; **no error** is surfaced.

## Automated checks (CI)
- **Frontend** (Vitest + Testing Library) — `apps/frontend/src/features/profile/Profile.test.tsx`:
  - banner shown when `?onboarding=phone` **and** `phones.length === 0`;
  - banner hidden without the param;
  - banner hidden when the user already has a phone (even with the param present).
  Run: `pnpm --filter @minyanim/frontend test`.
- **e2e** (Playwright + axe) — the existing suite exercises SC-004 implicitly: API-authenticated,
  deep-linked sessions are never redirected. Banner/field WCAG 2.1 AA + RTL + keyboard (SC-007).
- **i18n parity** — the existing he/en parity test must pass (`profile.phonePrompt.{title,body}`
  present in both locales).
