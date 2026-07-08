# 0010 — Seed users + phone-match claim: in-app confirm (beta), server re-verified

**Status**: Accepted (2026-07-08) · **Feature**: 009 (seed import + claim) · Revises the ADR-0008 contact-visibility model for seed users

## Context

We want to import a one-time spreadsheet of known community travelers so people find each other
before anyone has signed up (the same import ADR 0008 anticipated). Those people have **no
account**. When the real person later signs up, their imported trips should merge into their
account rather than becoming a duplicate.

The only identity signal shared between an imported record and a new account is the **phone
number**. But a phone on a profile is one the user **typed themselves** — nothing proves they own
it (there is **no SMS/OTP provider** in the stack; only transactional email via Resend). So an
unguarded "your phone matches this record → take its data" flow is an **identity-takeover vector**:
someone could enter a stranger's number and claim their imported trips (exposing private
locations/contacts).

## Decision

Model imported people as **seed users** and gate the merge behind an **in-app confirmation** that
the server **re-verifies**, accepting a bounded residual risk for the private beta.

- **`user.kind`** (`'real'` | `'seed'`, default `'real'`; migration 0009). A seed user is a `user`
  row with a synthetic email and **no `account`** row, so it can never sign in, but it owns
  stays/events and appears in discovery.
- **Claim flow**: after a user adds a phone (feature 007), `GET /api/me/claims` offers seed users
  whose phone matches; a dismissible dashboard banner asks *"we found trips linked to you — add
  them?"*. `POST /api/me/claims` merges the selected seeds — reassigns `stay.user_id`,
  `event.host_user_id`, `commitment.user_id` (conflict-safe on the unique index) and
  `event_role.user_id` — then deletes the seed rows.
- **Server re-verification**: the claim endpoint independently re-checks that each id is
  `kind='seed'` **and** shares a phone with the caller, so a forged id in the request body claims
  nothing (`claimed: 0`). The client is never trusted with the match.
- **Seed privacy in discovery** (revises ADR 0008 for seeds): a `'seed'` owner **never** exposes a
  phone in the travelers list until claimed — they have not consented to sharing — though their
  **name** still surfaces so people know who is around.
- **Import is dev-only**, staged, and runs locally (PII stays on the operator's machine).

## Consequences

- Imported trips become visible immediately and merge cleanly on sign-up; no duplicate accounts.
- Residual risk: a user who knows someone else's phone could claim their imported trips during the
  beta. Mitigated by in-app confirmation + server re-verification + hiding seed contact until
  claimed, and bounded by the private-beta audience. **Launch gate**: before a public launch,
  require phone verification (SMS OTP) or restrict claims to a verified-email match.
- `user.kind` must be considered anywhere users are listed/queried; discovery projection now carries
  `ownerKind`.

## Alternatives

- **SMS-OTP verified claim**: the robust answer, but needs an SMS provider the stack doesn't have —
  deferred to the launch gate above.
- **Verified-email match only**: safe, but only works for imported rows that carry an email and
  misses phone-only records; kept as a possible launch-gate option.
- **Admin-approved claims** (ties into 006 Admin): safest, but needs the admin surface + manual
  work; rejected for beta velocity.
- **Per-stay contact fields instead of seed users**: the pre-existing `stay.contact_*` columns can
  label a contact, but a stay still needs a real owner — it can't represent an unregistered person
  who *owns* visible trips. Seed `user` rows reuse every existing FK cleanly; chosen.
