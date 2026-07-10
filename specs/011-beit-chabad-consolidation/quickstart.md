# Quickstart — Beit Chabad → Places Consolidation

Validates the consolidation end-to-end. Assumes the monorepo dev setup (see repo root README) and that
migrations 0001–0011 are applied locally.

## Prerequisites

```bash
pnpm install
pnpm --filter @minyanim/backend db:migrate:local   # includes the new 0012 after implementation
```

## Scenario 1 — Migration reconciles then drops the legacy table (US2, SC-001/002/003)

1. Before 0012, confirm the Chabad layer already holds the copied pins (010):
   ```bash
   # count of legacy pins vs. copied places should match
   wrangler d1 execute <db> --local --command \
     "SELECT (SELECT count(*) FROM beit_chabad_pin) AS pins,
             (SELECT count(*) FROM place WHERE layer_id='layer_chabad_houses') AS places;"
   ```
2. Apply 0012 (`db:migrate:local`).
3. **Expected**: `beit_chabad_pin` no longer exists; every prior pin is a place in `layer_chabad_houses`
   exactly once:
   ```bash
   wrangler d1 execute <db> --local --command \
     "SELECT name FROM sqlite_master WHERE type='table' AND name='beit_chabad_pin';"   # → 0 rows
   ```

## Scenario 2 — Re-running the seed/import is idempotent (SC-004)

1. Run the retargeted seed twice:
   ```bash
   pnpm --filter @minyanim/backend db:seed:beit-chabad   # or the documented seed command, run x2
   ```
2. **Expected**: the second run inserts 0 new rows (blocked by `place_source_uidx` /
   `ON CONFLICT DO NOTHING`); place count unchanged.

## Scenario 3 — Discovery map still shows Chabad houses (US1, SC-005)

1. `pnpm dev`; sign in; open the discovery map over an area with seeded Chabad houses.
2. **Expected**: each Chabad house renders as a marker with a popup showing name / address / phone; the
   attribution note still shows; the set matches what showed before 011 for the same data.
3. Toggle the Chabad layer off → markers hide; on → markers return.
4. Open a viewport with no places → no place markers, no error.

## Scenario 4 — Admin edit flows to discovery (US3, SC-006)

1. As an admin (`/admin/places`), edit a Chabad-house place's name; save.
2. Reopen the discovery map over that location.
3. **Expected**: the edited name appears in the marker popup (single source of truth — no separate legacy
   copy to diverge).

## Scenario 5 — No dead code / contract references (SC-003)

```bash
# No source (non-migration) reference to the legacy model remains:
grep -rn "beit_chabad\|beitChabad\|BeitChabadPinDTO" apps/ packages/ --include=*.ts --include=*.tsx \
  | grep -v "migrations/"        # → only migration history + this spec
```

## Automated gates

```bash
pnpm --filter @minyanim/shared typecheck
pnpm --filter @minyanim/backend typecheck && pnpm --filter @minyanim/backend test   # discovery + migration reconcile tests
pnpm --filter frontend typecheck && pnpm --filter frontend test                     # DiscoveryPage + i18n parity
pnpm --filter frontend test:e2e -- discovery                                        # Playwright + axe (WCAG AA), SC-007
```

**Expected**: all green; the discovery e2e passes axe (WCAG 2.1 AA) with the layer toggles keyboard-
operable and token-colored; he/en parity holds.
