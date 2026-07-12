import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T035 (014 US2) — discovery surfaces ALL event kinds (minyan + gatherings) with kind/occasion
// filters, excludes non-public visibility, keeps nusach/seferTorah as minyan-only sub-filters, and
// never leaks private fields (SC-003).

const J = { "content-type": "application/json" };
const LON = { lat: 51.5074, lng: -0.1278 };
const EVENT_DATE = Date.UTC(2030, 0, 5); // future ⇒ not "completed"
const FROM = Date.UTC(2030, 0, 1);
const TO = Date.UTC(2030, 0, 31);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function post(cookie: string, body: unknown): Promise<string> {
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()).id;
}

async function hostMinyan(cookie: string, nusach: string): Promise<string> {
  return post(cookie, {
    type: "minyan", city: "London", country: "UK", lat: LON.lat, lng: LON.lng, addressPrivate: "12 Secret St",
    addressNotes: "Floor 2", eventDate: EVENT_DATE,
    minyan: { nusach, seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] }, hostNumMen: 2,
  });
}

interface GatheringOpts { category: "hosting" | "social"; occasion?: string; visibility?: string }
async function hostGathering(cookie: string, opts: GatheringOpts): Promise<string> {
  return post(cookie, {
    type: "gathering", category: opts.category, title: "מפגש", city: "London", country: "UK",
    lat: LON.lat, lng: LON.lng, addressPrivate: "Secret St 5", addressNotes: "Ring twice",
    eventDate: EVENT_DATE, occasion: opts.occasion, visibility: opts.visibility ?? "public", capacity: 8,
    gathering: opts.category === "social" ? { subcategory: "kiddush" } : { mealType: "shabbat_dinner", kashrut: "glatt" },
    hostNumMen: 1,
  });
}

async function discover(cookie: string, extra = ""): Promise<{ events: { id: string; type: string; category: string | null }[] }> {
  const res = await SELF.fetch(`https://x/api/discovery?lat=${LON.lat}&lng=${LON.lng}&from=${FROM}&to=${TO}${extra}`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return res.json();
}

describe("US2 — discovery surfaces all event kinds + kind/occasion filters", () => {
  it("returns minyan + gatherings unfiltered; type/category/occasion filters narrow; unlisted excluded but reachable by id; nusach is minyan-only; no private fields", async () => {
    const host = await signIn();
    const minyanId = await hostMinyan(host, "sefard");
    const hostingId = await hostGathering(host, { category: "hosting", occasion: "shabbat" });
    const socialId = await hostGathering(host, { category: "social", occasion: "pesach" });
    const unlistedId = await hostGathering(host, { category: "social", visibility: "unlisted" });

    // A separate viewer (owns no Stay — discovery only requires auth, D22).
    const viewer = await signIn();

    // Unfiltered: the three public events, the unlisted one excluded.
    const all = await discover(viewer);
    const ids = all.events.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining([minyanId, hostingId, socialId]));
    expect(ids).not.toContain(unlistedId);
    expect(all.events.length).toBe(3);

    // No private/contact fields on ANY discovery event (SC-003 — structural strip).
    for (const e of all.events as Record<string, unknown>[]) {
      expect(e).not.toHaveProperty("addressPrivate");
      expect(e).not.toHaveProperty("addressNotes");
      expect(e).not.toHaveProperty("hostContact");
      expect(e).not.toHaveProperty("attendees");
      expect(e).not.toHaveProperty("participants");
    }

    // types=gathering → only the two gatherings.
    const gatherings = await discover(viewer, "&types=gathering");
    expect(gatherings.events.map((e) => e.id).sort()).toEqual([hostingId, socialId].sort());
    expect(gatherings.events.every((e) => e.type === "gathering")).toBe(true);

    // categories=hosting → only the hosting gathering.
    const hosting = await discover(viewer, "&categories=hosting");
    expect(hosting.events.map((e) => e.id)).toEqual([hostingId]);

    // occasion=pesach → only the social gathering (tagged Pesach).
    const pesach = await discover(viewer, "&occasion=pesach");
    expect(pesach.events.map((e) => e.id)).toEqual([socialId]);

    // nusach is a MINYAN-ONLY sub-filter: nusach=ashkenaz drops the (sefard) minyan but leaves the
    // gatherings untouched (they carry no nusach).
    const ashkenaz = await discover(viewer, "&nusach=ashkenaz");
    const ashkenazIds = ashkenaz.events.map((e) => e.id);
    expect(ashkenazIds).not.toContain(minyanId);
    expect(ashkenazIds).toEqual(expect.arrayContaining([hostingId, socialId]));
    expect(ashkenaz.events.length).toBe(2);

    // The unlisted gathering is excluded from discovery but reachable by direct id (link).
    const byId = await SELF.fetch(`https://x/api/events/${unlistedId}`, { headers: { cookie: host } });
    expect(byId.status).toBe(200);
    expect((await byId.json()).id).toBe(unlistedId);
  });
});
