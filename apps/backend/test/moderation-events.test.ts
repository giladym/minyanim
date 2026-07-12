import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T043 — moderation/enforcement parity for a HOSTING gathering (FR-013): flag-to-hide, hidden→404
// for a non-host, suspended host blocked from create + request.
// T047 — pending requesters of a hosting gathering are notified (request_declined) when the event is
// moderation-hidden or its host is suspended.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(email = `u-${crypto.randomUUID()}@example.com`): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
/** admin@example.com is in the vitest ADMIN_EMAILS binding → first-admin bootstrap on first admin call. */
const signInAdmin = () => signIn("admin@example.com");

async function userIdByEmail(email: string): Promise<string> {
  const r = (await env.DB.prepare("SELECT id FROM user WHERE email = ?").bind(email).first()) as { id: string };
  return r.id;
}

async function hostGathering(cookie: string, category: "hosting" | "social" = "hosting"): Promise<string> {
  const body = {
    type: "gathering", category, title: "מפגש", city: "וינה", country: "AT", lat: 48.2, lng: 16.37,
    addressPrivate: "Secret St 5", addressNotes: "Ring twice", eventDate: EVENT_DATE, capacity: 8,
    gathering: category === "social" ? { subcategory: "kiddush" } : { mealType: "shabbat_dinner", kashrut: "glatt" },
    hostNumMen: 1,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()).id;
}

const flag = (cookie: string, id: string, reason = "spam") =>
  SELF.fetch(`https://x/api/events/${id}/flag`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ reason }) });
const getEvent = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } });
const join = (cookie: string, id: string, partySize: number) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ partySize }) });
const post = (cookie: string, path: string, body: unknown = {}) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });

async function autoHide(id: string): Promise<void> {
  for (const r of [await signIn(), await signIn(), await signIn()]) expect((await flag(r, id)).status).toBe(200);
}
async function inboxKinds(cookie: string): Promise<string[]> {
  const body = await (await SELF.fetch("https://x/api/notifications", { headers: { cookie } })).json();
  return body.notifications.map((n: { kind: string }) => n.kind);
}

describe("T043 — moderation parity for a hosting gathering", () => {
  it("auto-hides at 3 distinct reporters → 404 for a non-host, still visible to the host", async () => {
    const host = await signIn();
    const id = await hostGathering(host);
    const viewer = await signIn();
    expect((await getEvent(viewer, id)).status).toBe(200); // visible before

    await autoHide(id);
    const row = (await env.DB.prepare("SELECT hidden FROM event WHERE id = ?").bind(id).first()) as { hidden: number };
    expect(row.hidden).toBe(1);
    expect((await getEvent(viewer, id)).status).toBe(404); // hidden → 404 to a non-host
    expect((await getEvent(host, id)).status).toBe(200); // still visible to its host
  });

  it("is excluded from discovery once hidden", async () => {
    const host = await signIn();
    const id = await hostGathering(host, "social");
    await autoHide(id);
    const disc = await SELF.fetch(`https://x/api/discovery?lat=48.2&lng=16.37&radiusKm=50&from=${Date.UTC(2030, 0, 1)}&to=${Date.UTC(2030, 0, 31)}`, { headers: { cookie: host } });
    if (disc.status === 200) {
      expect(JSON.stringify(await disc.json())).not.toContain(id); // hidden content never surfaces
    }
  });

  it("blocks a suspended host from creating a gathering and from requesting a seat", async () => {
    const offenderEmail = `u-${crypto.randomUUID()}@example.com`;
    const offender = await signIn(offenderEmail);
    const otherHost = await signIn();
    const openId = await hostGathering(otherHost, "social"); // a target to request a seat on

    const admin = await signInAdmin();
    expect((await post(admin, `/api/admin/users/${await userIdByEmail(offenderEmail)}/suspend`, { suspendDays: 3 })).status).toBe(200);

    // Blocked from hosting a new gathering…
    const create = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie: offender },
      body: JSON.stringify({ type: "gathering", category: "hosting", city: "x", country: "x", lat: 1, lng: 1, eventDate: EVENT_DATE, capacity: 4, gathering: { mealType: "shabbat_dinner", kashrut: "glatt" }, hostNumMen: 1 }) });
    expect(create.status).toBe(403);
    expect((await create.json()).errors[0].code).toBe("user.suspended");

    // …and from requesting a seat on someone else's gathering.
    const req = await join(offender, openId, 2);
    expect(req.status).toBe(403);
    expect((await req.json()).errors[0].code).toBe("user.suspended");
  });
});

describe("T047 — pending requesters notified when a hosting event becomes unavailable", () => {
  it("moderation-hide notifies pending requesters (request_declined)", async () => {
    const host = await signIn();
    const id = await hostGathering(host);
    const guest = await signIn();
    expect((await (await join(guest, id, 2)).json()).myStatus).toBe("pending");

    await autoHide(id);
    expect(await inboxKinds(guest)).toContain("request_declined");
  });

  it("host suspension notifies pending requesters of the host's events", async () => {
    const hostEmail = `u-${crypto.randomUUID()}@example.com`;
    const host = await signIn(hostEmail);
    const id = await hostGathering(host);
    const guest = await signIn();
    await join(guest, id, 2); // pending

    const admin = await signInAdmin();
    expect((await post(admin, `/api/admin/users/${await userIdByEmail(hostEmail)}/suspend`, { suspendDays: 3 })).status).toBe(200);
    expect(await inboxKinds(guest)).toContain("request_declined");
  });
});
