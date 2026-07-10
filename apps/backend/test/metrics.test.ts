import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { AdminMetricsDTO } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signIn(email = `u-${crypto.randomUUID()}@example.com`): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
const signInAdmin = () => signIn("admin@example.com");

async function hostEvent(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "וינה", country: "AT", lat: 48.2, lng: 16.37, addressPrivate: null, addressNotes: null,
    eventDate: Date.UTC(2030, 0, 5), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "maariv", time: null }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

async function createStay(cookie: string): Promise<string> {
  const body = {
    city: "בריסל", country: "BE", lat: 50.85, lng: 4.35, addressPrivate: null,
    arrivalDate: Date.UTC(2030, 5, 1), departureDate: Date.UTC(2030, 5, 8), numMen: 2,
    bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    contactName: null, contactPhone: null, contactEmail: null, groupMembers: null, notes: null, folderId: null,
  };
  return (await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const commit = (cookie: string, id: string, numMen: number) =>
  SELF.fetch(`https://x/api/events/${id}/commit`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ numMen, stayId: null }) });
const flag = (cookie: string, id: string) =>
  SELF.fetch(`https://x/api/events/${id}/flag`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ reason: "spam" }) });

describe("admin metrics (006 US5)", () => {
  it("is admin-only", async () => {
    expect((await SELF.fetch("https://x/api/admin/metrics")).status).toBe(401);
    expect((await SELF.fetch("https://x/api/admin/metrics", { headers: { cookie: await signIn() } })).status).toBe(403);
  });

  it("reports counts, the form→host→quorum funnel, and top locations", async () => {
    const host = await signIn();
    const quorumEvent = await hostEvent(host); // host commits 1
    await commit(await signIn(), quorumEvent, 10); // → 11 ≥ QUORUM (10)
    await hostEvent(host); // a second, still-forming minyan
    await createStay(host); // an active stay → funnel.potential

    const admin = await signInAdmin();
    const m = (await (await SELF.fetch("https://x/api/admin/metrics", { headers: { cookie: admin } })).json()) as AdminMetricsDTO;

    expect(m.users.total).toBeGreaterThanOrEqual(3);
    expect(m.users.admins).toBeGreaterThanOrEqual(1);
    expect(m.minyanim.total).toBe(2);
    expect(m.minyanim.ready).toBe(1); // the quorum one
    expect(m.minyanim.forming).toBe(1);
    expect(m.stays.active).toBeGreaterThanOrEqual(1);
    expect(m.funnel).toEqual({ potential: m.stays.active, hosted: 2, quorum: 1 });
    expect(m.topLocations[0]).toMatchObject({ city: "וינה", country: "AT" });
    expect(m.topLocations[0].count).toBeGreaterThanOrEqual(2); // both minyanim in Vienna
  });

  it("counts hidden content and open flags after an auto-hide", async () => {
    const id = await hostEvent(await signIn());
    for (const r of [await signIn(), await signIn(), await signIn()]) await flag(r, id); // 3 → auto-hidden

    const m = (await (await SELF.fetch("https://x/api/admin/metrics", { headers: { cookie: await signInAdmin() } })).json()) as AdminMetricsDTO;
    expect(m.minyanim.hidden).toBe(1);
    expect(m.moderation.autoHidden).toBeGreaterThanOrEqual(1);
    expect(m.moderation.openFlags).toBeGreaterThanOrEqual(1); // one distinct flagged item
  });
});
