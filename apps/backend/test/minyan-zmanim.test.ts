import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { ZmanimResponse } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "Host", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const hostBody = (over: Record<string, unknown> = {}) => ({
  type: "minyan",
  city: "וינה",
  country: "אוסטריה",
  lat: 48.2082,
  lng: 16.3738,
  eventDate: Date.UTC(2030, 0, 5), // Sat 5 Jan 2030
  minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }] },
  hostNumMen: 2,
  ...over,
});

const host = (cookie: string, over = {}) =>
  SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(hostBody(over)) }).then((r) => r.json()) as Promise<{ id: string }>;

describe("GET /api/events/:id/zmanim (005 US2 — public)", () => {
  it("returns one entry for a Shabbat-dated Minyan, readable WITHOUT auth, cache public", async () => {
    const cookie = await signIn();
    const m = await host(cookie);
    // No cookie → public read.
    const res = await SELF.fetch(`https://x/api/events/${m.id}/zmanim`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    const body = (await res.json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(true);
    expect(body.shabbatot).toHaveLength(1);
    expect(body.shabbatot[0]!.shabbatDate).toBe("2030-01-05");
    expect(body.shabbatot[0]!.candleLighting).toMatch(/^\d{2}:\d{2}$/);
  });

  it("a weekday Minyan → coversShabbat:false, empty", async () => {
    const cookie = await signIn();
    const m = await host(cookie, { eventDate: Date.UTC(2030, 0, 7) }); // Mon
    const body = (await (await SELF.fetch(`https://x/api/events/${m.id}/zmanim`)).json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(false);
    expect(body.shabbatot).toHaveLength(0);
  });

  it("404s for a nonexistent event", async () => {
    expect((await SELF.fetch("https://x/api/events/evt_nope/zmanim")).status).toBe(404);
  });
});
