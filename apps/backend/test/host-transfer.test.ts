import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// POST /api/events/:id/transfer-host — reassign a minyan's host to a committed participant (013).
// Previously covered only by the frontend e2e (host-transfer-notify.spec.ts); this pins the
// endpoint's authz + validation at the API level.

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

async function hostEvent(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: "Secret 1",
    eventDate: EVENT_DATE, notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 2,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return ((await res.json()) as { id: string }).id;
}

const commit = (cookie: string, id: string, numMen: number) =>
  SELF.fetch(`https://x/api/events/${id}/commit`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ numMen, stayId: null }) });

const transfer = (cookie: string, id: string, newHostUserId?: string) =>
  SELF.fetch(`https://x/api/events/${id}/transfer-host`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ newHostUserId }) });

describe("POST /api/events/:id/transfer-host", () => {
  it("reassigns host to a confirmed participant; the new host now sees the owner view and the old host the participant view", async () => {
    const host = await signIn();
    const id = await hostEvent(host.cookie);
    const guest = await signIn();
    expect((await commit(guest.cookie, id, 3)).status).toBe(201);

    const res = await transfer(host.cookie, id, guest.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // The new host now gets the owner shape (isHost true); the old host is a plain participant.
    const asNew = (await (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: guest.cookie } })).json()) as { isHost?: boolean };
    expect(asNew.isHost).toBe(true);
    const asOld = (await (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: host.cookie } })).json()) as { isHost?: boolean };
    expect(asOld.isHost ?? false).toBe(false); // participant view: no owner `isHost` flag
  });

  it("rejects transferring to a user who is not a participant (400 transfer.not_participant)", async () => {
    const host = await signIn();
    const id = await hostEvent(host.cookie);
    const stranger = await signIn(); // never committed

    const res = await transfer(host.cookie, id, stranger.id);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: { code: string }[] }).errors[0]!.code).toBe("transfer.not_participant");
  });

  it("is a no-op when the host transfers to themselves (200, host unchanged)", async () => {
    const host = await signIn();
    const id = await hostEvent(host.cookie);

    const res = await transfer(host.cookie, id, host.id);
    expect(res.status).toBe(200);
    const view = (await (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: host.cookie } })).json()) as { isHost?: boolean };
    expect(view.isHost).toBe(true);
  });

  it("rejects a caller who is not the host (404)", async () => {
    const host = await signIn();
    const id = await hostEvent(host.cookie);
    const guest = await signIn();
    await commit(guest.cookie, id, 2);

    // The guest (a participant, not the host) may not reassign the host role.
    expect((await transfer(guest.cookie, id, guest.id)).status).toBe(404);
  });

  it("rejects a missing newHostUserId (400)", async () => {
    const host = await signIn();
    const id = await hostEvent(host.cookie);
    const res = await transfer(host.cookie, id, undefined);
    expect(res.status).toBe(400);
  });

  it("requires authentication (401)", async () => {
    const host = await signIn();
    const id = await hostEvent(host.cookie);
    const res = await SELF.fetch(`https://x/api/events/${id}/transfer-host`, { method: "POST", headers: J, body: JSON.stringify({ newHostUserId: host.id }) });
    expect(res.status).toBe(401);
  });
});
