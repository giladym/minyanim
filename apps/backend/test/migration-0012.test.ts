import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

/**
 * 011 consolidation — post-migration DB state (0012). The test DB has all migrations applied, so this
 * asserts the end-state: `beit_chabad_pin` is dropped, the "Chabad houses" layer (from 0010) exists,
 * and seeding places by provenance is idempotent (the `place_source_uidx` guard behind the seed's
 * ON CONFLICT DO NOTHING).
 */
describe("migration 0012 — beit_chabad_pin retired, place is SoT (011)", () => {
  it("dropped the legacy beit_chabad_pin table (SC-003)", async () => {
    const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='beit_chabad_pin'").first();
    expect(row).toBeNull();
  });

  it("kept the admin-managed 'Chabad houses' layer", async () => {
    const row = (await env.DB.prepare("SELECT id, name FROM layer WHERE id='layer_chabad_houses'").first()) as { id: string; name: string } | null;
    expect(row?.id).toBe("layer_chabad_houses");
  });

  it("is idempotent on (source, source_id) — a re-seed inserts nothing new (SC-004)", async () => {
    const insert = () =>
      env.DB.prepare(
        "INSERT INTO place (id, layer_id, name, lat, lng, source, source_id, license, created_at, updated_at) " +
          "VALUES (?, 'layer_chabad_houses', ?, ?, ?, 'beit_chabad_seed', ?, 'internal', 1750000000, 1750000000) " +
          "ON CONFLICT(source, source_id) DO NOTHING",
      );
    await insert().bind("place_bcp_test", "Chabad Test", 49.3, 19.95, "bcp_test").run();
    await insert().bind("place_bcp_test_2", "Chabad Test (dupe attempt)", 49.3, 19.95, "bcp_test").run(); // same source_id

    const rows = (await env.DB.prepare("SELECT count(*) AS n FROM place WHERE source='beit_chabad_seed' AND source_id='bcp_test'").first()) as { n: number };
    expect(rows.n).toBe(1); // the second insert was a no-op
  });
});
