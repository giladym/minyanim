import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

/** Sign up + in; returns the session cookie. A fixed email lands in the ADMIN_EMAILS allowlist. */
async function signIn(email = `u-${crypto.randomUUID()}@example.com`): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** admin@example.com is in the vitest ADMIN_EMAILS binding → first admin bootstrap on first admin call. */
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
  const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return (await res.json()).id;
}

const flag = (cookie: string, path: string, reason = "spam") =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ reason }) });

const get = (cookie: string, path: string) => SELF.fetch(`https://x${path}`, { headers: { cookie } });
const post = (cookie: string, path: string, body: unknown = {}) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });

describe("moderation queue (006 US3)", () => {
  it("is admin-only: 401 signed out, 403 for a non-admin", async () => {
    expect((await SELF.fetch("https://x/api/admin/moderation")).status).toBe(401);
    expect((await get(await signIn(), "/api/admin/moderation")).status).toBe(403);
  });

  it("lists flagged content, auto-hidden first then by reporter count", async () => {
    const host = await signIn();
    const hot = await hostEvent(host); // will be auto-hidden (3 reporters)
    const warm = await hostEvent(host); // 1 reporter, not hidden
    for (const r of [await signIn(), await signIn(), await signIn()]) await flag(r, `/api/events/${hot}/flag`);
    await flag(await signIn(), `/api/events/${warm}/flag`);

    const admin = await signInAdmin();
    const { entries } = await (await get(admin, "/api/admin/moderation")).json();
    expect(entries).toHaveLength(2);
    expect(entries[0].contentId).toBe(hot);
    expect(entries[0].hidden).toBe(true);
    expect(entries[0].reporterCount).toBe(3);
    expect(entries[0].reportedUserId).toBeTruthy(); // the content owner (sanction target)
    expect(entries[1].contentId).toBe(warm);
    expect(entries[1].hidden).toBe(false);
  });

  it("dismiss restores the content and clears its flags", async () => {
    const id = await hostEvent(await signIn());
    for (const r of [await signIn(), await signIn(), await signIn()]) await flag(r, `/api/events/${id}/flag`);
    const viewer = await signIn();
    expect((await get(viewer, `/api/events/${id}`)).status).toBe(404); // auto-hidden

    const admin = await signInAdmin();
    expect((await post(admin, `/api/admin/moderation/event/${id}/dismiss`)).status).toBe(200);
    expect((await get(viewer, `/api/events/${id}`)).status).toBe(200); // restored
    const { entries } = await (await get(admin, "/api/admin/moderation")).json();
    expect(entries).toHaveLength(0); // flags cleared
  });

  it("remove hides the content but keeps its flags; 404 for unknown type/content", async () => {
    const id = await createStay(await signIn());
    const admin = await signInAdmin();
    expect((await post(admin, `/api/admin/moderation/stay/${id}/remove`)).status).toBe(200);
    const row = (await env.DB.prepare("SELECT hidden FROM stay WHERE id = ?").bind(id).first()) as { hidden: number };
    expect(row.hidden).toBe(1);
    expect((await post(admin, `/api/admin/moderation/bogus/${id}/remove`)).status).toBe(404);
    expect((await post(admin, `/api/admin/moderation/stay/stay_missing/remove`)).status).toBe(404);
  });
});

describe("user sanctions + enforcement (006 US3 / FR-005)", () => {
  it("suspend blocks create with user.suspended{until}; reinstate unblocks", async () => {
    const offender = await signIn();
    const uid = (await env.DB.prepare("SELECT id FROM user WHERE status='active' ORDER BY created_at DESC LIMIT 1").first()) as { id: string };
    const admin = await signInAdmin();

    const susp = await post(admin, `/api/admin/users/${uid.id}/suspend`, { suspendDays: 3 });
    expect(susp.status).toBe(200);
    expect((await susp.json()).status).toBe("suspended");

    const blocked = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie: offender },
      body: JSON.stringify({ city: "x", country: "x", lat: 1, lng: 1, arrivalDate: Date.UTC(2030, 5, 1), departureDate: Date.UTC(2030, 5, 2), numMen: 1, bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } }, folderId: null }) });
    expect(blocked.status).toBe(403);
    const body = await blocked.json();
    expect(body.errors[0].code).toBe("user.suspended");
    expect(body.errors[0].params.until).toBeGreaterThan(Date.now()); // countdown for the FE

    expect((await post(admin, `/api/admin/users/${uid.id}/reinstate`)).status).toBe(200);
    expect((await createStay(offender))).toBeTruthy(); // unblocked
  });

  it("ban blocks create with user.banned", async () => {
    const offender = await signIn();
    const uid = (await env.DB.prepare("SELECT id FROM user WHERE status='active' ORDER BY created_at DESC LIMIT 1").first()) as { id: string };
    const admin = await signInAdmin();
    expect((await post(admin, `/api/admin/users/${uid.id}/ban`)).status).toBe(200);
    const blocked = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie: offender },
      body: JSON.stringify({ type: "minyan", city: "x", country: "x", lat: 1, lng: 1, eventDate: Date.UTC(2030, 0, 5), minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "maariv", time: null }] }, hostNumMen: 1 }) });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).errors[0].code).toBe("user.banned");
  });

  it("cannot sanction the last active admin (FR-009 → 409)", async () => {
    const admin = await signInAdmin();
    const me = (await (await get(admin, "/api/admin/me")).json()) as { isAdmin: boolean };
    expect(me.isAdmin).toBe(true);
    const adminId = (await env.DB.prepare("SELECT id FROM user WHERE is_admin = 1 LIMIT 1").first()) as { id: string };
    expect((await post(admin, `/api/admin/users/${adminId.id}/ban`)).status).toBe(409);
    expect((await post(admin, `/api/admin/users/${adminId.id}/suspend`)).status).toBe(409);
  });

  it("404 sanctioning a missing user", async () => {
    const admin = await signInAdmin();
    expect((await post(admin, `/api/admin/users/usr_missing/warn`)).status).toBe(404);
  });
});
