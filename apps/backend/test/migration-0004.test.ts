import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

/**
 * 004 migration integrity (R3). The 0004 rebuild drops + recreates `stay` and `commitment`; this
 * guards that the hand-authored migration preserved the 003 `commitment.stay_id` FK (with its
 * SET NULL action — D8 permanent-delete relies on it) and created the new folder/stay indexes.
 * A regression here (e.g. a CASCADE recreate, or a stray PRAGMA breaking the migration) is silent
 * otherwise.
 */
describe("migration 0004 — schema integrity after the stay/commitment rebuild", () => {
  it("keeps attendance.stay_id → stay FK with ON DELETE SET NULL", async () => {
    // 014 renamed `commitment` → `attendance` (migration 0014); the stay_id FK + SET NULL survives.
    const fks = (await env.DB.prepare("PRAGMA foreign_key_list(attendance)").all()).results as Array<{
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>;
    const stayFk = fks.find((f) => f.from === "stay_id");
    expect(stayFk).toBeDefined();
    expect(stayFk?.table).toBe("stay");
    expect(stayFk?.to).toBe("id");
    expect(stayFk?.on_delete).toBe("SET NULL");
  });

  it("keeps stay.folder_id → folder FK with ON DELETE SET NULL", async () => {
    const fks = (await env.DB.prepare("PRAGMA foreign_key_list(stay)").all()).results as Array<{
      table: string;
      from: string;
      on_delete: string;
    }>;
    const folderFk = fks.find((f) => f.from === "folder_id");
    expect(folderFk?.table).toBe("folder");
    expect(folderFk?.on_delete).toBe("SET NULL");
  });

  it("creates the folder + stay indexes (incl. the NOCASE name unique index and history keyset)", async () => {
    const rows = (
      await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('stay','folder')",
      ).all()
    ).results as Array<{ name: string }>;
    const names = new Set(rows.map((r) => r.name));
    for (const idx of [
      "folder_user_idx",
      "folder_user_name_uidx",
      "stay_user_folder_idx",
      "stay_user_departure_idx",
    ]) {
      expect(names.has(idx)).toBe(true);
    }
  });
});
