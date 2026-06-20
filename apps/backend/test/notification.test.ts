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

async function hostEvent(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: null, addressNotes: null,
    eventDate: EVENT_DATE, notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "maariv", time: null }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const commit = (cookie: string, id: string, numMen: number) =>
  SELF.fetch(`https://x/api/events/${id}/commit`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ numMen }) });

async function inboxKinds(cookie: string): Promise<string[]> {
  const body = await (await SELF.fetch("https://x/api/notifications", { headers: { cookie } })).json();
  return body.notifications.map((n: { kind: string }) => n.kind);
}

describe("US5 notifications", () => {
  it("fires quorum_reached once (idempotent) then quorum_lost on the downward crossing", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie); // host = 1 committed
    const b = await signIn();
    await commit(b, id, 9); // → 10: quorum reached

    let kinds = await inboxKinds(hostCookie);
    expect(kinds.filter((k) => k === "quorum_reached")).toHaveLength(1);

    const cc = await signIn();
    await commit(cc, id, 2); // → 12: still ≥10, must NOT re-fire
    kinds = await inboxKinds(hostCookie);
    expect(kinds.filter((k) => k === "quorum_reached")).toHaveLength(1);

    await SELF.fetch(`https://x/api/events/${id}/commit`, { method: "DELETE", headers: { cookie: b } }); // → 3: lost
    kinds = await inboxKinds(hostCookie);
    expect(kinds.filter((k) => k === "quorum_lost")).toHaveLength(1);
  });

  it("fires a near_quorum nudge to the host at 8", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie); // host = 1
    const b = await signIn();
    await commit(b, id, 7); // → 8: near quorum
    expect(await inboxKinds(hostCookie)).toContain("near_quorum");
  });

  it("notifies committed participants when the host cancels", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie);
    const b = await signIn();
    await commit(b, id, 2);
    await SELF.fetch(`https://x/api/events/${id}/cancel`, { method: "POST", headers: { ...J, cookie: hostCookie }, body: JSON.stringify({ confirm: true }) });
    expect(await inboxKinds(b)).toContain("cancelled");
  });

  it("marks notifications read", async () => {
    const hostCookie = await signIn();
    const id = await hostEvent(hostCookie);
    await commit(await signIn(), id, 9); // quorum → host has an unread notification
    const before = await (await SELF.fetch("https://x/api/notifications", { headers: { cookie: hostCookie } })).json();
    expect(before.unread).toBeGreaterThan(0);
    await SELF.fetch("https://x/api/notifications/read-all", { method: "POST", headers: { ...J, cookie: hostCookie }, body: "{}" });
    const after = await (await SELF.fetch("https://x/api/notifications", { headers: { cookie: hostCookie } })).json();
    expect(after.unread).toBe(0);
  });
});
