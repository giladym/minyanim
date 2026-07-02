import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "Host", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

function hostBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "minyan",
    city: "זקופנה",
    country: "פולין",
    lat: 49.312345,
    lng: 19.954321,
    addressPrivate: "12 Secret St",
    addressNotes: "ring twice, code 1234",
    eventDate: Date.UTC(2030, 0, 5),
    notes: "קומה 2",
    minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }, { tefilla: "mincha", time: null }] },
    hostNumMen: 2,
    ...overrides,
  };
}

async function host(cookie: string, overrides = {}) {
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(hostBody(overrides)) });
  return res;
}

describe("POST /api/events (host) + privacy", () => {
  it("401 without a session", async () => {
    expect((await SELF.fetch("https://x/api/events", { method: "POST", headers: J, body: JSON.stringify(hostBody()) })).status).toBe(401);
  });

  it("hosts a minyan (201), auto-commits the host, returns the owner view", async () => {
    const cookie = await signIn();
    const res = await host(cookie);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.committedMen).toBe(2); // host self-commit
    expect(body.status).toBe("forming");
    expect(body.services.length).toBe(2);
    expect(body.addressPrivate).toBe("12 Secret St"); // owner view includes private
    expect(body.isHost).toBe(true);
    expect(Array.isArray(body.participants)).toBe(true);
  });

  it("rejects an event date in the past", async () => {
    const cookie = await signIn();
    const res = await host(cookie, { eventDate: Date.UTC(2020, 0, 5) });
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("date.in_past");
  });

  it("GET /:id — signed-in non-committed user sees the roster + contact, but NOT the address", async () => {
    const hostCookie = await signIn();
    const id = (await (await host(hostCookie)).json()).id;
    const other = await signIn();
    const res = await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: other } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(id);
    expect(body.committedMen).toBe(2);
    // Roster + host contact ARE visible so a browser can reach people to coordinate joining.
    expect(Array.isArray(body.participants)).toBe(true);
    expect(body.hostContact).toBeTruthy();
    // …but the private address / entry notes stay committed-only, and the pin stays fuzzed (D4).
    expect(body).not.toHaveProperty("addressPrivate");
    expect(body).not.toHaveProperty("addressNotes");
    expect(body.lat).toBe(49.31);
    expect(body.lng).toBe(19.95);
    // Email is committed-only — not exposed to a non-committed viewer.
    expect(body.hostContact.email).toBeNull();
  });

  it("GET /:id — signed-out visitor gets the pure public projection (no roster/contact)", async () => {
    const hostCookie = await signIn();
    const id = (await (await host(hostCookie)).json()).id;
    const res = await SELF.fetch(`https://x/api/events/${id}`); // no cookie
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("participants");
    expect(body).not.toHaveProperty("hostContact");
    expect(body).not.toHaveProperty("addressPrivate");
    expect(body.lat).toBe(49.31);
  });

  it("GET /:id — host sees the owner view with the exact point + private fields", async () => {
    const cookie = await signIn();
    const id = (await (await host(cookie)).json()).id;
    const body = await (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } })).json();
    expect(body.addressPrivate).toBe("12 Secret St");
    expect(body.addressNotes).toBe("ring twice, code 1234");
    expect(body.hostContact).toBeTruthy();
    expect(body.lat).toBe(49.312345); // exact for the host/participant
  });
});

describe("PATCH / cancel (host-only)", () => {
  it("PATCH toggles Sefer Torah for the host; 404 for a non-host", async () => {
    const cookie = await signIn();
    const id = (await (await host(cookie)).json()).id;
    const res = await SELF.fetch(`https://x/api/events/${id}`, { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ seferTorah: false }) });
    expect(res.status).toBe(200);
    expect((await res.json()).seferTorah).toBe(false);

    const other = await signIn();
    const res404 = await SELF.fetch(`https://x/api/events/${id}`, { method: "PATCH", headers: { ...J, cookie: other }, body: JSON.stringify({ seferTorah: true }) });
    expect(res404.status).toBe(404);
  });

  it("cancel requires confirm, then soft-cancels; non-host 404s", async () => {
    const cookie = await signIn();
    const id = (await (await host(cookie)).json()).id;

    const noConfirm = await SELF.fetch(`https://x/api/events/${id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: "{}" });
    expect(noConfirm.status).toBe(400);
    expect((await noConfirm.json()).errors[0].code).toBe("confirm.required");

    const other = await signIn();
    const notHost = await SELF.fetch(`https://x/api/events/${id}/cancel`, { method: "POST", headers: { ...J, cookie: other }, body: JSON.stringify({ confirm: true }) });
    expect(notHost.status).toBe(404);

    const ok = await SELF.fetch(`https://x/api/events/${id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
    expect(ok.status).toBe(200);
    const after = await (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } })).json();
    expect(after.status).toBe("cancelled");
  });
});
