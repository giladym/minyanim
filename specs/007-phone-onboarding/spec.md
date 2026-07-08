# Feature Specification: Phone-Number Onboarding Nudge

**Feature Branch**: `007-phone-onboarding`

**Created**: 2026-07-08

**Status**: Implemented (retroactive documentation)

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **002 Stays** (the profile + phone
management surface) and on the **`user.share_phone`** opt-out introduced post-005 (ADR 0008 —
contact visibility). Frontend-only; **no backend or schema change**.

---

## Summary

A phone number is what lets minyan organizers and fellow travelers actually reach a user (ADR 0008
made contact reachable before joining). Yet nothing prompted a new user to add one. This feature adds
a **soft, dismissible nudge**: immediately after a real UI sign-in or registration, a user who has
**no phone number** is routed once to their profile with the phone field focused and a short
explanatory banner. It is a gentle conversion prompt — **not a hard gate**: the user may ignore it,
add a number, or decline entirely (the existing `user.share_phone` opt-out still lets them keep a
number private). The nudge is armed only by an explicit login intent and fires **exactly once**, so
it never hijacks deep-links, reloads, or API-only (e2e) sessions.

The entire feature lives in the frontend SPA. **No `data-model.md` and no `contracts/` are included
because there is no persistent-state change and no API change** — the nudge is coordinated purely by
a one-shot `sessionStorage` flag and a URL query parameter, both client-side.

---

## Clarifications

### Session 2026-07-08 (retroactive — reflects the shipped implementation)

Decisions (D#) are referenced from the requirements.

- **D1 — Soft + dismissible, NOT a hard gate.** The nudge routes the user to their profile and
  explains why a phone helps, but never blocks app use. It respects the existing `user.share_phone`
  opt-out: a user is entitled to decline to add or to share a number. A hard requirement would
  contradict that opt-out and harm the sign-up funnel.
- **D2 — Armed only by a real UI login/register, via a one-shot flag.** The nudge is armed by the
  **auth screens** on a genuine sign-in/register action (email sign-in success, and just before a
  Google SSO redirect). It is stored as a single `sessionStorage` flag (`mn_check_phone_onboarding`)
  and **consumed once** on the next authenticated page load. It is explicitly **not** triggered on
  every authenticated page load. This is the crucial constraint (see D3).
- **D3 — Never hijack deep-links, reloads, or API-only sessions (a real bug fixed mid-development).**
  The first implementation redirected to `/profile` on **every** `AppShell` mount whenever the user
  had no phone. That broke the Playwright e2e suite (which authenticates via the API and deep-links
  straight into pages) and would have hijacked any reload or shared deep-link for a phone-less user.
  The fix: gate the redirect on the explicit one-shot login-intent flag, so only a real interactive
  login triggers it. API-only sessions never set the flag and therefore never redirect. This is
  recorded as a **standing design constraint**, not merely a past fix.
- **D4 — Fire exactly once; consume the flag whether or not we redirect.** On the authed page load,
  the flag is removed **before** the redirect decision, so it is strictly one-shot: if the user
  already has a phone, or is already on `/profile`, the flag is still cleared and no loop can occur.
- **D5 — Read the URL parameter directly, not via router context.** The profile page reads
  `?onboarding=phone` straight from `window.location.search` (rather than the router's typed search
  context) so the banner + autofocus logic stays unit-testable in isolation, without mounting a
  router. The route still declares `validateSearch` so the typed param is first-class for navigation.
- **D6 — Frontend-only, no persisted onboarding state.** There is deliberately no
  "has-been-nudged" column or API. The `sessionStorage` flag scopes the nudge to the current tab
  session; a user is nudged at most once per login. No backend, no migration, no new endpoint.

---

## User Scenarios & Testing

### User Story 1 — First login with no phone (Priority: P1)

A newly registered (or returning phone-less) user signs in and is guided to add a phone so they can
be reached, without being forced to.

**Independent Test**: A user with an account but **no saved phone** signs in through the sign-in
screen; on landing they are taken to `/profile`, the phone entry field is focused, and an
explanatory banner ("כדאי להוסיף מספר טלפון") is shown. They may add a number or navigate away
freely.

**Acceptance Scenarios**:

1. **Given** a user with no phone who signs in via the email form, **When** the sign-in succeeds,
   **Then** on the next authenticated load they are routed to `/profile?onboarding=phone`, the phone
   field is autofocused, and the explanatory banner is shown (D1/D2/D5).
2. **Given** a user with no phone who signs in via Google SSO, **When** they return from the SSO
   round-trip, **Then** the same nudge applies (the flag survives the redirect in `sessionStorage`)
   (D2).
3. **Given** the same user after the nudge, **When** they reload the page or navigate elsewhere,
   **Then** the nudge does **not** fire again (the one-shot flag was already consumed) (D4).
4. **Given** the user adds a phone from the nudged profile page, **When** they revisit or log in
   again in a later session, **Then** the banner and autofocus do not appear (they now have a phone)
   (D1).

---

### User Story 2 — Declining the nudge (Priority: P2)

A user who does not wish to add or share a phone can dismiss the prompt and continue using the app
unimpeded.

**Independent Test**: A phone-less user lands on the nudged profile page, ignores the banner, and
navigates to any other screen; the app is fully usable and the nudge never re-appears in that
session.

**Acceptance Scenarios**:

1. **Given** the nudged profile page, **When** the user navigates away without adding a phone,
   **Then** the app functions normally and nothing is blocked (D1).
2. **Given** a user who keeps `share_phone` off, **When** they add a phone under the nudge, **Then**
   the number is saved but stays private per the opt-out — the nudge does not override the
   visibility preference (D1, dependency on ADR 0008).

---

### User Story 3 — Not disrupting existing users / automated sessions (Priority: P3)

Users who already have a phone, deep-linkers, page-reloaders, and API-authenticated e2e sessions are
never redirected.

**Independent Test**: An e2e run that authenticates via the API and deep-links into a page is never
redirected to `/profile`; a phone-having user logging in lands on their intended destination.

**Acceptance Scenarios**:

1. **Given** a user who already has a phone, **When** they sign in, **Then** they land on the
   intended destination (the redirect target or `/stays`) with no nudge (D1/D2).
2. **Given** an API-authenticated session with no login-intent flag (e.g. Playwright), **When** any
   authenticated page mounts, **Then** no redirect occurs (D3).
3. **Given** a phone-less user who reloads a deep-linked page after their one-shot nudge was already
   consumed, **When** the shell mounts, **Then** no redirect occurs (D4).

---

### Edge Cases

- **Dismiss / ignore** → app fully usable; nudge does not recur in-session (D1/D4).
- **Already has a phone** → no banner, no autofocus, no redirect, even if `?onboarding=phone` is
  present in the URL (the banner condition also checks `phones.length === 0`) (D1).
- **Google SSO round-trip** → flag persists in `sessionStorage` across the external redirect and is
  consumed on return; if the SSO call fails client-side, the flag is cleared so a later unrelated
  load is not nudged (D2).
- **`sessionStorage` unavailable** (privacy mode / blocked storage) → arming is a silent no-op; the
  user simply is not nudged (never an error) (D2).
- **Already on `/profile`** when the flag is consumed → flag cleared, no redirect (avoids a
  self-navigation), banner only shows if the `?onboarding=phone` param is present (D4).
- **Deep-link / reload / e2e** → no flag ⇒ no redirect (D3).

---

## Requirements

### Functional Requirements

- **FR-001**: After a **real UI sign-in or registration** (email sign-in success, or immediately
  before a Google SSO redirect), the system MUST arm a one-shot post-login "add a phone" nudge (D2).
- **FR-002**: On the next authenticated page load, the system MUST consume the armed flag **exactly
  once** and, only if the user has **no phone** (`phones.length === 0`) **and** is not already on
  `/profile`, redirect them to `/profile?onboarding=phone` (D2/D4).
- **FR-003**: The system MUST clear the one-shot flag on consumption **whether or not** it redirects,
  so the nudge can never fire twice for one login and can never loop (D4).
- **FR-004**: The system MUST NOT redirect on ordinary authenticated page loads, reloads,
  deep-links, or API-only sessions that did not set the login-intent flag (D3).
- **FR-005**: On `/profile`, when `?onboarding=phone` is present **and** the user has no phone, the
  system MUST show an explanatory banner (title + body, i18n) and autofocus the phone-entry field;
  otherwise it MUST show neither (D1/D5).
- **FR-006**: The nudge MUST be **soft and dismissible** — it MUST NOT block any app functionality
  and MUST NOT override the `user.share_phone` opt-out; a user may decline to add or share a number
  (D1).
- **FR-007**: If `sessionStorage` is unavailable, arming MUST be a silent no-op (no error, simply no
  nudge) (D2).
- **FR-008**: If a Google SSO attempt fails on the client, the system MUST clear the armed flag so a
  subsequent unrelated authenticated load is not nudged (D2).
- **FR-009**: The profile page MUST read the onboarding parameter directly from the URL (not via
  router context) so the banner/autofocus logic is unit-testable in isolation (D5).
- **FR-010**: All 007 UI — the banner and the focused phone field — MUST meet WCAG 2.1 AA, be
  RTL-correct and keyboard-operable, and use i18n-only strings (he/en parity) and tokens-only colors.

### Key Entities

- **Login-intent flag (client, ephemeral)** — a single `sessionStorage` key
  (`mn_check_phone_onboarding`), value `"1"`, set by the auth screens and removed on first
  consumption by the app shell. Not persisted server-side; no DB column, no API.
- **Onboarding URL parameter** — `?onboarding=phone` on the `/profile` route, driving the banner +
  autofocus. Declared in `validateSearch`; also read directly from `window.location.search`.
- Reuses the **002** profile phone list (`phones`) and the **ADR 0008** `share_phone` preference.
  Introduces **no new persistent entity**.

---

## Success Criteria

- **SC-001**: A phone-less user completing a real UI sign-in or registration lands on
  `/profile?onboarding=phone` with the phone field focused and the banner shown, in 100% of cases
  (D1/D2).
- **SC-002**: The nudge fires **at most once** per login — a reload or subsequent navigation after
  consumption produces no further redirect, in 100% of cases (D4).
- **SC-003**: A user who already has a phone is **never** redirected by the nudge and lands on their
  intended destination, in 100% of cases (D1).
- **SC-004**: An API-authenticated session that did not perform a UI login (e.g. the Playwright e2e
  suite) is **never** redirected to `/profile` by the nudge (D3).
- **SC-005**: The nudge never blocks app functionality: a user can dismiss/ignore it and use every
  screen, in 100% of cases (D1).
- **SC-006**: Where `sessionStorage` is unavailable, no error is surfaced and the user is simply not
  nudged (D2).
- **SC-007**: The banner + focused field meet WCAG 2.1 AA, are RTL-correct and keyboard-operable, and
  the banner strings exist in both he and en with parity (FR-010).

---

## Assumptions

- The profile phone-management surface (add/remove phone, `share_phone` opt-out) from **002** / ADR
  0008 already exists; 007 only adds the routing nudge + banner + autofocus on top of it.
- A user is considered "reachable" when `phones.length > 0`; the nudge targets `phones.length === 0`.
- `sessionStorage` (not `localStorage`) is the right scope: the nudge should apply per login/session,
  not persist indefinitely across sessions.
- No server-side record of "has been nudged" is needed or wanted (D6) — the ephemeral session flag is
  sufficient, and avoids a schema/API change.
- Automated (API-authenticated) test sessions must be treatable as never-nudged; the login-intent
  flag makes that automatic (D3).

## Out of Scope / Not Included

- **`data-model.md`** — no persistent-state change (no table, no column, no migration).
- **`contracts/`** — no API change (no new or modified endpoint; the existing profile/phone
  endpoints are reused unchanged).
- Repeated / scheduled re-nudging, email/SMS reminders, or any hard gate on adding a phone.
