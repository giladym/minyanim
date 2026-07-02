# Quickstart & Validation — Discovery & Quorum Formation

End-to-end validation scenarios proving Feature 003 works. References
[contracts/api.md](./contracts/api.md), [data-model.md](./data-model.md), and the spec's
SC-001…SC-007. Backend uses `GEO_MODE=mock`; email send is injected/mocked.

## Prerequisites

- 001 + 002 applied (auth, `user`/`stay` tables, geo proxy, MapLibre map, Resend integration).
- 003 migration applied (`event`, `minyan`, `commitment`, `event_role`, `notification`,
  `notification_event_log`, `flag`, `beit_chabad_pin`; + `stay(lat,lng)` index).
- A few seeded Stays with coordinates overlapping a Shabbat, plus a seeded `beit_chabad_pin`.

## Scenario 1 — Discover potential & host (US1/US2, SC-001)

1. As a user with **no Stay of their own**, `GET /api/discovery?lat&lng&radiusKm=15&from&to`.
   **Expected**: per-Shabbat `potential` (summed men from seeded Stays in the bbox, tz-bucketed),
   any hosted `minyanim` (address-free `PublicMinyanDTO`), Beit Chabad pins, attribution; < 2 s.
2. `POST /api/events` (Shabbat Shacharit, Ashkenaz, `seferTorah:true`, `hostNumMen:1`).
   **Expected**: `201 OwnerMinyanDTO`; host auto-committed (count = 1); appears in discovery for
   that area/date.
3. Host a **second** event at the same point (different time/tefilla). **Expected**: both coexist
   (FR-003).

## Scenario 2 — Commit, readiness, downward recompute (US3, SC-002/SC-004)

1. Commit users until `committedMen` reaches 10 (`POST …/commit`). **Expected**: status →
   `quorum-reached`; for the Shabbat-Shacharit event with a Torah, **not yet `ready`** (no Ba'al
   Korei).
2. A committed user `POST …/roles/baal_korei`. **Expected**: status → `ready` (10 + Torah + Korei,
   SC-004 truth table).
3. A poll (`GET /api/events/{id}` ~5 s) reflects the new count/status (SC-002).
4. A user `DELETE …/commit` dropping below 10. **Expected**: status reverts to `forming`; a
   `quorum_lost` notification fires once (R9).
5. Double-commit + concurrent role-claim. **Expected**: `409 commitment.duplicate` /
   `409 role.already_claimed` — exactly one winner (R5/R6).

## Scenario 3 — Privacy reveal (FR-011, SC-005)

1. As a **non-committed** user, `GET /api/events/{id}`. **Expected**: `PublicMinyanDTO` — no
   `addressPrivate`, no contact, no participant contacts (structurally absent).
2. Commit, then re-fetch. **Expected**: `ParticipantMinyanDTO` — address + host contact +
   co-participant names now present.
3. Withdraw, re-fetch. **Expected**: back to `PublicMinyanDTO` (address hidden again).
4. Build the WhatsApp share text. **Expected**: contains public location/date/tefilla/count/join
   link; **never** the specific address.

## Scenario 4 — Notifications (US5, SC-003)

1. Cross quorum. **Expected**: host + all committed participants get an in-app `notification` row
   and a (mocked) Resend email in their language, within 1 min; oscillating around 10 does **not**
   re-fire (idempotency log, R8).
2. Host cancels (`POST …/cancel {confirm:true}`). **Expected**: participants get `cancelled`;
   event leaves active discovery; commitments/roles voided.
3. `GET /api/notifications?unreadOnly=true` → inbox lists them; mark-read works.

## Scenario 5 — Stay reconciliation & near-stay entry (US7, FR-014/FR-019)

1. Commit with `stayId` linked, then cancel that Stay in 002 such that it no longer covers the
   event date. **Expected**: the commitment is auto-withdrawn + the user notified; counts recompute
   (D12). A commitment with no `stayId` is untouched.
2. `GET /api/discovery/near-stay/{stayId}`. **Expected**: potential + nearby Minyanim for that
   Stay's location/dates; empty `minyanim` still returns `potential` (prompt-to-host).

## Scenario 6 — Join deep-link, auth-agnostic (FR-012, R11)

1. Open `/minyan/:id` **unauthenticated**. **Expected**: public projection + sign-in CTA, no
   address.
2. Sign in via **email/password** (not only Google). **Expected**: redirect back to `/minyan/:id`
   ready to commit (D13).

## Automated checks (CI)

- **Backend** (vitest-pool-workers): discovery bbox + Saturday-bucketing (`shabbatSaturdaysInRange`,
  `vi.setSystemTime`, date-line coords) + coordless-Stay union; readiness **24-row decision-table**
  (SC-004); concurrency — fire two `commit`/role-claim calls via `Promise.all` against the same
  Miniflare D1 and assert the unique-constraint outcome (second → `commitment.duplicate` /
  `role.already_claimed`, row-count stays 1) — testing the constraint, not literal race timing;
  notification idempotency (oscillate around 10 → one `quorum_reached`); email asserted via an
  injected/mocked `EmailSender` capturing `{to, lang, kind}` (recipient set + language + call-count);
  **cascade-orphan** across all new tables; **privacy** `PublicMinyanDTO` non-exposure (SC-005).
- **Frontend** (Vitest + TL): discovery list/filters, host form validation, commit/withdraw,
  notifications inbox, "near this stay" entry point.
- **e2e** (Playwright + axe): discover → host → commit → ready → notify; map+list parity; WCAG 2.1
  AA + RTL on map/list/host/commit (SC-007); `GEO_MODE=mock`.
