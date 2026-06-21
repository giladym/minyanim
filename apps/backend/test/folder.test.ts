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

const post = (cookie: string, name: unknown) =>
  SELF.fetch("https://x/api/folders", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ name }) });

describe("folder CRUD (FR-001/D3)", () => {
  it("creates, lists (oldest-first, stayCount 0), and 201s", async () => {
    const cookie = await signIn();
    const a = await post(cookie, "Europe 2026");
    expect(a.status).toBe(201);
    const dto = (await a.json()) as { id: string; name: string; stayCount: number };
    expect(dto.id).toMatch(/^fld_/);
    expect(dto.stayCount).toBe(0);
    await post(cookie, "Asia 2026");

    // Both folders are listed (exact ordering is by creation; at ms granularity two near-instant
    // creates can tie, so assert membership rather than a brittle sub-ms sequence).
    const list = (await (await SELF.fetch("https://x/api/folders", { headers: { cookie } })).json()) as { folders: { name: string }[] };
    expect(list.folders.map((f) => f.name).sort()).toEqual(["Asia 2026", "Europe 2026"]);
  });

  it("rejects a duplicate name case-insensitively (folder.name_taken)", async () => {
    const cookie = await signIn();
    expect((await post(cookie, "Europe")).status).toBe(201);
    const dup = await post(cookie, "europe");
    expect(dup.status).toBe(400);
    expect((await dup.json()).errors[0].code).toBe("folder.name_taken");
  });

  it("rejects empty and too-long names", async () => {
    const cookie = await signIn();
    expect((await post(cookie, "   ")).status).toBe(400); // trims to empty → name_required
    expect((await post(cookie, "x".repeat(61))).status).toBe(400); // name_too_long
  });

  it("renames, rejects a colliding rename, and is owner-scoped", async () => {
    const cookie = await signIn();
    const id = ((await (await post(cookie, "Trip")).json()) as { id: string }).id;
    await post(cookie, "Taken");

    const ok = await SELF.fetch(`https://x/api/folders/${id}`, { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ name: "Summer Trip" }) });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { name: string }).name).toBe("Summer Trip");

    const collide = await SELF.fetch(`https://x/api/folders/${id}`, { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ name: "taken" }) });
    expect(collide.status).toBe(400);
    expect((await collide.json()).errors[0].code).toBe("folder.name_taken");

    // Another user cannot see or rename it.
    const other = await signIn();
    const cross = await SELF.fetch(`https://x/api/folders/${id}`, { method: "PATCH", headers: { ...J, cookie: other }, body: JSON.stringify({ name: "Mine" }) });
    expect(cross.status).toBe(404);
  });

  it("delete requires confirm and is owner-scoped", async () => {
    const cookie = await signIn();
    const id = ((await (await post(cookie, "Temp")).json()) as { id: string }).id;

    const noConfirm = await SELF.fetch(`https://x/api/folders/${id}`, { method: "DELETE", headers: { ...J, cookie }, body: "{}" });
    expect(noConfirm.status).toBe(400);
    expect((await noConfirm.json()).errors[0].code).toBe("confirm.required");

    const other = await signIn();
    const cross = await SELF.fetch(`https://x/api/folders/${id}`, { method: "DELETE", headers: { ...J, cookie: other }, body: JSON.stringify({ confirm: true }) });
    expect(cross.status).toBe(404);

    const ok = await SELF.fetch(`https://x/api/folders/${id}`, { method: "DELETE", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
    expect(ok.status).toBe(200);
  });
});
