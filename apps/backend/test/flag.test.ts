import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

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
    eventDate: Date.UTC(2030, 0, 5), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "maariv", time: null }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const flag = (cookie: string, id: string) =>
  SELF.fetch(`https://x/api/events/${id}/flag`, { method: "POST", headers: { ...J, cookie }, body: "{}" });

describe("FR-017 flag affordance", () => {
  it("flags an event, idempotently (a repeat flag is a no-op 200)", async () => {
    const id = await hostEvent(await signIn());
    const b = await signIn();
    expect((await flag(b, id)).status).toBe(200);
    expect((await flag(b, id)).status).toBe(200); // idempotent — UNIQUE(event,user)
  });

  it("401 without a session, 404 for a missing event", async () => {
    expect((await SELF.fetch("https://x/api/events/evt_x/flag", { method: "POST", headers: J, body: "{}" })).status).toBe(401);
    expect((await flag(await signIn(), "evt_missing")).status).toBe(404);
  });
});
