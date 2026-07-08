# Implementation Plan: Phone-Number Onboarding Nudge

**Branch**: `007-phone-onboarding` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-phone-onboarding/spec.md` (D1–D6). Retroactive plan
— documents the shipped implementation.

## Summary

Add a **soft, one-shot, dismissible** post-login nudge that routes a phone-less user to their profile
(field focused + explanatory banner) so they can be reached (ADR 0008). The nudge is armed by the
**auth screens** on a genuine UI sign-in/register and consumed **once** by the **app shell** on the
next authenticated load, coordinated by a single `sessionStorage` flag — never on every page load, so
it never hijacks deep-links, reloads, or API-only (e2e) sessions. **Frontend-only**: no backend, no
schema, no API. No `data-model.md` and no `contracts/` (nothing persistent or API-shaped changes).

Technical spine: a tiny `apps/frontend/src/lib/onboarding.ts` (the `PHONE_NUDGE_KEY` +
`armPhoneNudge()` seam), an arming call in `AuthScreens.tsx` (email sign-in success + before Google
SSO; clear on SSO failure), a consumer in `AppShell.tsx` (one-shot read on mount → conditional
redirect), the `/profile` route `validateSearch` for `?onboarding=phone`, and the profile page
reading that param to render the banner + pass `autoFocus` to `PhoneInput`. Plus two i18n keys and a
unit test.

## Technical Context

**Language/Version**: TypeScript (ES2022) — unchanged.

**Primary Dependencies**: React, TanStack Router, react-i18next, better-auth client
(`authClient.signIn.email` / `signIn.social`). Browser `sessionStorage` + `window.location`. **No new
runtime deps.**

**Storage**: **None.** No D1 change, no migration. The only state is an ephemeral `sessionStorage`
flag (`mn_check_phone_onboarding`) scoped to the tab session.

**Testing**: Vitest + Testing Library — `apps/frontend/src/features/profile/Profile.test.tsx` covers
the banner shown / hidden-without-param / hidden-when-phone-exists cases (reads `?onboarding=phone`
via `window.history.replaceState`, no router mount — validating the D5 direct-URL-read seam). The
existing e2e suite (Playwright) implicitly covers D3: it authenticates via the API and never sets the
flag, so it must never be redirected (the regression this feature was designed around).

**Target Platform**: Cloudflare Workers Static Assets (frontend SPA).

**Project Type**: Web — frontend app only (this feature touches no backend package).

**Performance Goals**: Negligible — one `sessionStorage.getItem` on the shell's existing mount
effect (folded into the profile-hydration `useEffect` already present), one conditional navigate. No
added network calls.

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (FR-010/SC-007); i18n-only strings (he/en parity);
tokens-only colors (the banner uses `primary`/`primary-soft`/`primary-container` tokens). The nudge
MUST be soft (never a gate) and MUST NOT override the `share_phone` opt-out (D1).

**Scale/Scope**: 3 user stories; ~1 new 17-line lib file; small edits to 4 existing files
(AuthScreens, AppShell, Profile, PhoneInput) + the router + 2 i18n keys + 1 test. No ADR required
(no architectural decision beyond the localized nudge seam; no license/containment concern).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ N/A | Frontend-only; no backend touched. |
| Contract-first (shared Zod → DTOs + FE) | ✅ N/A | No API/contract change; reuses existing profile DTO. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | Banner + focused field RTL-correct, keyboard-operable, axe-clean (FR-010/SC-007). |
| i18n-only strings, tokens-only colors | ✅ | `profile.phonePrompt.{title,body}` (he/en); banner uses primary tokens only. |
| Secrets via env bindings only | ✅ N/A | No secrets, no config. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | `onboarding.ts` + the consumer/armer carry JSDoc; deliberately minimal (a flag, not a state machine). |
| Edge-first, no high-latency round trips | ✅ | No added network; folded into an existing mount effect. |

**Result**: PASS — no deviations. The feature is intentionally the smallest thing that works: an
ephemeral client flag + a URL param, no persistence, no API. No Complexity Tracking entries.

## Approach & Key Design Decisions

### The `sessionStorage` one-shot flag seam (D2/D4)

`lib/onboarding.ts` exposes `PHONE_NUDGE_KEY` and `armPhoneNudge()`. Arming and consuming are
deliberately split across two components that each own the right moment:

- **Arm — `AuthScreens.tsx` (login intent).** `armPhoneNudge()` is called on **email sign-in
  success** (`SignIn.submit`) and **just before the Google SSO redirect** (`GoogleButton.start`,
  because control leaves the page on success and only returns here on failure — where the flag is
  cleared). This keys the nudge to a *real* interactive login, not to session existence.
- **Consume — `AppShell.tsx` (next authed load).** Inside the shell's existing profile-hydration
  `useEffect` (which already fetches the profile once on mount), after theme/language sync:
  `if (sessionStorage.getItem(PHONE_NUDGE_KEY))` → **remove it first**, then redirect only when
  `p.phones.length === 0 && window.location.pathname !== "/profile"`. Removing before the decision
  makes it strictly one-shot (D4) and loop-proof.

### Why the shell consumes it — and why NOT a route guard (D3)

Placing the check in `AppShell` (which already loads the profile) means the phone list is available
without an extra fetch, and it runs once per authenticated mount. A **route `beforeLoad` guard** was
rejected: a guard runs on *every* navigation into a matching route, which is exactly the "fires on
every load" behavior that caused the e2e regression. The nudge must be tied to an explicit login
intent (the flag), not to route entry. The flag-gated shell check is the minimal seam that satisfies
that.

### Reading the URL param directly, not via router context (D5)

`Profile.tsx` computes `onboardingPhone` from `new URLSearchParams(window.location.search)` rather
than the router's typed search. This keeps the banner/autofocus logic pure and unit-testable by just
setting `window.history.replaceState(...)` — no router provider needed in the test (see
`Profile.test.tsx`). The route still declares
`validateSearch: (s) => ({ onboarding: s.onboarding === "phone" ? "phone" : undefined })` so the
param is a first-class, type-safe navigation target from the shell's `navigate({ to: "/profile",
search: { onboarding: "phone" } })`.

### Soft, not a gate (D1)

The banner is informational; the profile page and the whole app remain fully usable. The banner and
autofocus are additionally gated on `p.phones.length === 0`, so a user who already has a phone (or
adds one) sees neither. The `share_phone` opt-out (ADR 0008) is untouched — a user may add a number
and still keep it private, or decline entirely.

## The e2e-hijack pitfall (and how it is avoided)

**Pitfall (a real bug fixed mid-development).** The first version redirected to `/profile` on **every
`AppShell` mount** whenever `phones.length === 0`. Consequences:

- The **Playwright e2e suite** authenticates via the API and deep-links directly into pages. Its seed
  users often have no phone, so every deep-linked page was hijacked to `/profile`, breaking the
  suite.
- Any **reload** or **shared deep-link** for a real phone-less user would likewise bounce to
  `/profile`, an aggressive UX that ignored intent.

**Fix / standing constraint.** Gate the redirect behind the explicit one-shot login-intent flag set
only by the auth screens on a genuine UI login. API-authenticated sessions never set the flag, so
they are never redirected (SC-004); a post-consumption reload has no flag, so it does not recur
(SC-002). This is the load-bearing design constraint of the feature, not an incidental detail — the
nudge is triggered by *login*, never by *session presence*.

## Project Structure

### Documentation (this feature)

```text
specs/007-phone-onboarding/
├── plan.md            # This file
├── spec.md            # Scenarios, FR-###, SC-###
├── quickstart.md      # Manual + automated validation scenarios
├── tasks.md           # Task checklist (all complete)
└── checklists/
    └── requirements.md # Spec-quality checklist
# NO data-model.md   — no persistent-state change
# NO contracts/      — no API change
```

### Source Code (repository root — frontend only)

```text
apps/frontend/src/
├── lib/onboarding.ts                    # NEW: PHONE_NUDGE_KEY + armPhoneNudge() (sessionStorage seam) + JSDoc rationale
├── features/auth/AuthScreens.tsx (edit) # arm on email sign-in success + before Google SSO; clear flag on SSO failure
├── components/AppShell.tsx (edit)       # consume flag once in the existing mount effect → redirect if phones===0 && not on /profile
├── features/profile/Profile.tsx (edit)  # read ?onboarding=phone from window.location.search → banner + autoFocus on PhoneInput
├── features/profile/PhoneInput.tsx (edit) # accept an autoFocus prop, applied to the number <input>
├── router.tsx (edit)                    # profile route validateSearch onboarding:"phone"
├── i18n/locales/he.ts (edit)            # profile.phonePrompt.{title,body}
├── i18n/locales/en.ts (edit)            # profile.phonePrompt.{title,body}
└── features/profile/Profile.test.tsx (edit) # banner shown / hidden-no-param / hidden-when-phone-exists
```

**Structure Decision**: Frontend SPA only. The one new module is the `onboarding.ts` coordination
seam; everything else is a small edit to an existing file. No `packages/shared`, no `apps/backend`,
no migration.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
