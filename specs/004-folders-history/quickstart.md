# Quickstart & Validation — Folders & History

End-to-end scenarios proving Feature 004. References [contracts/api.md](./contracts/api.md),
[data-model.md](./data-model.md), and SC-001…SC-007.

## Prerequisites
- 001+002+003 applied; the 004 migration applied (`folder` table + `stay` rebuilt with the
  `folder_id` FK `ON DELETE SET NULL` + new indexes). Pre-launch: drop/recreate OK.
- A few seeded Stays: some upcoming, one past (departed), one cancelled.

## Scenario 1 — Folders & assignment (US1, SC-001/003/004)
1. `POST /api/folders {name:"Europe 2026"}` → `201`. Duplicate name (any case) → `400
   folder.name_taken`.
2. `PATCH /api/stays/:id {folderId:"fld_…"}` for two upcoming Stays → they group under the folder;
   assigning to a folder you don't own → `404`.
3. `GET /api/stays?scope=active&folder=fld_…` → exactly that folder's active Stays; `folder=unfiled`
   → exactly the null-folder active Stays (SC-003).
4. `PATCH /api/folders/:id {name:"Summer Europe"}` → Stays intact under the new name.
5. `DELETE /api/folders/:id {confirm:true}` (non-empty) → `200`; its Stays survive with
   `folder_id IS NULL` (Unfiled) — none deleted (SC-004/SC-001). Without `confirm` → `400`.

## Scenario 2 — History & taxonomy (US2, SC-002/005)
1. `GET /api/stays?scope=active` → only upcoming/in-progress Stays (the past + cancelled ones are
   absent — D1).
2. `GET /api/stays?scope=history` → the past Stay tagged `historyTag:"attended"` and the cancelled
   one tagged `"cancelled"`; a Stay spanning today is **not** present (D14).
3. Advance the clock (`vi.setSystemTime`) past an upcoming Stay's departure → on the next read it is
   in `history` (attended) and gone from `active` — no job (SC-002).
4. Seed > page-size past Stays → `scope=history&cursor=` paginates newest-first; pages are complete
   and non-duplicated across the boundary (SC-005); UI groups by year + infinite-scroll.

## Scenario 3 — Duplicate & permanent-delete (US3, SC-006)
1. "Duplicate" a Stay → the Add form opens pre-filled (location/men/prayer-needs/…) with cleared
   dates; set future dates, save → a new active Stay (D9).
2. `DELETE /api/stays/:cancelledId/permanent {confirm:true}` → `200`, row gone; any linked
   `commitment.stay_id` set null. `DELETE …/permanent` on a non-cancelled Stay → `400
   stay.not_cancelled` (SC-006). Without `confirm` → `400`.

## Scenario 4 — Account deletion cascade
- Create user + folders + foldered Stays → `deleteUser` → zero orphan `folder` rows (Stays cascade
  via their own user FK). Extends the 002/003 cascade-orphan test.

## Automated checks (CI)
- **Backend** (vitest-pool-workers): folder CRUD + per-user name uniqueness (ci) + ownership;
  scope truth table (`vi.setSystemTime`); folder-delete → SET NULL reassignment; History keyset
  pagination correctness; permanent-delete guard; **cascade-orphan** incl. `folder`.
- **Frontend** (Vitest + TL): folder create/rename/delete-confirm, browse-by-folder grouping (incl.
  Unfiled), History infinite-scroll, move-to-folder, duplicate prefill.
- **e2e** (Playwright + axe): folder management + History meet WCAG 2.1 AA, RTL, keyboard (SC-007).
