# Quickstart & Validation — Seed Import + Seed-User Claim

End-to-end scenarios proving Feature 009. References [contracts/api.md](./contracts/api.md),
[data-model.md](./data-model.md), and SC-001…SC-008.

## Prerequisites

- 001–008 applied; the 009 migration applied (`user.kind` column, default `real`).
- For Part A: the ability to insert a seed user directly in dev D1 (or via the import tool once built).
- For Part B: Node ≥ 22.6; a CSV export of the source sheet.

---

## Part A — Seed-user claim / merge

### Scenario 1 — Offer + confirm + merge (US2, SC-002/003)

1. Insert a **seed** user: a `user` row with `kind='seed'`, a synthetic `@seed.local` email, **no
   `account`**, one `phone_number` (E.164, e.g. `+972501112222`), and one `stay` (e.g. Paris).
2. Sign in a **real** user; `POST /api/me/phones { e164: "+972501112222" }` → `201`.
3. `GET /api/me/claims` → `200 { seeds: [ { seedUserId, name, phone, stays: 1, events: 0 } ] }` — the
   seed is offered with its trip count (SC-002).
4. `POST /api/me/claims { seedUserIds: [seedId] }` → `200 { claimed: 1, stays: 1, events: 0 }`.
5. `GET /api/stays` for the real user now includes the Paris stay (it moved); `GET /api/me/claims` →
   `{ seeds: [] }` and the seed `user` row is gone (SC-003).

### Scenario 2 — Forged / non-matching id claims nothing (US2, SC-004 — security)

1. Sign in a real user; add a phone `+972503334444`.
2. Insert a seed with a **different** phone `+972509998888` + a stay.
3. `GET /api/me/claims` → `{ seeds: [] }` (not offered).
4. `POST /api/me/claims { seedUserIds: [thatSeedId] }` (forging the id) → `200 { claimed: 0 }` — the
   server re-verifies the phone match and merges nothing (SC-004).

### Scenario 3 — No phone → no offers (US2, SC-002)

1. Sign in a real user; add **no** phone.
2. Insert a seed with a phone + stay.
3. `GET /api/me/claims` → `{ seeds: [] }` — no match key, nothing offered.

### Scenario 4 — Seed privacy in discovery (US3, SC-005)

1. With a seed owning a stay in a discovery area, read the discovery travelers list as a signed-in
   viewer → the seed's **name** appears, **phone is `null`** (regardless of any `share_phone`).
2. Claim the seed as a real, phone-sharing user (Scenario 1), then re-read discovery → the (now
   real-owned) stay exposes the phone per ADR-0008 (SC-005).

### Scenario 5 — Commitment conflict on merge (edge, SC-006)

1. Both the caller and a seed hold a `commitment` on the **same** event.
2. Claim the seed → the merge drops the seed's duplicate commitment first, then reassigns the rest;
   no `(event_id, user_id)` unique-index violation, claim succeeds (SC-006).

### Scenario 6 — Dashboard banner (US2, SC-008)

1. As a user with a phone-matched seed, open the stays dashboard → the claim banner shows the
   summarized trip/minyan counts.
2. "Confirm" merges **all** current matches (the banner passes every `seedUserId`); the trips appear
   and the banner clears. "Dismiss" hides it for the session.

---

## Part B — Import pipeline (Step 1 only; Steps 2–4 pending)

### Scenario 7 — Inspect / convert (US1, SC-007 — Step 1, done)

1. Export the source sheet to CSV.
2. Run: `node tools/seed-import/src/inspect.ts <path/to/export.csv> --out <outdir>`.
3. Confirm `raw.json` (every row keyed by header) and `profile.json` (per-column fill rate, distinct
   count, samples, guessed kind) are written locally and a compact summary printed — with **nothing
   uploaded** (SC-007).
4. Review `profile.json` to make the **row-semantics decision** (what does one row represent?) that
   unblocks Steps 2–4 (D8).

### Scenario 8 — Steps 2–4 (pending — do NOT expect these yet)

Steps 2 (map + Zod validate → `records.json`), 3 (quality gates → `accepted.json`/`rejected.json`),
and 4 (create seeds in dev D1, `--dry-run`) are **not yet built** (D8). This scenario is a
placeholder to be filled when the row-semantics decision is made.

---

## Automated checks (CI)

- **Backend** (vitest-pool-workers): `test/claim.test.ts` — offer + merge + seed deletion;
  forged-id → `claimed:0`; no-phone → empty offers.
- **Frontend** (Vitest + TL): `ClaimBanner.test.tsx` — renders on match, merges all matches on
  confirm, hides on dismiss.
- **Tool** (`node:test`): `tools/seed-import/src/profile.test.ts` — CSV parsing (quotes / escaped
  quotes / newlines / CRLF / BOM) + column classification. Run: `node --test
  tools/seed-import/src/*.test.ts`.
- **e2e** (Playwright + axe): the claim banner meets WCAG 2.1 AA, RTL, keyboard (SC-008) — covered by
  the stays-dashboard e2e once a matched seed fixture exists.
