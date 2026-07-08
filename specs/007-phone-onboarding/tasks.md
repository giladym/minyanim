---
description: "Task list for Phone-Number Onboarding Nudge (Feature 007)"
---

# Tasks: Phone-Number Onboarding Nudge

**Input**: Design documents from `specs/007-phone-onboarding/` (plan.md D1–D6, spec.md). No
`data-model.md` / `contracts/` (frontend-only; no persistent-state or API change).

**Prerequisites**: 002 (profile + phones) and ADR 0008 (`share_phone` opt-out) shipped. Branch
`007-phone-onboarding`.

**Tests**: REQUESTED — SC-001…SC-007 + quickstart mandate a frontend unit test (Vitest + Testing
Library) for the banner shown/hidden cases; e2e covers the "not-hijacked" constraint implicitly. All
tasks below reflect the shipped implementation.

**Organization**: by user story (US1 first-login nudge P1 → US2 dismiss P2 → US3 don't-disrupt P3).
`[P]` = parallelizable (different files, no incomplete dep). **Frontend-only** — no backend phase.

---

## Phase 1: Foundational — the one-shot flag seam + route param

**Purpose**: the coordination primitive both the armer (auth) and consumer (shell) build on.

**⚠️ CRITICAL**: complete before user-story wiring.

- [x] T001 Create `apps/frontend/src/lib/onboarding.ts`: export `PHONE_NUDGE_KEY =
  "mn_check_phone_onboarding"` and `armPhoneNudge()` that `sessionStorage.setItem(KEY,"1")` inside a
  `try/catch` (silent no-op if storage unavailable — FR-007). JSDoc records the arm-here /
  consume-there split and the "never on every page load" rationale. (D2/D6)
- [x] T002 Extend `apps/frontend/src/router.tsx`: the `/profile` route
  `validateSearch: (s): { onboarding?: "phone" } => ({ onboarding: s.onboarding === "phone" ?
  "phone" : undefined })`, so `{ onboarding: "phone" }` is a type-safe navigation target. (D5)

**Checkpoint**: the flag helper exists; the route accepts the typed param.

---

## Phase 2: User Story 1 — First login with no phone (Priority: P1) 🎯 MVP

**Goal**: a real UI sign-in/register by a phone-less user routes once to `/profile?onboarding=phone`
with the field focused + banner shown.

**Independent Test**: sign in (email) with a phone-less account → land on the focused, bannered
profile page; adding a phone stops the nudge recurring.

### Tests for User Story 1

- [x] T003 [P] [US1] `apps/frontend/src/features/profile/Profile.test.tsx` — banner shown when
  `?onboarding=phone` **and** `phones.length === 0`; hidden without the param; hidden when the user
  already has a phone (even with the param). Sets the URL via `window.history.replaceState` (no
  router mount — validates the D5 direct-URL-read seam). (SC-001)

### Implementation for User Story 1

- [x] T004 [US1] Extend `apps/frontend/src/features/auth/AuthScreens.tsx`: import `armPhoneNudge`;
  call it on **email sign-in success** (`SignIn.submit`) before navigating to `safeRedirect()`.
  (FR-001)
- [x] T005 [US1] Extend `apps/frontend/src/features/auth/AuthScreens.tsx` (`GoogleButton.start`):
  call `armPhoneNudge()` **before** `authClient.signIn.social(...)` (flag survives the SSO round-trip
  in `sessionStorage`); on a client-side SSO error, `sessionStorage.removeItem(PHONE_NUDGE_KEY)` so a
  later unrelated load is not nudged. (FR-001/FR-008)
- [x] T006 [US1] Extend `apps/frontend/src/components/AppShell.tsx`: in the existing mount
  `useEffect` (after theme/language hydration), `if (sessionStorage.getItem(PHONE_NUDGE_KEY))` →
  `removeItem` **first**, then `if (p.phones.length === 0 && window.location.pathname !== "/profile")`
  → `navigate({ to: "/profile", search: { onboarding: "phone" } })`. One-shot + loop-proof. (FR-002/
  FR-003/FR-004)
- [x] T007 [US1] Extend `apps/frontend/src/features/profile/Profile.tsx`: compute `onboardingPhone =
  new URLSearchParams(window.location.search).get("onboarding") === "phone" && p.phones.length === 0`
  (read straight from the URL, D5); render the banner (`profile.phonePrompt.{title,body}`, primary
  tokens, `mn-fadeup`) when true; pass `autoFocus={onboardingPhone}` to `PhoneInput`. (FR-005/FR-009)
- [x] T008 [US1] Extend `apps/frontend/src/features/profile/PhoneInput.tsx`: accept an `autoFocus`
  prop and apply it to the national-number `<input>` (comment: intentional focus — the nudge lands
  the user here to add a phone). (FR-005)

**Checkpoint**: first-login nudge fully functional (MVP).

---

## Phase 3: User Story 2 — Declining the nudge (Priority: P2)

**Goal**: the nudge is soft — a user can ignore it and the app stays fully usable; the `share_phone`
opt-out is never overridden.

**Independent Test**: land on the nudged profile page, navigate away without adding a phone → app
usable, nudge does not recur in-session.

- [x] T009 [US2] Verify (no new code): the banner is informational only — no gate, no blocking
  overlay; the profile page and all routes remain usable (covered by T006's `!== "/profile"` guard +
  T007's non-blocking banner). The `share_phone` checkbox (ADR 0008) is untouched by 007. (FR-006)

**Checkpoint**: nudge confirmed soft + dismissible.

---

## Phase 4: User Story 3 — Not disrupting existing users / automated sessions (Priority: P3)

**Goal**: phone-having users, reloads, deep-links, and API-only (e2e) sessions are never redirected.

**Independent Test**: an API-authenticated deep-link is never bounced to `/profile`; a phone-having
user lands on the intended destination.

- [x] T010 [US3] Verify (design constraint, not new code): because the redirect is gated on the
  one-shot login-intent flag (T004–T006), API-authenticated sessions — which never call
  `armPhoneNudge()` — are never redirected (SC-004), and a post-consumption reload/deep-link has no
  flag so it does not recur (SC-002). This is the regression the flag-gating was introduced to fix
  (plan.md "e2e-hijack pitfall"). The existing Playwright suite passing confirms it. (FR-004)

**Checkpoint**: existing users + e2e unaffected. US1/US2/US3 independent.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T011 [P] i18n he+en parity in `apps/frontend/src/i18n/locales/{he,en}.ts`:
  `profile.phonePrompt.{title,body}`; the existing parity test passes. (FR-010)
- [x] T012 [P] Accessibility: the banner uses tokens-only colors (`primary` / `primary-soft` /
  `primary-container`) and reads correctly RTL; the focused field is keyboard-operable — WCAG 2.1 AA
  (FR-010/SC-007), covered by the existing axe e2e gate.
- [x] T013 Run `specs/007-phone-onboarding/quickstart.md` scenarios 1–6 against `pnpm dev`; confirm
  no drift.

---

## Dependencies & Execution Order

- **Phase 1 (Foundational)**: T001, T002 [P]. BLOCKS the wiring.
- **US1 (Phase 2)**: after Phase 1. Test T003 [P]; T004/T005 (auth armer) ∥ T008 (PhoneInput prop);
  T006 (shell consumer) and T007 (profile banner) depend on T001/T002.
- **US2 (Phase 3)**: verification over the US1 implementation (no new code).
- **US3 (Phase 4)**: verification of the flag-gating design (no new code).
- **Polish (Phase 5)**: T011/T012 [P] after the UI exists; T013 last.

### Within each story

Test written with impl → flag seam (lib) → route param → auth armer → shell consumer → profile
banner/autofocus.

### Parallel opportunities

- Foundational: T001, T002 together.
- US1: the auth-armer edit (T004/T005) and the PhoneInput prop (T008) touch different files from the
  shell/profile wiring.

---

## Implementation Strategy

**MVP** = Phase 1 + **US1** — a real UI login by a phone-less user routes once to the focused,
bannered profile page. US2 (soft/dismissible) and US3 (don't-disrupt) are properties of the same
one-shot-flag design rather than additional code, so they are validated, not re-built. The
load-bearing invariant throughout: **the nudge is triggered by an explicit login intent (the
`sessionStorage` flag), never by session presence** — that is what keeps deep-links, reloads, and
API-only e2e sessions from being hijacked.
