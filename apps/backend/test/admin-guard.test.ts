import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

/** Register + sign in a user with a specific email; return the session cookie. */
async function signInAs(email: string): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const adminMe = (cookie?: string) =>
  SELF.fetch("https://x/api/admin/me", { headers: cookie ? { cookie } : {} });

// The test env sets ADMIN_EMAILS="admin@example.com" (vitest.config.ts).
describe("admin guard (010)", () => {
  it("promotes an allowlisted email and grants access", async () => {
    const cookie = await signInAs(`admin@example.com`);
    const res = await adminMe(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isAdmin: true });
  });

  it("refuses a non-allowlisted user with 403", async () => {
    const cookie = await signInAs(`u-${crypto.randomUUID()}@example.com`);
    expect((await adminMe(cookie)).status).toBe(403);
  });

  it("refuses a signed-out caller with 401", async () => {
    expect((await adminMe()).status).toBe(401);
  });

  it("does not let a non-admin self-promote via PATCH /api/me", async () => {
    const cookie = await signInAs(`u-${crypto.randomUUID()}@example.com`);
    // isAdmin is input:false + absent from updateProfileSchema — the field is ignored, not applied.
    const patch = await SELF.fetch("https://x/api/me", { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ isAdmin: true }) });
    expect(patch.status).toBe(200);
    expect((await adminMe(cookie)).status).toBe(403);
  });
});
