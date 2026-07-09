import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<{ cookie: string; id: string }> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const cookie = cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const id = (await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()).id as string;
  return { cookie, id };
}

async function hostEvent(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: null, addressNotes: null,
    eventDate: Date.UTC(2030, 0, 5), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const count = async (sql: string, ...binds: string[]): Promise<number> =>
  (((await env.DB.prepare(sql).bind(...binds).first()) as { n: number }).n);

describe("account deletion cascades all 003 data (zero orphans)", () => {
  it("removes events/minyan/commitments/roles/notifications/flags for a deleted host", async () => {
    const host = await signIn();
    const eventId = await hostEvent(host.cookie); // event + minyan + host self-commitment
    const b = await signIn();
    await SELF.fetch(`https://x/api/events/${eventId}/commit`, { method: "POST", headers: { ...J, cookie: b.cookie }, body: JSON.stringify({ numMen: 9 }) }); // → quorum: host gets a notification
    await SELF.fetch(`https://x/api/events/${eventId}/roles/baal_korei`, { method: "POST", headers: { ...J, cookie: host.cookie }, body: "{}" }); // host claims a role
    await SELF.fetch(`https://x/api/events/${eventId}/flag`, { method: "POST", headers: { ...J, cookie: host.cookie }, body: JSON.stringify({ reason: "spam" }) }); // host flags (006: reason required)

    expect(await count("SELECT COUNT(*) n FROM event WHERE host_user_id = ?", host.id)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM minyan WHERE event_id = ?", eventId)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM commitment WHERE event_id = ?", eventId)).toBe(2); // host + B
    expect(await count("SELECT COUNT(*) n FROM event_role WHERE user_id = ?", host.id)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM notification WHERE recipient_user_id = ?", host.id)).toBeGreaterThan(0);
    expect(await count("SELECT COUNT(*) n FROM flag WHERE user_id = ?", host.id)).toBe(1);

    const del = await SELF.fetch("https://x/api/me", { method: "DELETE", headers: { ...J, cookie: host.cookie }, body: JSON.stringify({ confirm: true }) });
    expect(del.status).toBe(200);

    // Everything owned by, or hanging off the host's event, is gone — no orphans.
    expect(await count("SELECT COUNT(*) n FROM event WHERE host_user_id = ?", host.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM minyan WHERE event_id = ?", eventId)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM commitment WHERE event_id = ?", eventId)).toBe(0); // incl. B's (cascade via event)
    expect(await count("SELECT COUNT(*) n FROM event_role WHERE user_id = ?", host.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM notification WHERE recipient_user_id = ?", host.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM flag WHERE user_id = ?", host.id)).toBe(0);
  });
});
