import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("GET /api/config (public client config)", () => {
  it("returns the maptilerTileKey field, no auth required, cache public", async () => {
    const res = await SELF.fetch("https://x/api/config");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    const body = (await res.json()) as { maptilerTileKey: string };
    expect(typeof body.maptilerTileKey).toBe("string"); // "" when unconfigured in the test env
  });
});
