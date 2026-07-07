import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { ConversationDTO, MessageDTO, Profile, ThreadDTO } from "@minyanim/shared";

const J = { "content-type": "application/json" };

/** Register + sign in a fresh user; return the session cookie + the user's id. */
async function signIn(): Promise<{ cookie: string; id: string }> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: `T-${email.slice(0, 6)}`, email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const me = (await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()) as Profile;
  return { cookie, id: me.id };
}

const send = (cookie: string, recipientUserId: string, body: string) =>
  SELF.fetch("https://x/api/messages", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ recipientUserId, body }) });

describe("POST/GET /api/messages (008)", () => {
  it("delivers a message: recipient sees it in the thread + conversation unread, then read clears", async () => {
    const a = await signIn();
    const b = await signIn();

    const sent = await send(a.cookie, b.id, "שלום, מתפללים יחד בשבת?");
    expect(sent.status).toBe(201);
    expect(((await sent.json()) as MessageDTO).mine).toBe(true);

    // B's inbox: one conversation with A, unread = 1, name populated from A's inbound message.
    const inbox = (await (await SELF.fetch("https://x/api/messages", { headers: { cookie: b.cookie } })).json()) as {
      conversations: ConversationDTO[];
      unread: number;
    };
    expect(inbox.unread).toBe(1);
    expect(inbox.conversations).toHaveLength(1);
    expect(inbox.conversations[0]!.userId).toBe(a.id);
    expect(inbox.conversations[0]!.unread).toBe(1);

    // Opening the thread marks it read.
    const thread = (await (await SELF.fetch(`https://x/api/messages/${a.id}`, { headers: { cookie: b.cookie } })).json()) as ThreadDTO;
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]!.mine).toBe(false);
    const after = (await (await SELF.fetch("https://x/api/messages", { headers: { cookie: b.cookie } })).json()) as { unread: number };
    expect(after.unread).toBe(0);
  });

  it("rejects messaging yourself (400 message.self)", async () => {
    const a = await signIn();
    const res = await send(a.cookie, a.id, "hi me");
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("message.self");
  });

  it("blocks sending to a user who opted out (403 message.opted_out)", async () => {
    const a = await signIn();
    const b = await signIn();
    const patch = await SELF.fetch("https://x/api/me", { method: "PATCH", headers: { ...J, cookie: b.cookie }, body: JSON.stringify({ acceptMessages: false }) });
    expect(patch.status).toBe(200);
    const res = await send(a.cookie, b.id, "hello");
    expect(res.status).toBe(403);
    expect((await res.json()).errors[0].code).toBe("message.opted_out");
  });

  it("404s messaging a non-existent user", async () => {
    const a = await signIn();
    const res = await send(a.cookie, "nope-does-not-exist", "hi");
    expect(res.status).toBe(404);
  });

  it("rate-limits a sender past 20 messages in the window (429)", async () => {
    const a = await signIn();
    const b = await signIn();
    for (let i = 0; i < 20; i++) {
      const ok = await send(a.cookie, b.id, `m${i}`);
      expect(ok.status).toBe(201);
    }
    const blocked = await send(a.cookie, b.id, "one too many");
    expect(blocked.status).toBe(429);
  });

  it("requires auth", async () => {
    const res = await SELF.fetch("https://x/api/messages", { method: "POST", headers: J, body: JSON.stringify({ recipientUserId: "x", body: "y" }) });
    expect(res.status).toBe(401);
  });
});
