# Feature Specification: Seed Import + Seed-User Claim / Merge

**Feature Branch**: `009-seed-import-claim`

**Created**: 2026-07-08 (retroactive — documents shipped/in-progress work)

**Status**: Part A **Implemented** (shipped); Part B **Partial** — Step 1 done, Steps 2–4 pending.

**Context**: See [`specs/ROADMAP.md`](../ROADMAP.md). Depends on **001 Users/Profile**, **002 Stays**,
and **003 Events/Discovery**; integrates with **007** (adding a profile phone is what surfaces claim
matches). Revises the **003 / [ADR 0008](../../docs/adr/0008-contact-visibility.md)**
contact-visibility model for imported (seed) users. This document is written **after** the fact to
capture the shipped Part A and the partially-built Part B.

---

## Summary

To seed a fresh community before launch, a one-time spreadsheet of known travelers is loaded into
the app as **seed users** — placeholder people who own stays (and possibly hosted minyanim) and
appear in discovery so travelers find each other, but who have **no account and can never sign in**.
When the real person later signs up and adds the **same phone number** to their profile, the app
offers to **claim** the matching seed(s): their trips and minyanim are merged into the real account
and the seed rows are deleted.

The feature has two parts, at different maturity:

- **Part A — Seed-user model + phone-match claim/merge (IMPLEMENTED).** The `user.kind` field, the
  claim discovery/merge endpoints, the discovery contact-hiding for seed owners, and the dashboard
  claim banner are all shipped and tested.
- **Part B — Excel→DB import pipeline (PARTIAL).** A staged, **dev-only, local** pipeline that
  turns an exported spreadsheet into seed users/stays. **Step 1** (inspect/convert: CSV → `raw.json`
  + a column `profile.json`) is done. **Steps 2–4** (map → Zod-validate → data-quality gates →
  create, with `--dry-run`) are designed but **not yet built** — deliberately blocked on deciding
  what one sheet row represents (see D8).

---

## Clarifications

### Session 2026-07-08 (retroactive)

Decisions (D#) captured from the shipped code, `tools/seed-import/README.md`, and the
security posture the owner accepted for the private beta. Referenced from the requirements.

- **D1 — Seed users are ordinary `user` rows with `kind='seed'` and NO `account` row.** A seed is a
  full row in the better-auth-owned `user` table (synthetic `@seed.local` email, `kind='seed'`) with
  **no matching `account`** — so better-auth can never authenticate it. This reuses every existing FK
  (`stay.userId`, `event.hostUserId`, `commitment.userId`, `eventRole.userId`) instead of a parallel
  "pending person" table, so a seed's data is *already* in the shape a real user's data lives in, and
  a claim is a pure ownership reassignment. Migration **0009** adds `kind text NOT NULL DEFAULT
  'real'` (a single `ALTER`; existing rows default to `'real'`).
- **D2 — Claim match key = a phone the user TYPED on their own profile.** A seed becomes claimable to
  a signed-in user when the seed owns a `phone_number` (E.164) that **exactly equals** one of the
  caller's own profile phones. The phone is the only match key; name/email are not used (a seed's
  email is synthetic; names collide).
- **D3 — Claim authorization = "in-app confirm (beta)" — an accepted, documented risk.** The match
  key is a number the user typed into their own profile, so an unguarded claim is an
  **identity-takeover vector**: type someone else's phone → be offered their trips. There is **no SMS
  OTP provider** in the stack, so for the **private beta** the product accepts the risk with (a) an
  explicit **in-app confirmation** before merging, and (b) a **server-side re-verification** of the
  phone match on the claim write (the client cannot claim an arbitrary account by id). SMS OTP and
  admin-approved claims were considered and **deferred** (see Out of Scope). A production launch must
  revisit this (verified-phone gate).
- **D4 — Seed privacy in discovery: name shows, phone is withheld until claimed.** A seed owner has
  **not consented** to sharing their phone, so the discovery travelers list shows a seed's **name**
  (so others know who is around) but **never their phone**, regardless of any `share_phone` value —
  until the person claims the seed and becomes a real, consenting user. This **revises the ADR-0008
  contact-visibility model** (which shows sharers' phones in discovery) specifically for `kind='seed'`
  owners. Enforced server-side in the discovery projection (`ownerKind` added to the row).
- **D5 — The claim reassignment is conflict-safe.** Merging reassigns `stay`, `event`, `commitment`,
  and `eventRole` rows from each verified seed to the caller, then deletes the seed rows (which
  cascade away their phones). The one collision is the `commitment` `(event_id, user_id)` unique
  index: if the caller already committed to an event a seed also committed to, the seed's **duplicate
  commitment is dropped** before reassigning the remainder — the merge never violates the constraint.
- **D6 — Claim is all-or-the-selected-set; the banner merges every match.** `POST /api/me/claims`
  takes an explicit `seedUserIds[]`; the server re-verifies each and merges the verified subset,
  returning counts (`claimed`, `stays`, `events`). The dashboard banner offers **all** matches at
  once and confirms the whole set; it is **dismissible** and re-appears until claimed.
- **D7 — Import is DEV-ONLY, local, and staged.** The `tools/seed-import/` pipeline runs on a
  developer's machine against **dev D1 only** — never CI, never production. It processes PII
  (names/phones/locations) so **nothing is uploaded** by the scripts. Each step writes a **reviewable
  artifact** so the data is inspected and gated before it ever touches the database. Requires Node
  ≥ 22.6 (built-in TS type-stripping + `node:test`; zero runtime deps).
- **D8 — Steps 2–4 are BLOCKED on the row-semantics decision (why Part B is partial).** Before a seed
  schema can be written, we must decide **what one spreadsheet row represents**: one person + one
  trip? one person with many trips across rows? does a row also describe a hosted minyan? Step 1's
  `profile.json` (per-column fill rate / distinct count / samples / guessed kind) exists precisely to
  answer this. Until it is answered, Steps 2 (map + Zod validate), 3 (quality gates), and 4 (create)
  are **specified but intentionally unbuilt**.
- **D9 — Import data-quality gates (Step 3, planned).** Only rows passing **every** gate are eligible
  to create: a **valid, normalized E.164 phone** (the claim match key — a bad phone means the person
  can never claim their data) and a **resolvable location** via the app's existing geocoder
  (`geoService`). Rows that fail are written to `rejected.json` with a reason; passing rows to
  `accepted.json`. Step 4 supports `--dry-run` (report what *would* be created, write nothing).

---

## User Scenarios & Testing

### User Story 1 — Import known travelers as seed users (Priority: P1) — Part B

An operator loads a pre-launch spreadsheet of travelers into the app as seed users, through a staged
pipeline that lets them review and gate the data before anything is written.

**Independent Test**: An operator exports the sheet to CSV and runs the inspect step; `raw.json` and
`profile.json` are written locally and the column profile makes the row-semantics decision reviewable
— with nothing uploaded and no database write.

**Acceptance Scenarios**:

1. **Given** a CSV export of the source sheet, **When** the operator runs the inspect step, **Then**
   `raw.json` (every row keyed by header) and `profile.json` (per-column fill rate, distinct count,
   samples, guessed kind) are written locally and a compact summary prints to stdout (Step 1, done).
2. **Given** the reviewed `profile.json`, **When** the row semantics are decided, **Then** a seed
   schema + mapping validate each row with Zod, quarantining per-row errors to `rejected.json`
   (Step 2, **pending** — D8).
3. **Given** validated records, **When** the quality gates run, **Then** only rows with a valid E.164
   phone **and** a resolvable location reach `accepted.json`; the rest go to `rejected.json` with a
   reason (Step 3, **pending** — D9).
4. **Given** accepted rows, **When** the create step runs with `--dry-run`, **Then** it reports
   exactly what seed users/stays(/events) would be created and writes nothing; without `--dry-run` it
   creates them in dev D1 (Step 4, **pending**).

---

### User Story 2 — A real user claims their imported trips by phone match (Priority: P1) — Part A

A person who was imported as a seed signs up, adds their phone, and is offered their imported trips;
confirming merges them into their account.

**Independent Test**: A seed user with a phone and a stay exists; a real user signs up, adds the
matching phone, sees the claim offer with the trip count, confirms, and the stay moves to their
account while the seed is deleted.

**Acceptance Scenarios**:

1. **Given** a seed user owning a stay whose phone equals the caller's profile phone, **When** the
   caller reads their claim offers, **Then** the seed appears once with its trip/minyan counts (D2).
2. **Given** an offered seed, **When** the caller confirms the claim, **Then** the seed's stays,
   events, commitments, and roles are reassigned to the caller, the seed row is deleted, and the
   response reports the counts moved (D5/D6).
3. **Given** a seed whose phone does **not** match the caller, **When** the caller (even by forging
   the seed id in the request) attempts to claim it, **Then** nothing is claimed — the server
   re-verifies the phone match (D3).
4. **Given** a caller with **no** profile phone, **When** they read their claim offers, **Then** the
   offer set is empty (D2).
5. **Given** the caller already committed to an event a claimed seed also committed to, **When** the
   claim merges, **Then** the seed's duplicate commitment is dropped and the merge succeeds without a
   unique-constraint violation (D5).

---

### User Story 3 — Seed privacy in discovery (Priority: P1) — Part A

An imported seed appears in the discovery travelers list by name so others know who is around, but
their phone is never exposed until they claim their account and consent.

**Independent Test**: A seed user's stay in a discovery area shows the seed's **name** in the
travelers list but **no phone**; after the person claims the seed and shares their phone, the phone
appears (now as a consenting real user).

**Acceptance Scenarios**:

1. **Given** a `kind='seed'` owner's stay in a discovery area, **When** a signed-in viewer sees the
   travelers list, **Then** the seed's name shows but its phone is `null`, regardless of any
   `share_phone` value (D4).
2. **Given** a `kind='real'` owner who shares their phone, **When** a signed-in viewer sees the
   travelers list, **Then** the phone shows (ADR-0008 behavior — unchanged for real users).
3. **Given** a seed that is claimed and merged into a real, phone-sharing user, **When** discovery is
   read again, **Then** the (now real-owned) stay exposes the phone per ADR-0008 (D4).

---

### Edge Cases

- **Forged claim id** — a caller POSTs a seed id whose phone does not match theirs → the server
  re-verification yields an empty verified set; nothing is claimed (`claimed:0`) (D3).
- **Multiple seeds share one phone** — several seeds carry the caller's number → all are offered and,
  on confirm, all are merged (the offer de-dupes one entry per seed) (D2/D6).
- **Caller has no phone** — no match key → empty offers, and a claim attempt claims nothing (D2).
- **Commitment conflict on merge** — caller + seed both committed to the same event → the seed's
  duplicate commitment is deleted before reassignment; no unique-index violation (D5).
- **Seed with no stays/events** — the offer shows zero counts; a claim still deletes the empty seed
  (harmless cleanup).
- **Ambiguous / unresolvable location (import)** — a row whose location the geocoder can't resolve is
  rejected to `rejected.json`, not created coordless-and-silent (Step 3, D9 — pending).
- **Bad phone number (import)** — a row whose phone won't normalize to valid E.164 is rejected: an
  un-normalizable phone means the person could never claim their data (Step 3, D9 — pending).
- **Duplicate person across import runs** — re-importing the same sheet would create duplicate seeds;
  the importer is a **one-time** operation, and duplicates that share a phone all get claimed together
  on first claim (D6). (Idempotent import keys are out of scope for the one-time seed.)

---

## Requirements

### Functional Requirements

#### Part A — Seed-user model + claim/merge (implemented)

- **FR-001**: The system MUST support a `user.kind` of `'real'` (default) or `'seed'`. A `'seed'`
  user has no `account` row and MUST NOT be able to authenticate, yet MUST own stays/events and
  appear in discovery like any other traveler (D1).
- **FR-002**: A signed-in user MUST be able to read the set of **claimable seeds** — seed users that
  own a `phone_number` exactly matching one of the caller's own profile phones — each with its stay
  and event counts; a caller with no phone gets an empty set (D2).
- **FR-003**: A signed-in user MUST be able to **claim** a selected set of seed ids: the system
  reassigns those seeds' stays, events, commitments, and roles to the caller, then deletes the seed
  rows (cascading their phones), and reports the counts moved (D5/D6).
- **FR-004** (security): The claim write MUST **re-verify server-side** that each submitted id is a
  `kind='seed'` user sharing a phone with the caller, and merge **only the verified subset** — a
  client MUST NOT be able to claim an arbitrary account by forging an id (D3).
- **FR-005** (security): The claim MUST require an explicit **in-app confirmation** before merging;
  for the private beta this in-app confirm + server re-verification (FR-004) is the accepted
  authorization, in the documented absence of SMS OTP (D3).
- **FR-006**: The claim reassignment MUST be **conflict-safe** for the `commitment`
  `(event_id, user_id)` unique index: a seed's commitment to an event the caller already committed to
  MUST be dropped before reassignment, so the merge never violates the constraint (D5).
- **FR-007**: In discovery, a `kind='seed'` owner's phone MUST be **withheld** (name still shown),
  regardless of `share_phone`, until the seed is claimed — revising the ADR-0008 contact-visibility
  model for seed owners (D4).
- **FR-008**: The system MUST surface the claim offer to the user where their claimed trips will
  land (the stays dashboard), as a **dismissible** prompt that re-appears until claimed and merges
  all current matches on confirm (D6).
- **FR-009**: All Part-A UI (the claim banner) MUST meet WCAG 2.1 AA, be RTL-correct and
  keyboard-operable, use i18n-only strings (he/en parity) and tokens-only colors.

#### Part B — Import pipeline (Step 1 done; Steps 2–4 pending)

- **FR-010**: The import pipeline MUST run **locally, dev-only**, never in CI or against production,
  and MUST NOT upload any of the PII it processes (D7).
- **FR-011**: The pipeline MUST be **staged**, each step writing a reviewable on-disk artifact so the
  data can be inspected and gated before any database write (D7).
- **FR-012**: **[DONE]** Step 1 MUST convert a CSV export to `raw.json` (every row keyed by header)
  and a `profile.json` column report (per column: fill rate, distinct count, up to 5 samples, and a
  guessed kind — phone/email/date/number/location/name/text/empty) inferred from both header and
  values (D8).
- **FR-013**: **[PENDING]** Step 2 MUST map columns to a seed record and validate each row with Zod
  against a seed contract, quarantining per-row errors — blocked on the row-semantics decision (D8).
- **FR-014**: **[PENDING]** Step 3 MUST apply data-quality gates so only rows with a **valid,
  normalized E.164 phone** and a **resolvable location** (via the app's `geoService`) are eligible to
  create; failing rows go to `rejected.json` with a reason (D9).
- **FR-015**: **[PENDING]** Step 4 MUST create seed users/stays(/events) in **dev D1**, supporting
  `--dry-run` to report what would be created without writing (D9).

### Key Entities

- **Seed user** — a `user` row with `kind='seed'`, synthetic `@seed.local` email, and **no `account`
  row**; owns `stay`/`event`/`commitment`/`eventRole` rows via the existing FKs. Deleted on claim
  (D1).
- **`user.kind`** — `'real' | 'seed'`, `NOT NULL DEFAULT 'real'` (migration 0009). The only new
  persistent field; no new table (D1).
- **ClaimableSeed (derived)** — `{ seedUserId, name, phone, stays, events }`: a phone-matched seed
  offered to the caller; derived at read time, not stored (D2).
- **Reassignment set** — the rows moved on claim: `stay.userId`, `event.hostUserId`,
  `commitment.userId`, `eventRole.userId` (D5).
- **Import artifacts (on disk, dev-only)** — `raw.json`, `profile.json` (Step 1, exist); planned
  `records.json`, `accepted.json`, `rejected.json` (Steps 2–3) (D7/D8/D9).

---

## Success Criteria

- **SC-001**: A seed user with `kind='seed'` and no `account` cannot authenticate through any
  better-auth flow, yet its stays appear in discovery (D1).
- **SC-002**: A phone-matched seed is offered to the matching user in 100% of cases; a caller with no
  phone, or whose phone does not match, is offered nothing (D2).
- **SC-003**: On confirmed claim, 100% of the seed's stays/events/commitments/roles move to the
  caller and the seed row is deleted; the response counts equal what moved (D5/D6).
- **SC-004** (security): A forged-id claim for a non-matching seed claims nothing (`claimed:0`) in
  100% of cases — server re-verification holds even when the client lies about the id (D3/FR-004).
- **SC-005** (security/privacy): A `kind='seed'` owner's phone is absent from the discovery travelers
  list in 100% of cases, regardless of `share_phone`, until claimed (D4/FR-007).
- **SC-006**: A commitment conflict on merge is resolved without a unique-index violation in 100% of
  cases (D5).
- **SC-007**: Step 1 produces `raw.json` + `profile.json` for a valid CSV and uploads nothing
  (verified: dev-only, no network) (D7/FR-012).
- **SC-008**: The claim banner meets WCAG 2.1 AA, is RTL-correct and keyboard-operable, he/en i18n
  parity (FR-009).

---

## Assumptions

- The one-time seed sheet is a trusted, operator-curated export; the importer is a **one-time**
  operation, not an ongoing sync — idempotency keys / re-run dedupe are out of scope.
- Phone equality is on the already-normalized E.164 stored in `phone_number` (007's normalization is
  the source of truth); the importer must produce the same E.164 for a claim to ever match (D9).
- The private beta's threat model accepts in-app-confirm + server re-verification as claim
  authorization; a public launch will gate on a **verified** phone (SMS OTP) — a launch follow-up
  (D3).
- A seed's data already lives in the real-user shape (reusing the FKs), so a claim is an ownership
  reassignment, not a data transformation (D1).
- Node ≥ 22.6 is available on the operator's machine for the dev-only tool (built-in TS + `node:test`,
  no deps) (D7).

## Dependencies

- **001** — the `user` table + profile (the `kind` column extends it; the claim endpoints live under
  `/api/me`).
- **002** — Stays (the primary thing a seed owns and a claim reassigns).
- **003** — Events/Discovery (a seed may host a minyan; the travelers list is where seed privacy is
  enforced).
- **007** — Profile phone numbers: adding a phone is the trigger that surfaces claim matches; E.164
  normalization is the match key.
- **[ADR 0008](../../docs/adr/0008-contact-visibility.md)** — the contact-visibility model this
  feature revises for seed owners (D4/FR-007).

## Out of Scope (considered alternatives)

- **SMS OTP-verified claims** — the robust fix for the identity-takeover risk; deferred because no SMS
  provider is in the stack. A production launch gate (D3).
- **Admin-approved claims** — a human moderating each claim; considered and rejected for the beta as
  too heavy for the volume, and it does not itself prove phone ownership (D3).
- **Ongoing / idempotent import sync** — the importer is one-time; no re-run dedupe or upsert keys.
- **Importing hosted minyanim** — whether a sheet row also describes a hosted minyan is part of the
  unresolved row-semantics decision (D8); Step 4 may create events, but that is pending.
- **A separate "pending person" table** — rejected in favor of the seed-as-user-row model (D1).
