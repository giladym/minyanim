import { SELF } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import type { ZmanimResponse } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const stayBody = (over: Record<string, unknown>) => ({
  city: "קרקוב",
  country: "פולין",
  lat: 50.0647,
  lng: 19.945,
  arrivalDate: Date.UTC(2026, 6, 3), // Fri 3 Jul 2026
  departureDate: Date.UTC(2026, 6, 5), // Sun 5 Jul (covers Sat 4 Jul)
  numMen: 2,
  ...over,
});

const create = (cookie: string, over: Record<string, unknown> = {}) =>
  SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(stayBody(over)) }).then((r) => r.json()) as Promise<{ id: string }>;

const zmanim = (cookie: string, id: string) =>
  SELF.fetch(`https://x/api/stays/${id}/zmanim`, { headers: { ...J, cookie } });

afterEach(() => vi.useRealTimers());

describe("GET /api/stays/:id/zmanim (005 US1)", () => {
  it("returns per-Shabbat zmanim for a coord-bearing Stay, cache private", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z")); // before the stay
    const cookie = await signIn();
    const s = await create(cookie);
    const res = await zmanim(cookie, s.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("private");
    const body = (await res.json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(true);
    expect(body.hasCoordinates).toBe(true);
    expect(body.shabbatot).toHaveLength(1);
    expect(body.shabbatot[0]!.shabbatDate).toBe("2026-07-04");
    expect(body.shabbatot[0]!.candleLighting).toMatch(/^\d{2}:\d{2}$/);
    expect(body.shabbatot[0]!.havdalahGeonim).toMatch(/^\d{2}:\d{2}$/);
  });

  it("404s for another user's Stay (no leak)", async () => {
    const owner = await signIn();
    const s = await create(owner);
    const attacker = await signIn();
    expect((await zmanim(attacker, s.id)).status).toBe(404);
  });

  it("coordless Stay → hasCoordinates:false, empty (the add-location CTA case)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z")); // pin before the stay so it stays active
    const cookie = await signIn();
    const s = await create(cookie, { lat: null, lng: null });
    const body = (await (await zmanim(cookie, s.id)).json()) as ZmanimResponse;
    expect(body.hasCoordinates).toBe(false);
    expect(body.shabbatot).toHaveLength(0);
    expect(body.coversShabbat).toBe(true);
  });

  it("Stay with no Shabbat in range → coversShabbat:false, empty", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    const cookie = await signIn();
    // Mon 6 Jul → Wed 8 Jul 2026 (no Sat).
    const s = await create(cookie, { arrivalDate: Date.UTC(2026, 6, 6), departureDate: Date.UTC(2026, 6, 8) });
    const body = (await (await zmanim(cookie, s.id)).json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(false);
    expect(body.shabbatot).toHaveLength(0);
  });

  it("past Stay → empty (active-only, D9)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    const cookie = await signIn();
    const s = await create(cookie); // 3–5 Jul
    // Advance past the stay's departure but within the 30-day session window.
    vi.setSystemTime(new Date("2026-07-12T12:00:00Z"));
    const body = (await (await zmanim(cookie, s.id)).json()) as ZmanimResponse;
    expect(body.shabbatot).toHaveLength(0);
  });
});
