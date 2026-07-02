# Feature Specification: Platform Foundation

**Feature Branch**: `001-platform-foundation`

**Created**: 2026-06-18

**Status**: Draft

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md) for product-wide decisions and shared
entities, and [`design/DESIGN-SYSTEM.md`](../../design/DESIGN-SYSTEM.md) for the Jerusalem
Stone design tokens (colors, typography, theme, app-shell/nav patterns) this feature implements.

---

## Summary

The skeleton every other feature hangs on: authentication, the app shell and navigation,
the Hebrew/RTL design system and theme, the marketing homepage, a basic user profile,
and the Hebrew-date + holidays widget in the header. After this feature ships, a user can
arrive, understand the product, sign in, and land in an (empty) authenticated dashboard.

---

## Clarifications

### Session 2026-06-18

- Q: How should language (Hebrew/English) work? → A: Persisted per-user preference
  (default Hebrew) plus a switcher in the header; anonymous visitors default to Hebrew.
- Q: Should users be able to delete their account and all their data? → A: Yes —
  self-service account + cascade data deletion in v1 (GDPR-aligned).
- Q: How should the phone number be handled? → A: Optional, stored in international
  (E.164) format, prompted at first Stay creation, and a user may store multiple numbers.
- Q: How should the 30-day session behave on shared/public devices? → A: 30-day persistent
  session by default, with a "shared device" option that creates a short-lived session.
- Q: Auth methods for v1? → A: **Google SSO + full email/password** (register, verify, reset),
  with account linking by verified email. Reverses the earlier "Google SSO only" — not all
  users have a smartphone or Google account. (Requires a transactional email provider — see
  research D16.) All methods share the same 30-day / shared-device session model.

---

## User Scenarios & Testing

### User Story 1 — Understand the Product from the Homepage (Priority: P1)

A first-time visitor lands on a rich marketing homepage and understands what the platform
does and why to join.

**Why this priority**: Acquisition entry point. Every other story assumes the user already
decided to sign in.

**Independent Test**: A person unfamiliar with the product can read the homepage and
accurately explain it to a third party with no extra help.

**Design reference**: built; see [`design/`](../../design/) — `Minyanim Homepage.dc.html`,
[`HOMEPAGE-BRIEF.md`](../../design/HOMEPAGE-BRIEF.md), and final copy in
[`HOMEPAGE-COPY.md`](../../design/HOMEPAGE-COPY.md).

**Page sections** (desktop split layout, stacking to a single column on mobile): sticky
nav (wordmark, anchor links, language switcher, theme toggle, sign-in) → split hero
(Hebrew display headline + Google CTA + an illustrative animated globe of travelers
converging) → an honest "early access" band (no fabricated metrics) → 3-step "how it works"
→ mission narrative → testimonials → footer CTA → footer.

**Acceptance Scenarios**:

1. **Given** a visitor lands on the homepage, **When** they scroll, **Then** they see a
   Hebrew headline explaining the concept, how a minyan forms from travelers' stays, the
   3-step explanation, and a clear "התחברו עם Google" call to action.
2. **Given** a visitor on a 375 px mobile screen, **When** they view the homepage,
   **Then** the desktop split layout collapses to a single readable column and the CTA is
   reachable without horizontal scrolling.
3. **Given** an already-authenticated user visits the homepage, **When** it loads,
   **Then** the CTA reflects their state (e.g. "Go to My Stays") instead of "Sign in".
4. **Given** a user with `prefers-reduced-motion: reduce`, **When** the homepage loads,
   **Then** scroll reveals, count-ups, and the globe animation are disabled or reduced to a
   static state.
5. **Given** the homepage at any breakpoint, **When** it renders, **Then** the brand
   wordmark is used consistently (a single canonical name) and the decorative globe is
   exposed to assistive tech as non-content (e.g. `aria-hidden`).

---

### User Story 2 — Sign In & Register (Google SSO + Email/Password) (Priority: P1)

A user authenticates either via **Google SSO** or via **email + password** (with
registration), getting a long-lived session. Email/password exists because not all users
have a smartphone or a Google account.

**Why this priority**: All personalized features require identity.

**Independent Test**: A user registers with email + password, verifies their email, signs in,
closes the browser, reopens two weeks later, and is still signed in. Separately, a user signs
in with Google and reaches the same dashboard.

**Acceptance Scenarios**:

1. **Given** a visitor clicks "Sign in with Google", **When** they complete the OAuth flow,
   **Then** they land on their authenticated dashboard.
2. **Given** a visitor registers with email + password, **When** they submit, **Then** a
   verification email is sent and, after verifying, they can sign in.
3. **Given** a registered user, **When** they sign in with email + password, **Then** they
   land on their dashboard with a session.
4. **Given** a user forgot their password, **When** they request a reset, **Then** they
   receive a reset email and can set a new password.
5. **Given** a previously signed-in user returns after 30 days, **When** they open the app,
   **Then** they are still signed in without re-authenticating (any method).
6. **Given** a user who registered with email later signs in with Google using the **same
   verified email**, **When** they authenticate, **Then** the accounts are linked (one user),
   not duplicated.
7. **Given** a signed-in user signs out, **When** they visit a protected page, **Then** they
   are redirected to the homepage / login.
8. **Given** an unauthenticated visitor, **When** they request any page other than the
   homepage, **Then** they are redirected to sign in.
9. **Given** the sign-in screen, **When** the user marks "this is a shared device", **Then**
   their session is short-lived (ends on browser close / brief inactivity) rather than 30 days
   — regardless of sign-in method.
10. **Given** repeated failed sign-in or reset attempts, **When** a threshold is exceeded,
    **Then** the endpoint is rate-limited (`429`).

---

### User Story 3 — App Shell, Navigation & RTL Theme (Priority: P1)

Authenticated users see a consistent application shell — header, navigation, and a Hebrew
RTL theme — across all pages.

**Why this priority**: The design system and layout are shared infrastructure that every
later feature builds on; building them once here prevents rework.

**Independent Test**: Navigating between the (placeholder) authenticated pages shows a
consistent RTL header, navigation, and theme on both mobile and desktop.

**Acceptance Scenarios**:

1. **Given** an authenticated user on any page, **When** it renders, **Then** the layout
   is right-to-left with Hebrew typography and a consistent header and navigation.
2. **Given** the app shell, **When** viewed at 375 px, **Then** navigation collapses to a
   mobile-appropriate pattern and all targets are ≥ 44×44 px.
3. **Given** any interactive element in the shell, **When** navigated by keyboard,
   **Then** focus order is logical and focus indicators are visible.
4. **Given** the header language switcher, **When** a signed-in user switches between
   Hebrew and English, **Then** the UI language and text direction update (Hebrew → RTL,
   English → LTR) and the choice is saved to their profile and persists across devices.
5. **Given** an anonymous visitor with no saved preference, **When** any page loads,
   **Then** it defaults to Hebrew.
6. **Given** the header theme toggle, **When** a user selects Light, Dark, or System,
   **Then** the theme applies immediately across the app; for a signed-in user it is saved
   to their profile (persists across devices), and for everyone it is also kept in
   local-storage so it applies on the next load before sign-in.
7. **Given** a user with no saved theme, **When** any page first loads, **Then** the theme
   follows the operating-system preference (prefers-color-scheme) with no flash of the
   wrong theme.

---

### User Story 4 — Hebrew Date & Holidays in the Header (Priority: P2)

The header always shows the current Hebrew (Jewish) calendar date and indicates upcoming
Jewish holidays.

**Why this priority**: Self-contained, reinforces the Hebrew/RTL identity, and is widely
expected by the target audience. Standalone — depends only on the shell.

**Independent Test**: On any page, the header shows today's Hebrew date; on a day near a
holiday it indicates the upcoming holiday. The Hebrew date advances at local nightfall.

**Acceptance Scenarios**:

1. **Given** any page, **When** it loads, **Then** the header shows the current Hebrew
   date in Hebrew.
2. **Given** the local time passes nightfall (tzet hakochavim), **When** the header
   refreshes, **Then** the Hebrew date advances to the next day.
3. **Given** a Jewish holiday falls within the coming days, **When** the header renders,
   **Then** it indicates the upcoming holiday.

---

### User Story 5 — Basic User Profile (Priority: P2)

A signed-in user can view and edit their display name, email, language preference, theme
preference, and one or more phone numbers used for coordination.

**Independent Test**: A user edits their display name, adds a second phone number, and
switches language and theme; after reload all values persist.

**Acceptance Scenarios**:

1. **Given** a newly signed-in user, **When** they open their profile, **Then** name and
   email are pre-filled from their Google account and language defaults to Hebrew.
2. **Given** a user edits name, language, theme, or phone numbers, **When** they save,
   **Then** the values persist and the name/phone are used as the default contact on
   future Stays.
3. **Given** a traveler with multiple numbers, **When** they add additional phone
   numbers, **Then** all are stored (in international E.164 format) and selectable as
   contact details.
4. **Given** a phone number entered in a non-international format, **When** the user
   saves, **Then** they are prompted to provide it in international (E.164) format.

---

### User Story 6 — Delete Account & Data (Priority: P2)

A signed-in user can permanently delete their account and all associated data.

**Why this priority**: Required for privacy/GDPR compliance given the platform stores
EU residents' contact details; deletion semantics must be defined into the data model
from the foundation.

**Independent Test**: A user deletes their account; after confirmation they are signed
out, and a subsequent attempt to access their former data returns nothing.

**Acceptance Scenarios**:

1. **Given** a signed-in user on their profile, **When** they choose "Delete my account",
   **Then** they must explicitly confirm before deletion proceeds.
2. **Given** the user confirms deletion, **When** it completes, **Then** their account and
   all data they own (and, in later features, their Stays, commitments, and folders) are
   permanently removed via cascade, and they are signed out.
3. **Given** a deleted account, **When** the same identity (Google **or** email) signs in /
   registers again, **Then** a fresh, empty account is created (no recovery of prior data).

---

### Edge Cases

- Google OAuth failure or denial → the user returns to the homepage with a clear,
  non-technical error message (localized he/en via an error code).
- Email/password edge cases → unverified email attempting sign-in (prompt to verify / resend);
  reset requested for a non-existent email (respond identically to avoid account enumeration);
  expired verification/reset token (allow re-request).
- Expired/invalid session on a protected page → redirect to sign in, then back to the
  originally requested page after re-auth.
- Zmanim/calendar data source unavailable → the header degrades gracefully (shows the
  Hebrew date without holiday annotations rather than breaking).

---

## Requirements

### Functional Requirements

- **FR-001**: The homepage MUST be the only page accessible without authentication.
- **FR-002**: The system MUST authenticate users via **Google SSO and email+password**, and
  persist sessions for at least 30 days without re-login by default; the sign-in screen MUST
  offer a "shared device" option that creates a short-lived session instead. Session behavior
  is identical across all sign-in methods.
- **FR-003**: The system MUST redirect unauthenticated requests for protected pages to
  sign in, preserving the intended destination.
- **FR-004**: The application MUST present a consistent app shell (header + navigation)
  across all authenticated pages, defaulting to Hebrew (RTL). A header language switcher
  MUST let users switch between Hebrew (RTL) and English (LTR); the selection MUST be
  saved to the user's profile and persist across devices. Anonymous visitors MUST default
  to Hebrew.
- **FR-005**: The header MUST display the current Hebrew calendar date, advancing at local
  nightfall, and MUST indicate upcoming Jewish holidays.
- **FR-006**: A signed-in user MUST be able to view and edit their display name, email,
  language preference, and one or more phone numbers; name and email MUST be pre-filled
  from Google on first sign-in. Phone numbers MUST be optional, stored in international
  (E.164) format, and the user MUST be able to store multiple numbers.
- **FR-007**: All foundation pages MUST meet WCAG 2.1 AA (keyboard operability, focus
  visibility, contrast) and render without breakage on a 375 px screen.
- **FR-008**: A signed-in user MUST be able to permanently delete their account, which
  MUST cascade-delete all data they own (across this and later features), require explicit
  confirmation, and sign the user out. Re-authenticating with the same identity (Google or
  email) MUST create a fresh, empty account with no recovery of prior data.
- **FR-013**: The system MUST support **email + password** registration and sign-in,
  including **email verification** and **password reset** (both via a transactional email
  provider — see research D16). Sign-in, registration, and reset endpoints MUST be
  rate-limited. Reset/verification responses MUST NOT reveal whether an email is registered
  (no account enumeration).
- **FR-014**: The system MUST **link accounts by verified email** — a Google sign-in and an
  email/password account for the same verified address MUST resolve to a single user, not a
  duplicate.
- **FR-009**: The app MUST support Light, Dark, and System (OS-following) themes via a
  header toggle. The selection MUST apply immediately, be persisted to the signed-in user's
  profile (across devices), and be cached in local-storage so it applies on first load
  before authentication without a flash of the wrong theme. With no saved preference the
  theme MUST follow the OS `prefers-color-scheme`. The stored preference MUST be an
  extensible theme identifier (not a light/dark boolean) so additional named themes can be
  added later without a data-model change.
- **FR-010**: Homepage marketing claims MUST be truthful. Usage metrics and attributed
  testimonials MUST NOT be fabricated; pre-launch, the page MUST use honest framing (e.g.
  "early access / be among the first") and any attributed testimonial MUST be real and
  consented. The product MUST be presented as free with no advertising — copy MUST NOT
  imply a paid tier (no "free trial" / "no credit card" framing).
- **FR-011**: A single canonical brand wordmark MUST be used consistently across the
  marketing homepage and the app (no mixing of singular/plural or variant spellings).
- **FR-012**: Homepage motion (scroll reveals, count-ups, the animated globe) MUST honor
  `prefers-reduced-motion: reduce`, and purely decorative visuals (e.g. the globe canvas)
  MUST be exposed to assistive technology as non-content.

### Key Entities

- **User** — see [ROADMAP](../ROADMAP.md). This feature establishes the User record with:
  Google identity, display name, email, **language preference** (default Hebrew),
  **theme preference** (extensible identifier; default "system"), **zero or more phone
  numbers** (E.164), and the account-deletion (cascade) lifecycle.

---

## Success Criteria

- **SC-001**: A first-time visitor can go from landing to a signed-in dashboard in under
  30 seconds.
- **SC-002**: A returning user within 30 days is auto-authenticated with no login prompt.
- **SC-003**: Every foundation page passes an automated WCAG 2.1 AA audit with zero
  critical violations.
- **SC-004**: The Hebrew RTL layout renders without overflow or breakage across all
  supported screen sizes.
- **SC-005**: The header Hebrew date matches an authoritative Jewish-calendar source for
  any given local date, including the nightfall rollover.
- **SC-006**: Switching language updates UI text and direction within 1 second and the
  choice is reflected on the user's next session on any device.
- **SC-007**: Account deletion removes 100% of the user's owned data and is irreversible;
  no deleted-account data is retrievable afterward.
- **SC-008**: Switching theme applies within 1 second with no flash of the wrong theme on
  subsequent loads; both Light and Dark themes pass the WCAG 2.1 AA contrast audit.

---

## Assumptions

- Auth methods in v1 are **Google SSO + email/password** (with verification, reset, and
  account linking by verified email). Additional SSO providers (Apple/Microsoft) and
  passwordless are deferred.
- A **transactional email provider** is required for verification + reset (Workers cannot send
  email directly); see research D16. A sending domain with SPF/DKIM/DMARC is a pre-ship task.
- Jewish calendar / holiday data comes from a reliable third-party source (see ROADMAP
  open items).
- Hebrew and English are the only supported languages in v1.
- Themes in v1 are Light, Dark, and System; the preference is stored as an extensible
  identifier so additional named themes can be introduced later without migration.
- Profile fields beyond name, email, language preference, theme preference, and phone
  numbers are out of scope for this feature.
- "Short-lived" shared-device sessions end on browser close or brief inactivity; the exact
  duration is a planning detail.
