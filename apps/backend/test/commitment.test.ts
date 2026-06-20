import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function hostEvent(cookie: string, eventDate = EVENT_DATE): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: "Secret 1",
    eventDate, notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 2,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  return (await res.json()).id;
}

const commit = (cookie: string, id: string, numMen: number, stayId?: string) =>
  SELF.fetch(`https://x/api/events/${id}/commit`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ numMen, stayId: stayId ?? null }) });

describe("commit / change / withdraw", () => {
  it("commits a party (reveals address), enforces no duplicate, changes size, withdraws", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie);
    const b = await signIn();

    const res = await commit(b, id, 5);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conflict).toBe(false);
    expect(body.minyan.committedMen).toBe(7); // host 2 + 5
    expect(body.minyan.addressPrivate).toBe("Secret 1"); // participant view revealed on commit

    // Duplicate commit → 409.
    expect((await commit(b, id, 3)).status).toBe(409);

    // Change size → committed recomputes.
    const patch = await SELF.fetch(`https://x/api/events/${id}/commit`, { method: "PATCH", headers: { ...J, cookie: b }, body: JSON.stringify({ numMen: 8 }) });
    expect((await patch.json()).minyan.committedMen).toBe(10);

    // Withdraw → drops back; withdrawing again → not_committed.
    expect((await SELF.fetch(`https://x/api/events/${id}/commit`, { method: "DELETE", headers: { cookie: b } })).status).toBe(200);
    const again = await SELF.fetch(`https://x/api/events/${id}/commit`, { method: "DELETE", headers: { cookie: b } });
    expect(again.status).toBe(404);
    expect((await again.json()).errors[0].code).toBe("not_committed");
  });

  it("two concurrent commits by the same user → exactly one succeeds (unique guard)", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie);
    const c = await signIn();
    const [r1, r2] = await Promise.all([commit(c, id, 3), commit(c, id, 3)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("flags a same-date conflict (soft, non-blocking)", async () => {
    const hostA = await signIn();
    const hostB = await signIn();
    const id1 = await hostEvent(hostA, EVENT_DATE);
    const id2 = await hostEvent(hostB, EVENT_DATE); // same date, different gathering
    const u = await signIn();
    expect((await (await commit(u, id1, 2)).json()).conflict).toBe(false);
    const second = await (await commit(u, id2, 2)).json();
    expect(second.conflict).toBe(true); // already committed elsewhere that day
  });

  it("rejects committing to a cancelled minyan", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie);
    await SELF.fetch(`https://x/api/events/${id}/cancel`, { method: "POST", headers: { ...J, cookie: hostCookie }, body: JSON.stringify({ confirm: true }) });
    const res = await commit(await signIn(), id, 3);
    expect(res.status).toBe(409);
    expect((await res.json()).errors[0].code).toBe("minyan.cancelled");
  });
});

describe("D12 Stay reconciliation", () => {
  it("auto-withdraws a commitment when its linked Stay is cancelled", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie);
    const e = await signIn();

    // E registers a Stay covering the event date, then commits linking it.
    const stayRes = await SELF.fetch("https://x/api/stays", {
      method: "POST", headers: { ...J, cookie: e },
      body: JSON.stringify({ city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, arrivalDate: Date.UTC(2030, 0, 1), departureDate: Date.UTC(2030, 0, 10), numMen: 4, bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } } }),
    });
    const stayId = (await stayRes.json()).id;
    expect((await (await commit(e, id, 4, stayId)).json()).minyan.committedMen).toBe(6); // 2 + 4

    // Cancelling the Stay reconciles → E's commitment is auto-withdrawn.
    await SELF.fetch(`https://x/api/stays/${stayId}/cancel`, { method: "POST", headers: { ...J, cookie: e }, body: JSON.stringify({ confirm: true }) });
    const after = await (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie: hostCookie } })).json();
    expect(after.committedMen).toBe(2); // back to host-only
  });
});
