import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { LinkedMinyanDTO } from "@minyanim/shared";

// GET /api/stays/:id/linked-minyanim + POST /api/stays/:id/unlink-minyanim (013 location-change
// guard). The guard is exercised end-to-end in the frontend e2e (stays-guard.spec.ts), but the
// endpoints themselves had no direct API-level coverage of their authz + shape.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);
const LOC = { city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95 };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** Create a Stay covering the event date; returns its id. */
async function createStay(cookie: string): Promise<string> {
  const body = {
    ...LOC, arrivalDate: Date.UTC(2030, 0, 1), departureDate: Date.UTC(2030, 0, 10),
    numMen: 4,
  };
  const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return ((await res.json()) as { id: string }).id;
}

/** Host a minyan linked to a Stay (stayId lands on the host's self-commitment). Returns event id. */
async function hostFromStay(cookie: string, stayId: string): Promise<string> {
  const body = {
    type: "minyan", ...LOC, addressPrivate: "Secret 1", eventDate: EVENT_DATE, notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 2, stayId,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return ((await res.json()) as { id: string }).id;
}

const linked = async (cookie: string, stayId: string) =>
  ((await (await SELF.fetch(`https://x/api/stays/${stayId}/linked-minyanim`, { headers: { cookie } })).json()) as { minyanim: LinkedMinyanDTO[] }).minyanim;

describe("GET /api/stays/:id/linked-minyanim", () => {
  it("lists a minyan the owner HOSTS from the stay (isHost true)", async () => {
    const host = await signIn();
    const stayS = await createStay(host);
    const minyanM = await hostFromStay(host, stayS);

    const rows = await linked(host, stayS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventId).toBe(minyanM);
    expect(rows[0]!.isHost).toBe(true);
  });

  it("lists a minyan the owner only JOINS from their stay (isHost false)", async () => {
    const host = await signIn();
    const stayS = await createStay(host);
    const minyanM = await hostFromStay(host, stayS);

    const guest = await signIn();
    const stayG = await createStay(guest);
    await SELF.fetch(`https://x/api/events/${minyanM}/commit`, { method: "POST", headers: { ...J, cookie: guest }, body: JSON.stringify({ numMen: 2, stayId: stayG }) });

    const rows = await linked(guest, stayG);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventId).toBe(minyanM);
    expect(rows[0]!.isHost).toBe(false);
  });

  it("returns an empty list for a stay that is not the caller's (no leakage)", async () => {
    const host = await signIn();
    const stayS = await createStay(host);
    await hostFromStay(host, stayS);

    const stranger = await signIn();
    expect(await linked(stranger, stayS)).toEqual([]);
  });
});

describe("POST /api/stays/:id/unlink-minyanim", () => {
  it("clears the stay↔minyan link (the minyan survives, the link is gone)", async () => {
    const host = await signIn();
    const stayS = await createStay(host);
    const minyanM = await hostFromStay(host, stayS);
    expect(await linked(host, stayS)).toHaveLength(1);

    const res = await SELF.fetch(`https://x/api/stays/${stayS}/unlink-minyanim`, { method: "POST", headers: { ...J, cookie: host }, body: "{}" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(await linked(host, stayS)).toEqual([]);
    // The minyan itself is untouched.
    expect((await SELF.fetch(`https://x/api/events/${minyanM}`, { headers: { cookie: host } })).status).toBe(200);
  });

  it("rejects unlinking a stay the caller does not own (404)", async () => {
    const host = await signIn();
    const stayS = await createStay(host);
    await hostFromStay(host, stayS);

    const stranger = await signIn();
    const res = await SELF.fetch(`https://x/api/stays/${stayS}/unlink-minyanim`, { method: "POST", headers: { ...J, cookie: stranger }, body: "{}" });
    expect(res.status).toBe(404);
  });

  it("requires authentication (401)", async () => {
    const host = await signIn();
    const stayS = await createStay(host);
    const res = await SELF.fetch(`https://x/api/stays/${stayS}/unlink-minyanim`, { method: "POST", headers: J, body: "{}" });
    expect(res.status).toBe(401);
  });
});
