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
