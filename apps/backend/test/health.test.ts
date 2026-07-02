import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("GET /api/health", () => {
  it("returns ok (D1 connectivity check)", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/auth/get-session (unauthenticated)", () => {
  it("returns 200", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/get-session");
    expect(res.status).toBe(200);
  });
});
