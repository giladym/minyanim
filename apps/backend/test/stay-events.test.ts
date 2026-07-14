import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// GET /api/stays/:id/events (015 "location ↔ events") — a location's events: the ones the owner
// HOSTS attached to the stay (event.stay_id) UNION the ones they JOINED from it (attendance.stay_id).
// Owner-gated (404 to a non-owner). Verifies event.stay_id is persisted on create.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(): Promise<{ cookie: string; id: string }> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const id = ((await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()) as { id: string }).id;
  return { cookie, id };
}

async function createStay(cookie: string): Promise<string> {
  const body = {
    city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
    arrivalDate: Date.UTC(2030, 0, 1), departureDate: Date.UTC(2030, 0, 10), numMen: 3,
  };
  const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return ((await res.json()) as { id: string }).id;
}

async function hostMinyan(cookie: string, stayId: string | null): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
    eventDate: EVENT_DATE, notes: null, stayId,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 2,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return ((await res.json()) as { id: string }).id;
}

const stayEvents = (cookie: string, stayId: string) =>
  SELF.fetch(`https://x/api/stays/${stayId}/events`, { headers: { cookie } });

const commit = (cookie: string, id: string, numMen: number, stayId: string | null) =>
  SELF.fetch(`https://x/api/events/${id}/commit`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ numMen, stayId }) });

describe("GET /api/stays/:id/events (015 location ↔ events)", () => {
  it("returns an event created from the stay (event.stay_id persisted)", async () => {
    const host = await signIn();
    const stayId = await createStay(host.cookie);
    const evId = await hostMinyan(host.cookie, stayId);

    const res = await stayEvents(host.cookie, stayId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { id: string; type: string }[] };
    const row = body.events.find((e) => e.id === evId);
    expect(row).toBeTruthy();
    expect(row!.type).toBe("minyan");
  });

  it("does NOT return a standalone event (created with no stayId)", async () => {
    const host = await signIn();
    const stayId = await createStay(host.cookie);
    const evId = await hostMinyan(host.cookie, null);

    const body = (await (await stayEvents(host.cookie, stayId)).json()) as { events: { id: string }[] };
    expect(body.events.map((e) => e.id)).not.toContain(evId);
  });

  it("is owner-gated: 404 to a non-owner and for a non-existent stay", async () => {
    const host = await signIn();
    const stayId = await createStay(host.cookie);
    await hostMinyan(host.cookie, stayId);

    const other = await signIn();
    expect((await stayEvents(other.cookie, stayId)).status).toBe(404);
    expect((await stayEvents(host.cookie, "stay_does_not_exist")).status).toBe(404);
  });

  it("includes an event JOINED from the stay (attendance.stay_id) with the viewer's status", async () => {
    const host = await signIn();
    const evId = await hostMinyan(host.cookie, null); // host's standalone event

    const guest = await signIn();
    const guestStay = await createStay(guest.cookie);
    expect((await commit(guest.cookie, evId, 3, guestStay)).status).toBe(201);

    const body = (await (await stayEvents(guest.cookie, guestStay)).json()) as {
      events: { id: string; myStatus: string | null }[];
    };
    const row = body.events.find((e) => e.id === evId);
    expect(row).toBeTruthy();
    expect(row!.myStatus).toBe("confirmed");
  });

  it("requires authentication (401)", async () => {
    const host = await signIn();
    const stayId = await createStay(host.cookie);
    const res = await SELF.fetch(`https://x/api/stays/${stayId}/events`);
    expect(res.status).toBe(401);
  });
});
