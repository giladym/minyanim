import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

/** A future Saturday so the gathering is a Shabbat-morning Shacharit (Torah + Korei gate "ready"). */
function futureSaturday(): number {
  let t = Date.UTC(2030, 0, 1);
  while (new Date(t).getUTCDay() !== 6) t += 86400000;
  return t;
}

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function hostShabbatShacharit(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: null, addressNotes: null,
    eventDate: futureSaturday(), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const commit = (cookie: string, id: string, numMen: number) =>
  SELF.fetch(`https://x/api/events/${id}/commit`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ numMen }) });
const claim = (cookie: string, id: string, role: string) =>
  SELF.fetch(`https://x/api/events/${id}/roles/${role}`, { method: "POST", headers: { ...J, cookie }, body: "{}" });
const release = (cookie: string, id: string, role: string) =>
  SELF.fetch(`https://x/api/events/${id}/roles/${role}`, { method: "DELETE", headers: { cookie } });
const getMinyan = async (cookie: string, id: string) => (await SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } })).json();

describe("US4 roles", () => {
  it("claiming Ba'al Korei flips a 10-man Shabbat-Shacharit Torah minyan to ready, release reverts", async () => {
    const cookie = await signIn();
    const id = await hostShabbatShacharit(cookie);
    const b = await signIn();
    await commit(b, id, 9); // → 10 men: quorum reached but NOT ready (no Ba'al Korei)
    expect((await getMinyan(b, id)).status).toBe("quorum-reached");

    const claimed = await claim(b, id, "baal_korei");
    expect(claimed.status).toBe(200);
    const after = (await claimed.json()).minyan;
    expect(after.status).toBe("ready");
    expect(after.rolesFilled.baalKorei).toBe(true);
    expect(after.myRoles.baalKorei).toBe(true);

    const released = await release(b, id, "baal_korei");
    expect((await released.json()).minyan.status).toBe("quorum-reached");
  });

  it("a non-committed user cannot claim (403 not_committed)", async () => {
    const id = await hostShabbatShacharit(await signIn());
    const res = await claim(await signIn(), id, "baal_korei");
    expect(res.status).toBe(403);
    expect((await res.json()).errors[0].code).toBe("not_committed");
  });

  it("concurrent claims on one slot → exactly one winner", async () => {
    const id = await hostShabbatShacharit(await signIn());
    const b = await signIn();
    const c = await signIn();
    await commit(b, id, 1);
    await commit(c, id, 1);
    const [r1, r2] = await Promise.all([claim(b, id, "baal_tefila"), claim(c, id, "baal_tefila")]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });

  it("a user may hold both roles; withdrawing auto-releases them", async () => {
    const hostCookie = await signIn();
    const id = await hostShabbatShacharit(hostCookie);
    const b = await signIn();
    await commit(b, id, 2);
    await claim(b, id, "baal_tefila");
    const both = (await (await claim(b, id, "baal_korei")).json()).minyan;
    expect(both.myRoles).toEqual({ baalTefila: true, baalKorei: true });

    await SELF.fetch(`https://x/api/events/${id}/commit`, { method: "DELETE", headers: { cookie: b } });
    const afterWithdraw = await getMinyan(hostCookie, id);
    expect(afterWithdraw.rolesFilled).toEqual({ baalTefila: false, baalKorei: false });
  });
});
