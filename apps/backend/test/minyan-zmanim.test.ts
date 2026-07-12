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

  // 014 T046: a hosting gathering with occasion=shabbat also exposes candle-lighting — a Friday-eve
  // dinner maps to the NEXT day's Shabbat; a Saturday lunch to that Shabbat. Festivals are out of v1.
  const hostingBody = (over: Record<string, unknown> = {}) => ({
    type: "gathering",
    category: "hosting",
    city: "וינה",
    country: "אוסטריה",
    lat: 48.2082,
    lng: 16.3738,
    occasion: "shabbat",
    rsvpMode: "approval",
    capacity: 6,
    hostNumMen: 1,
    gathering: { mealType: "shabbat_dinner", kashrut: "glatt", dietary: [], alcohol: false },
    ...over,
  });
  const hostGathering = (cookie: string, over = {}) =>
    SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(hostingBody(over)) }).then((r) => r.json()) as Promise<{ id: string }>;

  it("a Friday-eve Shabbat DINNER (hosting) → candle-lighting for the next day's Shabbat", async () => {
    const cookie = await signIn();
    const g = await hostGathering(cookie, { eventDate: Date.UTC(2030, 0, 4) }); // Fri 4 Jan 2030
    const body = (await (await SELF.fetch(`https://x/api/events/${g.id}/zmanim`)).json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(true);
    expect(body.shabbatot).toHaveLength(1);
    expect(body.shabbatot[0]!.shabbatDate).toBe("2030-01-05"); // the Saturday
    expect(body.shabbatot[0]!.candleLighting).toMatch(/^\d{2}:\d{2}$/);
  });

  it("a Saturday Shabbat LUNCH (hosting) → candle-lighting for that Shabbat", async () => {
    const cookie = await signIn();
    const g = await hostGathering(cookie, { eventDate: Date.UTC(2030, 0, 5), gathering: { mealType: "shabbat_lunch", kashrut: "glatt", dietary: [], alcohol: false } }); // Sat
    const body = (await (await SELF.fetch(`https://x/api/events/${g.id}/zmanim`)).json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(true);
    expect(body.shabbatot[0]!.shabbatDate).toBe("2030-01-05");
  });

  it("a social gathering (no Shabbat occasion) → coversShabbat:false", async () => {
    const cookie = await signIn();
    const g = await hostGathering(cookie, { category: "social", occasion: "none", rsvpMode: "open", eventDate: Date.UTC(2030, 0, 4), gathering: { subcategory: "kiddush" } });
    const body = (await (await SELF.fetch(`https://x/api/events/${g.id}/zmanim`)).json()) as ZmanimResponse;
    expect(body.coversShabbat).toBe(false);
  });
});
