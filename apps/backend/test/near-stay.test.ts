import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };
const ZAKOPANE = { lat: 49.3, lng: 19.95 };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function hostAt(cookie: string, lat: number, lng: number): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat, lng, addressPrivate: null, addressNotes: null,
    eventDate: Date.UTC(2030, 0, 5), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

async function createStay(cookie: string, lat: number, lng: number): Promise<string> {
  const body = {
    city: "זקופנה", country: "פולין", lat, lng,
    arrivalDate: Date.UTC(2030, 0, 1), departureDate: Date.UTC(2030, 0, 10), numMen: 4,
    bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
  };
  return (await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

describe("US7 — Minyanim near my stay", () => {
  it("returns potential + nearby minyanim for an owned stay (address-free)", async () => {
    await hostAt(await signIn(), ZAKOPANE.lat, ZAKOPANE.lng); // a hosted minyan in the area
    const e = await signIn();
    const stayId = await createStay(e, ZAKOPANE.lat, ZAKOPANE.lng);

    const res = await SELF.fetch(`https://x/api/discovery/near-stay/${stayId}`, { headers: { cookie: e } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.minyanim.length).toBeGreaterThanOrEqual(1);
    expect(body.minyanim[0]).not.toHaveProperty("addressPrivate");
    expect(body.potential.length).toBeGreaterThanOrEqual(1); // the stay's own men bucket
  });

  it("404s for a stay the caller does not own", async () => {
    const owner = await signIn();
    const stayId = await createStay(owner, ZAKOPANE.lat, ZAKOPANE.lng);
    const other = await signIn();
    expect((await SELF.fetch(`https://x/api/discovery/near-stay/${stayId}`, { headers: { cookie: other } })).status).toBe(404);
  });

  it("near-stay-counts returns a batched count per stay; empty area still yields potential", async () => {
    const e = await signIn();
    const farStay = await createStay(e, 51.5074, -0.1278); // London — no minyan hosted there
    const counts = (await (await SELF.fetch("https://x/api/discovery/near-stay-counts", { headers: { cookie: e } })).json()).counts;
    expect(counts[farStay]).toBe(0);

    const near = await (await SELF.fetch(`https://x/api/discovery/near-stay/${farStay}`, { headers: { cookie: e } })).json();
    expect(near.minyanim).toHaveLength(0);
    expect(near.potential.length).toBeGreaterThanOrEqual(1); // prompt-to-host, not a dead end
  });
});
