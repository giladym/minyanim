import { SELF } from "cloudflare:test";
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

describe("/api/me", () => {
  it("returns 401 without a session", async () => {
    const res = await SELF.fetch("https://x/api/me");
    expect(res.status).toBe(401);
  });

  it("returns the profile and persists language/theme", async () => {
    const cookie = await signIn();
    const get = await SELF.fetch("https://x/api/me", { headers: { cookie } });
    expect(get.status).toBe(200);
    expect((await get.json()).language).toBe("he");

    const patch = await SELF.fetch("https://x/api/me", { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ language: "en", theme: "dark" }) });
    expect(patch.status).toBe(200);
    const after = await patch.json();
    expect(after.language).toBe("en");
    expect(after.theme).toBe("dark");
  });
});

describe("/api/me/phones", () => {
  it("adds a valid phone and rejects a non-E.164 one", async () => {
    const cookie = await signIn();
    const ok = await SELF.fetch("https://x/api/me/phones", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ e164: "+972501234567", label: "נייד" }) });
    expect(ok.status).toBe(201);

    const bad = await SELF.fetch("https://x/api/me/phones", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ e164: "0501234567" }) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors[0].code).toBe("phone.invalid_e164");
  });

  it("deletes an owned phone (204) and 404s for an unknown id", async () => {
    const cookie = await signIn();
    const created = await (await SELF.fetch("https://x/api/me/phones", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ e164: "+14155550100" }) })).json();
    const del = await SELF.fetch(`https://x/api/me/phones/${created.id}`, { method: "DELETE", headers: { cookie } });
    expect(del.status).toBe(204);
    const del2 = await SELF.fetch("https://x/api/me/phones/nope", { method: "DELETE", headers: { cookie } });
    expect(del2.status).toBe(404);
  });
});
