# Implementation Plan: Seed Import + Seed-User Claim / Merge

**Branch**: `009-seed-import-claim` | **Date**: 2026-07-08 (retroactive) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-seed-import-claim/spec.md` (D1–D9). Documents shipped
Part A + partial Part B.

## Summary

Two parts. **Part A (shipped)**: model imported people as ordinary `user` rows with `kind='seed'` and
no `account` (so they can never sign in but own stays/events and appear in discovery), and let a real
user **claim** the seeds whose phone matches their own profile phone — a server-re-verified ownership
reassignment (`stay`/`event`/`commitment`/`eventRole` → caller, then delete the seed), surfaced as a
dismissible dashboard banner. Discovery withholds a seed owner's phone (name still shows) until
claimed, revising ADR-0008 for seeds. **Part B (partial)**: a dev-only, local, staged CSV→DB import
pipeline; Step 1 (inspect/convert) is built; Steps 2–4 (map→validate→gate→create) are designed but
blocked on the row-semantics decision.

Technical spine (Part A): a `kind` column on `user` (migration 0009), a `claimRepository` +
`claimService`, `GET`/`POST /api/me/claims` in `routes/me.ts`, an `ownerKind` field threaded into the
discovery projection to gate the phone, shared `claim.ts` contracts, and a `ClaimBanner` on the stays
dashboard. Part B lives entirely under `tools/seed-import/` (zero runtime deps, Node ≥ 22.6).

## Technical Context

**Language/Version**: TypeScript (ES2022), Node ≥ 22 (tool needs ≥ 22.6 for TS type-stripping) —
unchanged.

**Primary Dependencies**: Hono, Drizzle, Zod v4, better-auth (Part A). The import tool uses **only
Node built-ins** (`node:fs`, `node:path`, `node:test`) — no CSV/xlsx library, no runtime deps.
**No new runtime deps** in either part.

**Storage**: Cloudflare D1 (SQLite). **No new table.** One **ADD COLUMN** migration (0009):
`user.kind text NOT NULL DEFAULT 'real'`. Seed users are rows in the existing `user` table; a claim
reassigns FKs and deletes rows. The import tool writes JSON artifacts to local disk (dev-only), never
to production D1.

**Testing**: vitest-pool-workers (`test/claim.test.ts`: offer + merge + seed-deletion; forged-id →
`claimed:0`; no-phone → nothing). Vitest + Testing Library (`ClaimBanner.test.tsx`: renders on match,
merges all on confirm, hides on dismiss). `node:test` for the tool (`profile.test.ts`: CSV parsing +
column classification). Import Steps 2–4 tests are **pending** with their implementation.

**Target Platform**: Cloudflare Workers (frontend Static Assets + backend via Service Binding). The
import tool targets a developer's local machine + dev D1 only.

**Project Type**: Web — two-app monorepo + a `tools/` script package.

**Performance Goals**: claim reads/writes are human-scale (a user has a handful of matching seeds);
the merge is a bounded set of `UPDATE`/`DELETE` by `inArray`. No hot-path concern.

**Constraints**: RTL/Hebrew-first, WCAG 2.1 AA (FR-009); i18n-only strings; tokens-only colors;
secrets via env bindings only. **Security-sensitive** (D3): the claim match key is user-supplied, so
the server MUST re-verify on write and discovery MUST hide seed phones (see Security Analysis).

**Scale/Scope**: 1 ADD COLUMN migration; 1 repository + 1 service + 2 routes (Part A); 1 discovery
projection field; shared contracts + 1 FE banner; a dev-only tool with 1 of 4 steps built (Part B).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Layered backend (router→controller→service→repository) | ✅ | `routes/me.ts` → `claimService` → `claimRepository`. (Claim is thin enough that the service delegates directly to the repository; no separate controller — mirrors the profile path in `me.ts`.) |
| Contract-first (shared Zod → DTOs + FE) | ✅ | `packages/shared/src/schemas/claim.ts`: `ClaimableSeedDTO` interface + `claimSeedSchema` (Zod) → `ClaimSeedInput`. |
| Hebrew-first / RTL, WCAG 2.1 AA | ✅ | FR-009: `ClaimBanner` axe-clean, RTL, keyboard; he/en `claim.*` keys. |
| i18n-only strings, tokens-only colors | ✅ | Banner uses `t("claim.*")` + tokens (`bg-primary`, `text-muted`, …). |
| Secrets via env bindings only | ✅ | No new secrets. The import tool holds PII locally and uploads nothing. |
| Structured logging (no Winston), JSDoc, KISS | ✅ | JSDoc on exports; the merge is a plain sequence of Drizzle writes (D1 has no interactive txns — see below). |
| Edge-first, no high-latency round trips | ✅ | Claim is a bounded in-D1 reassignment; no external calls. |
| Data ownership / privacy (contact visibility) | ✅ | D4/FR-007: seed phones withheld in discovery; the claim reuses the FK cascade so a delete removes 100% of a seed's residue. |

**Result**: PASS. The two notable, deliberate items are (1) the **security posture** of an
in-app-confirm claim without OTP — accepted for the beta and documented (D3, Security Analysis
below), a launch gate; and (2) modeling imported people as `user` rows rather than a new table
(reuses FKs; see Approach). No Complexity Tracking entries.

## Approach — Part A: seed-user model + claim/merge

### Seed-user-as-user-row (D1) — why

An imported person's data must be **exactly** the shape a real user's data is (stays, hosted events,
commitments, roles) so that "claiming" is nothing more than reassigning ownership. Modeling seeds as
rows in the existing `user` table (with `kind='seed'` and no `account`) reuses every FK
(`stay.userId`, `event.hostUserId`, `commitment.userId`, `eventRole.userId`) and every read path
(discovery already selects stays by `user`), so:

- Seeds appear in discovery for free (a stay is a stay).
- A claim is a set of `UPDATE ... SET userId = :caller` + a `DELETE` of the seed rows — no
  data migration between tables.
- Deleting a seed **cascades** its phones (and any residue) via the existing `ON DELETE CASCADE`
  on the child tables, so no orphan is left behind.

The cost is that seeds live in the auth-owned `user` table; they are inert because better-auth needs
a matching `account` row to authenticate and a seed has none (synthetic `@seed.local` email). The
alternative — a parallel `pending_person` table — was rejected: it would duplicate the stay/event
read paths and turn a claim into a cross-table migration.

### The claim flow (`claimRepository` + `claimService`)

- **Discover** (`findClaimableSeeds`): read the caller's own `phone_number` E.164 set; if empty →
  `[]`. Join `user` (`kind='seed'`) ⨝ `phone_number` on `e164 IN (caller phones)`; de-dupe one entry
  per seed; attach `count(*)` of stays (`stay.userId`) and events (`event.hostUserId`).
- **Claim** (`claimSeeds`): **re-read** the caller's phones and **re-verify** each submitted id is a
  `kind='seed'` sharing a phone (`selectDistinct` join) → the `verified` subset; empty → no-op
  `{claimed:0}`. Then, in order:
  1. Resolve the caller's existing committed `eventId`s; **delete** the verified seeds' commitments to
     those events (the conflict fix, D5).
  2. `UPDATE commitment / eventRole / stay / event` to `userId = caller` (stays/events also bump
     `updatedAt`) for the verified set.
  3. `DELETE FROM user WHERE id IN (verified)` — cascades away the seeds' phones.
  Return `{ claimed, stays, events }`.

D1 has **no interactive transactions**; the sequence is a series of statements. The re-verification
+ the conflict-delete make each statement idempotent-safe against a partial replay, and the write set
is small and owner-scoped, so the practical risk of a torn merge is low. (A `db.batch` wrapping is a
reasonable future hardening; the shipped code issues them sequentially.)

### Discovery hiding (D4/FR-007)

The discovery projection adds `ownerKind: user.kind` to the potential-stay row. `travelerContact`
computes the phone as `s.ownerKind === "seed" ? null : (per-stay contact ?? sharer's phone)`. So a
seed owner's name surfaces (from `contactName ?? ownerName`) but the phone is unconditionally `null`
until the person claims the seed and becomes a consenting `kind='real'` user. This is the **only**
deviation from ADR-0008, and it is a *tightening* (withholds more), not a loosening.

### Frontend (`ClaimBanner`)

A dismissible `<section>` on the stays dashboard: reads `useClaimableSeeds()`, renders nothing when
there are no matches or after dismiss, sums the stay/event counts for the copy, and on confirm calls
`useClaimSeeds().mutate(all seedUserIds)`. On success it invalidates the claims + stays query keys so
the merged trips appear and the banner clears.

## Approach — Part B: the staged import pipeline (`tools/seed-import/`)

A dev-only Node script package, zero runtime deps, staged so each step writes a reviewable artifact:

```
sheet ──(CSV)──▶ inspect ──▶ raw.json + profile.json        STEP 1 ✅ built
                              │  decide: what is a row?
                              ▼
                          map + Zod validate ──▶ records.json   STEP 2 ⏳ pending
                              ▼
                          quality gates ──▶ accepted/rejected.json  STEP 3 ⏳ pending
                              ▼
                          create seeds (dev D1, --dry-run)      STEP 4 ⏳ pending
```

- **Step 1 (built)**: `csv.ts` (RFC-4180-ish parser: quotes, escaped `""`, embedded commas/newlines,
  CRLF, BOM), `profile.ts` (`classifyColumn` guesses a column's kind from header hints [he+en] +
  value fractions — dates checked before phones so an ISO date isn't mistaken for a phone), and
  `inspect.ts` (CLI: CSV → `raw.json` + `profile.json`, prints a summary; only `main()`s when run
  directly so tests can import it).
- **Steps 2–4 (pending, D8)**: blocked on the row-semantics decision that `profile.json` exists to
  inform. Step 2 = a seed Zod contract + column mapping; Step 3 = E.164 phone normalization + location
  resolution via the app's `geoService` (D9); Step 4 = create into dev D1 with `--dry-run`.

**Why dev-only + local + staged (D7)**: the sheet is real PII (names/phones/locations). Keeping it on
the operator's machine (no upload) minimizes exposure, and staging + per-step artifacts make the data
inspectable and gate-able before a single row is written.

## Security Analysis (D3 — the load-bearing decision)

**Threat**: the claim match key is a phone number the caller **typed into their own profile**. There
is no proof they own it. So an attacker could type a victim's phone number, and — if seeds carrying
that number exist — be **offered the victim's imported trips/minyanim** and, on confirm, take
ownership. This is an **identity-takeover / data-disclosure** vector.

**Mitigations shipped (beta)**:

1. **Server re-verification on write (FR-004)** — `claimSeeds` never trusts the submitted ids; it
   re-joins `user(kind='seed')` ⨝ `phone_number` against the caller's *current* phones and merges
   only the verified subset. A forged id claims nothing. (Tested: `claim.test.ts` "forged POST …
   claims nothing".)
2. **In-app confirmation (FR-005)** — the merge is deliberate and user-initiated, never automatic.
3. **Discovery phone-hiding for seeds (FR-007)** — even before any claim, a seed's phone is never
   exposed in discovery, so the import does not leak the imported people's numbers.

**Residual risk (accepted for private beta)**: the above prove the *id* is a seed sharing the *typed*
phone — they do **not** prove the caller **owns** that phone. In a trusted, invite-only beta with a
curated seed list, the owner accepts this. The robust fix — an **SMS-OTP-verified** phone as the gate
— is deferred (no provider in stack) and is a **launch gate**. Admin-approved claims were considered
and rejected as too heavy and not itself proof of ownership.

## Project Structure

### Documentation (this feature)

```text
specs/009-seed-import-claim/
├── plan.md            # This file
├── spec.md            # Overview, scenarios, FR/SC, edge cases (Part A + Part B status)
├── data-model.md      # user.kind, reassignment set, migration 0009, import artifacts
├── quickstart.md      # Part A claim validation + Part B Step-1 validation
├── contracts/
│   └── api.md         # GET/POST /api/me/claims (ClaimableSeedDTO, claimSeedSchema, result)
├── tasks.md           # Part A + Step 1 [x]; import Steps 2–4 [ ] pending
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/shared/src/
└── schemas/claim.ts          # ClaimableSeedDTO (interface), claimSeedSchema (Zod) → ClaimSeedInput

apps/backend/src/
├── db/schema.ts              # user.kind text NOT NULL DEFAULT 'real' (line ~28)
├── ../migrations/0009_abnormal_goblin_queen.sql  # ALTER TABLE user ADD kind
├── repositories/claimRepository.ts   # findClaimableSeeds, claimSeeds (re-verify + conflict-safe merge + delete)
├── services/claimService.ts          # getClaimableSeeds → DTOs; claimSeedUsers → ClaimResult
├── routes/me.ts (extend)             # GET/POST /api/me/claims (requireUserId; claimSeedSchema)
├── repositories/discoveryRepository.ts (extend) # ownerKind: user.kind in the potential-stay projection
└── services/discoveryService.ts (extend)        # travelerContact: seed owner → phone null

apps/frontend/src/
├── lib/claims.ts             # useClaimableSeeds / useClaimSeeds (invalidate CLAIMS_KEY + STAYS_KEY)
├── features/stays/ClaimBanner.tsx    # dismissible dashboard prompt; merges all matches on confirm
├── features/stays/StaysDashboard.tsx (extend) # renders <ClaimBanner />
└── i18n/locales/{he,en}.ts   # claim.{title,body,confirm,dismiss}

tools/seed-import/
├── README.md                 # the staged pipeline + status checklist
└── src/
    ├── csv.ts                # RFC-4180-ish parser (STEP 1)
    ├── profile.ts            # column profiler / classifyColumn (STEP 1)
    ├── inspect.ts            # CLI: CSV → raw.json + profile.json (STEP 1)
    ├── profile.test.ts       # node:test — parser + classifier
    ├── (map.ts)              # STEP 2 — pending
    ├── (gate.ts)             # STEP 3 — pending
    └── (create.ts)           # STEP 4 — pending
```

**Structure Decision**: Web two-app monorepo (unchanged) + a dev-only `tools/seed-import/` package.
Part A extends the profile route path (`/api/me`) and the discovery projection; all contracts in
`packages/shared`.

## Complexity Tracking

> No Constitution Check violations. The security posture (in-app confirm without OTP) is a documented,
> owner-accepted beta decision with a launch-gate follow-up (D3) — not a constitution deviation. This
> section is otherwise intentionally empty.
