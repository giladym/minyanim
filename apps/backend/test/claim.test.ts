import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { ClaimableSeedDTO, OwnerStayDTO } from "@minyanim/shared";
import { createDb } from "../src/db/client";
import { user, phoneNumber, stay } from "../src/db/schema";

const J = { "content-type": "application/json" };

async function signIn(): Promise<{ cookie: string; id: string }> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const id = ((await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()) as { id: string }).id;
  return { cookie, id };
}

const addPhone = (cookie: string, e164: string) =>
  SELF.fetch("https://x/api/me/phones", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ e164, label: null }) });

/** Insert a seed (imported) user with a phone + one stay, directly via the DB (no auth account). */
async function seedUser(e164: string): Promise<string> {
  const db = createDb(env.DB);
  const id = `seed_${crypto.randomUUID()}`;
  await db.insert(user).values({ id, name: "מיובא", email: `${id}@seed.local`, kind: "seed", createdAt: new Date(), updatedAt: new Date() });
  await db.insert(phoneNumber).values({ id: crypto.randomUUID(), userId: id, e164, label: null, createdAt: new Date() });
  await db.insert(stay).values({
    id: crypto.randomUUID(), userId: id, city: "פריז", country: "צרפת", lat: 48.85, lng: 2.35,
    arrivalDate: new Date(Date.UTC(2030, 7, 1)), departureDate: new Date(Date.UTC(2030, 7, 10)),
    numMen: 2, bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: true, mincha: false, maariv: false } },
    status: "active", createdAt: new Date(), updatedAt: new Date(),
  });
  return id;
}

const PHONE = "+972501112222";

describe("seed-user claim (F4)", () => {
  it("offers a phone-matched seed, then merges its stay into the account and deletes the seed", async () => {
    const a = await signIn();
    expect((await addPhone(a.cookie, PHONE)).status).toBe(201);
    const seedId = await seedUser(PHONE);

    // Preview: the seed shows up as claimable with its trip count.
    const claims = (await (await SELF.fetch("https://x/api/me/claims", { headers: { cookie: a.cookie } })).json()) as { seeds: ClaimableSeedDTO[] };
    expect(claims.seeds).toHaveLength(1);
    expect(claims.seeds[0]!.seedUserId).toBe(seedId);
    expect(claims.seeds[0]!.stays).toBe(1);

    // Confirm the claim → the stay moves to A.
    const res = await SELF.fetch("https://x/api/me/claims", { method: "POST", headers: { ...J, cookie: a.cookie }, body: JSON.stringify({ seedUserIds: [seedId] }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claimed: 1, stays: 1 });

    // A now owns the (Paris) stay; the seed + its claim offer are gone.
    const stays = (await (await SELF.fetch("https://x/api/stays", { headers: { cookie: a.cookie } })).json()) as { stays: OwnerStayDTO[] };
    expect(stays.stays.some((s) => s.city === "פריז")).toBe(true);
    const after = (await (await SELF.fetch("https://x/api/me/claims", { headers: { cookie: a.cookie } })).json()) as { seeds: ClaimableSeedDTO[] };
    expect(after.seeds).toHaveLength(0);
  });

  it("does not offer (or claim) a seed whose phone doesn't match", async () => {
    const a = await signIn();
    await addPhone(a.cookie, "+972503334444");
    const seedId = await seedUser("+972509998888"); // different number

    const claims = (await (await SELF.fetch("https://x/api/me/claims", { headers: { cookie: a.cookie } })).json()) as { seeds: ClaimableSeedDTO[] };
    expect(claims.seeds).toHaveLength(0);

    // Even a forged POST for that id claims nothing (server re-verifies the phone match).
    const res = await SELF.fetch("https://x/api/me/claims", { method: "POST", headers: { ...J, cookie: a.cookie }, body: JSON.stringify({ seedUserIds: [seedId] }) });
    expect(await res.json()).toMatchObject({ claimed: 0 });
  });

  it("offers nothing when the user has no phone", async () => {
    const a = await signIn();
    await seedUser("+972501112222");
    const claims = (await (await SELF.fetch("https://x/api/me/claims", { headers: { cookie: a.cookie } })).json()) as { seeds: ClaimableSeedDTO[] };
    expect(claims.seeds).toHaveLength(0);
  });
});
