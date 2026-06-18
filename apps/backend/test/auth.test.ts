import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const post = (path: string, body: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const newEmail = () => `u-${crypto.randomUUID()}@example.com`;

describe("email/password auth (verification off in test)", () => {
  it("registers then signs in and sets a session cookie", async () => {
    const email = newEmail();
    const signUp = await post("/api/auth/sign-up/email", { name: "Test", email, password: "password123" });
    expect(signUp.ok).toBe(true);

    const signIn = await post("/api/auth/sign-in/email", { email, password: "password123" });
    expect(signIn.ok).toBe(true);
    expect(signIn.headers.get("set-cookie") ?? "").toContain("session");
  });

  it("rejects a wrong password", async () => {
    const email = newEmail();
    await post("/api/auth/sign-up/email", { name: "Test", email, password: "password123" });
    const bad = await post("/api/auth/sign-in/email", { email, password: "wrong-password" });
    expect(bad.ok).toBe(false);
  });

  it("does not reveal whether an email exists on reset (no enumeration)", async () => {
    const res = await post("/api/auth/request-password-reset", {
      email: "definitely-not-registered@example.com",
      redirectTo: "/reset-password",
    });
    expect(res.status).toBe(200);
  });
});
