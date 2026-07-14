import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

/** Register + sign in, returning the session cookie header. */
async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const stayBody = {
  city: "לונדון",
  country: "בריטניה",
  lat: 51.5074,
  lng: -0.1278,
  arrivalDate: Date.UTC(2027, 0, 10),
  departureDate: Date.UTC(2027, 0, 12),
  numMen: 2,
};

describe("account deletion cascades stays (FR-008/SC-007)", () => {
  it("removes all stay rows for a deleted user (zero orphans)", async () => {
    const cookie = await signIn();
    const id = (await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()).id as string;

    await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(stayBody) });
    await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(stayBody) });

    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stay WHERE user_id = ?").bind(id).first()) as { n: number };
    expect(before.n).toBe(2);

    const del = await SELF.fetch("https://x/api/me", { method: "DELETE", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
    expect(del.status).toBe(200);

    const after = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stay WHERE user_id = ?").bind(id).first()) as { n: number };
    expect(after.n).toBe(0);
  });
});
