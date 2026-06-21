import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const stayBody = (folderId?: string) => ({
  city: "לונדון",
  country: "בריטניה",
  lat: 51.5074,
  lng: -0.1278,
  arrivalDate: Date.UTC(2027, 0, 10),
  departureDate: Date.UTC(2027, 0, 12),
  numMen: 2,
  bringsSeferTorah: false,
  prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
  ...(folderId ? { folderId } : {}),
});

const me = (cookie: string) => SELF.fetch("https://x/api/me", { headers: { cookie } }).then((r) => r.json()).then((u: { id: string }) => u.id);
const mkFolder = (cookie: string, name: string) =>
  SELF.fetch("https://x/api/folders", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ name }) }).then((r) => r.json()).then((f: { id: string }) => f.id);
const mkStay = (cookie: string, folderId?: string) =>
  SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(stayBody(folderId)) });

describe("folder delete → Stays reassigned to Unfiled (FR-003/SC-004)", () => {
  it("clears folder_id on the folder's Stays, deleting no Stay", async () => {
    const cookie = await signIn();
    const fid = await mkFolder(cookie, "Europe");
    const s1 = ((await (await mkStay(cookie, fid)).json()) as { id: string }).id;
    await mkStay(cookie, fid);

    const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stay WHERE folder_id = ?").bind(fid).first()) as { n: number };
    expect(before.n).toBe(2);

    const del = await SELF.fetch(`https://x/api/folders/${fid}`, { method: "DELETE", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
    expect(del.status).toBe(200);

    // Stays survive, now Unfiled.
    const survivors = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stay WHERE id = ?").bind(s1).first()) as { n: number };
    expect(survivors.n).toBe(1);
    const unfiled = (await env.DB.prepare("SELECT folder_id FROM stay WHERE id = ?").bind(s1).first()) as { folder_id: string | null };
    expect(unfiled.folder_id).toBeNull();
  });
});

describe("cross-user folder assignment is rejected (R7/D6)", () => {
  it("404s when creating or moving a Stay into another user's folder", async () => {
    const owner = await signIn();
    const foreignFolder = await mkFolder(owner, "Owner's");

    const attacker = await signIn();
    const create = await mkStay(attacker, foreignFolder);
    expect(create.status).toBe(404);

    const myStay = ((await (await mkStay(attacker)).json()) as { id: string }).id;
    const move = await SELF.fetch(`https://x/api/stays/${myStay}`, { method: "PATCH", headers: { ...J, cookie: attacker }, body: JSON.stringify({ folderId: foreignFolder }) });
    expect(move.status).toBe(404);
  });
});

describe("account deletion cascades folders (extends FR-008/SC-007)", () => {
  it("removes all folder rows for a deleted user (zero orphans), Stays already cascade", async () => {
    const cookie = await signIn();
    const id = await me(cookie);
    const fid = await mkFolder(cookie, "Trip");
    await mkStay(cookie, fid);

    const del = await SELF.fetch("https://x/api/me", { method: "DELETE", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
    expect(del.status).toBe(200);

    const folders = (await env.DB.prepare("SELECT COUNT(*) AS n FROM folder WHERE user_id = ?").bind(id).first()) as { n: number };
    expect(folders.n).toBe(0);
  });
});
