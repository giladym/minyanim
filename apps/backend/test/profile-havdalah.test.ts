import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

describe("profile havdalahOpinion (005 D4 / SC-007)", () => {
  it("defaults to 'geonim' and round-trips a change", async () => {
    const cookie = await signIn();
    const get = await SELF.fetch("https://x/api/me", { headers: { cookie } });
    expect((await get.json()).havdalahOpinion).toBe("geonim");

    const patch = await SELF.fetch("https://x/api/me", { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ havdalahOpinion: "rabbeinu_tam" }) });
    expect(patch.status).toBe(200);
    expect((await patch.json()).havdalahOpinion).toBe("rabbeinu_tam");

    // Persisted across reads.
    const after = await SELF.fetch("https://x/api/me", { headers: { cookie } });
    expect((await after.json()).havdalahOpinion).toBe("rabbeinu_tam");
  });

  it("rejects an invalid opinion value", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/me", { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ havdalahOpinion: "nonsense" }) });
    expect(res.status).toBe(400);
  });
});
