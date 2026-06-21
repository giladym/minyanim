import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { OwnerStayDTO } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const create = (cookie: string) =>
  SELF.fetch("https://x/api/stays", {
    method: "POST",
    headers: { ...J, cookie },
    body: JSON.stringify({
      city: "מדריד",
      country: "ספרד",
      arrivalDate: Date.UTC(2027, 0, 10),
      departureDate: Date.UTC(2027, 0, 12),
      numMen: 2,
      bringsSeferTorah: false,
      prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    }),
  }).then((r) => r.json()) as Promise<OwnerStayDTO>;

const cancel = (cookie: string, id: string) =>
  SELF.fetch(`https://x/api/stays/${id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
const permaDelete = (cookie: string, id: string, body: unknown = { confirm: true }) =>
  SELF.fetch(`https://x/api/stays/${id}/permanent`, { method: "DELETE", headers: { ...J, cookie }, body: JSON.stringify(body) });

describe("permanent delete (004 D8 / SC-006)", () => {
  it("hard-deletes a cancelled stay", async () => {
    const cookie = await signIn();
    const s = await create(cookie);
    await cancel(cookie, s.id);
    const res = await permaDelete(cookie, s.id);
    expect(res.status).toBe(200);
    const row = (await env.DB.prepare("SELECT COUNT(*) AS n FROM stay WHERE id = ?").bind(s.id).first()) as { n: number };
    expect(row.n).toBe(0);
  });

  it("rejects permanent-delete of a non-cancelled (active) stay with stay.not_cancelled", async () => {
    const cookie = await signIn();
    const s = await create(cookie);
    const res = await permaDelete(cookie, s.id);
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("stay.not_cancelled");
  });

  it("requires confirm:true", async () => {
    const cookie = await signIn();
    const s = await create(cookie);
    await cancel(cookie, s.id);
    const res = await permaDelete(cookie, s.id, {});
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("confirm.required");
  });

  it("404s for another user's stay (no leak)", async () => {
    const owner = await signIn();
    const s = await create(owner);
    await cancel(owner, s.id);
    const attacker = await signIn();
    const res = await permaDelete(attacker, s.id);
    expect(res.status).toBe(404);
  });

  it("sets linked commitment.stay_id to NULL on hard delete (003 consistency)", async () => {
    const cookie = await signIn();
    const s = await create(cookie);
    await cancel(cookie, s.id);
    // Link a commitment to the (now cancelled) stay AFTER cancel, so the cancel-time reconcile
    // (which auto-withdraws commitments) doesn't remove it — isolating the FK SET NULL behavior.
    const userId = (await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()).id as string;
    await env.DB.prepare(
      "INSERT INTO event (id, type, host_user_id, city, country, lat, lng, event_date, status, hidden, created_at, updated_at) VALUES (?, 'minyan', ?, 'מדריד', 'ספרד', 40.4, -3.7, ?, 'forming', 0, ?, ?)",
    ).bind("evt_x", userId, Date.UTC(2027, 0, 11), Date.now(), Date.now()).run();
    await env.DB.prepare(
      "INSERT INTO commitment (id, event_id, user_id, num_men, stay_id, created_at, updated_at) VALUES ('cmt_x', 'evt_x', ?, 2, ?, ?, ?)",
    ).bind(userId, s.id, Date.now(), Date.now()).run();

    expect((await permaDelete(cookie, s.id)).status).toBe(200);

    // The commitment row survives (event still exists) with its stay_id nulled.
    const cmt = (await env.DB.prepare("SELECT stay_id FROM commitment WHERE id = 'cmt_x'").first()) as { stay_id: string | null } | null;
    expect(cmt).not.toBeNull();
    expect(cmt!.stay_id).toBeNull();
  });
});
