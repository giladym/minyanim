import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: `T-${email.slice(0, 6)}`, email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
const addPhone = (cookie: string, e164: string) =>
  SELF.fetch("https://x/api/me/phones", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ e164 }) });
const get = (cookie: string | null, id: string) =>
  SELF.fetch(`https://x/api/events/${id}`, { headers: cookie ? { cookie } : {} }).then((r) => r.json());

const hostBody = {
  type: "minyan", city: "וינה", country: "אוסטריה", lat: 48.2082, lng: 16.3738,
  eventDate: Date.UTC(2030, 0, 5), addressPrivate: "Rotenturmstrasse 1",
  minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }] },
  hostNumMen: 9,
};

describe("minyan contact roster (committed-only)", () => {
  it("exposes host + participant contact to committed members, with isHost; hides it publicly", async () => {
    const a = await signIn();
    await addPhone(a, "+972501112222");
    const evt = (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie: a }, body: JSON.stringify(hostBody) })).json()) as { id: string };

    const b = await signIn();
    await addPhone(b, "+972503334444");
    const aId = (await (await SELF.fetch("https://x/api/me", { headers: { cookie: a } })).json()).id as string;
    await SELF.fetch(`https://x/api/events/${evt.id}/commit`, { method: "POST", headers: { ...J, cookie: b }, body: JSON.stringify({ numMen: 2 }) });

    // Committed participant (B) sees the roster with contact + the host flagged.
    const asB = (await get(b, evt.id)) as { participants: { name: string; phone: string | null; isHost?: boolean; userId: string }[]; hostContact: { phone: string | null } };
    expect(asB.participants).toHaveLength(2);
    const host = asB.participants.find((p) => p.userId === aId)!;
    expect(host.isHost).toBe(true);
    expect(host.phone).toBe("+972501112222");
    expect(asB.participants.find((p) => !p.isHost)!.phone).toBe("+972503334444");
    expect(asB.hostContact.phone).toBe("+972501112222");

    // A signed-out (public) viewer gets NO contact and NO roster.
    const pub = (await get(null, evt.id)) as Record<string, unknown>;
    expect(pub.participants).toBeUndefined();
    expect(pub.hostContact).toBeUndefined();
  });
});
