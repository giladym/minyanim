import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function hostEvent(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: null, addressNotes: null,
    eventDate: Date.UTC(2030, 0, 5), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "maariv", time: null }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

async function createStay(cookie: string): Promise<string> {
  const body = {
    city: "בריסל", country: "בלגיה", lat: 50.85, lng: 4.35, addressPrivate: null,
    arrivalDate: Date.UTC(2030, 5, 1), departureDate: Date.UTC(2030, 5, 8), numMen: 2,
    bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    contactName: null, contactPhone: null, contactEmail: null, groupMembers: null, notes: null, folderId: null,
  };
  return (await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const flag = (cookie: string, path: string, reason = "spam") =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ reason }) });

describe("flagging + auto-hide (006 US1/US2)", () => {
  it("flags a minyan with a reason, idempotently", async () => {
    const id = await hostEvent(await signIn());
    const b = await signIn();
    expect((await flag(b, `/api/events/${id}/flag`)).status).toBe(200);
    expect((await flag(b, `/api/events/${id}/flag`)).status).toBe(200);
  });

  it("requires a reason, a session, and an existing target", async () => {
    const id = await hostEvent(await signIn());
    const u = await signIn();
    expect((await SELF.fetch(`https://x/api/events/${id}/flag`, { method: "POST", headers: { ...J, cookie: u }, body: "{}" })).status).toBe(400);
    expect((await SELF.fetch(`https://x/api/events/${id}/flag`, { method: "POST", headers: J, body: JSON.stringify({ reason: "spam" }) })).status).toBe(401);
    expect((await flag(u, "/api/events/evt_missing/flag")).status).toBe(404);
    expect((await flag(u, "/api/stays/stay_missing/flag")).status).toBe(404);
  });

  it("auto-hides a minyan on the 3rd DISTINCT reporter (not before), idempotently", async () => {
    const id = await hostEvent(await signIn());
    const [a, b, cc] = [await signIn(), await signIn(), await signIn()];
    await flag(a, `/api/events/${id}/flag`);
    await flag(b, `/api/events/${id}/flag`);
    const viewer = await signIn();
    expect((await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: viewer } })).status).toBe(200);
    await flag(cc, `/api/events/${id}/flag`);
    expect((await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: viewer } })).status).toBe(404);
    expect((await flag(viewer, `/api/events/${id}/flag`)).status).toBe(200);
  });

  it("auto-hides a Stay on the 3rd reporter; the owner is NOT sanctioned (SC-002)", async () => {
    const stayId = await createStay(await signIn());
    for (const r of [await signIn(), await signIn(), await signIn()]) await flag(r, `/api/stays/${stayId}/flag`);
    const hidden = (await env.DB.prepare("SELECT hidden FROM stay WHERE id = ?").bind(stayId).first()) as { hidden: number };
    expect(hidden.hidden).toBe(1);
    const owner = (await env.DB.prepare("SELECT status FROM user WHERE id = (SELECT user_id FROM stay WHERE id = ?)").bind(stayId).first()) as { status: string };
    expect(owner.status).toBe("active");
  });
});
