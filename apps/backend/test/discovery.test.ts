import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { createDb } from "../src/db/client";
import { user, stay, event, minyan, attendance, phoneNumber } from "../src/db/schema";
import type { MinyanService } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

function ymd(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

/** Insert a standalone seed user (host / committer), returning its id. */
async function seedUser(db: ReturnType<typeof createDb>): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name: "מארח",
    email: `h-${id}@example.com`,
    emailVerified: true,
    language: "he",
    theme: "system",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

const LON = { lat: 51.5074, lng: -0.1278 };

describe("GET /api/discovery", () => {
  it("401 without a session", async () => {
    const res = await SELF.fetch("https://x/api/discovery?lat=51.5&lng=-0.12&from=0&to=1");
    expect(res.status).toBe(401);
  });

  it("returns per-Shabbat potential + hosted minyanim (address-free), excluding completed/hidden", async () => {
    const cookie = await signIn();
    const db = createDb(env.DB);
    const hostId = await seedUser(db);

    // Two active Stays near London spanning a 7-day window (exactly one Saturday) → potential 10.
    for (const numMen of [4, 6]) {
      await db.insert(stay).values({
        id: crypto.randomUUID(),
        userId: hostId,
        city: "London",
        country: "UK",
        lat: 51.51,
        lng: -0.13,
        arrivalDate: ymd(2027, 8, 2),
        departureDate: ymd(2027, 8, 8),
        numMen,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // A hosted minyan in the bbox (future) with one commitment of 10 men.
    const evId = crypto.randomUUID();
    const services: MinyanService[] = [{ tefilla: "shacharit", time: "08:30" }, { tefilla: "mincha", time: null }];
    await db.insert(event).values({
      id: evId, type: "minyan", hostUserId: hostId, city: "London", country: "UK",
      lat: 51.5, lng: -0.12, addressPrivate: "12 Secret St", eventDate: ymd(2027, 8, 7),
      notes: "קומה 2", status: "forming", hidden: false, createdAt: new Date(), updatedAt: new Date(),
    });
    await db.insert(minyan).values({ eventId: evId, nusach: "ashkenaz", seferTorah: true, services });
    await db.insert(attendance).values({
      id: crypto.randomUUID(), eventId: evId, userId: hostId, partySize: 10, status: "confirmed", stayId: null,
      requestedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });

    // A completed (past) and a hidden minyan — both must be excluded.
    for (const [past, hidden] of [[true, false], [false, true]] as const) {
      const id = crypto.randomUUID();
      await db.insert(event).values({
        id, type: "minyan", hostUserId: hostId, city: "London", country: "UK",
        lat: 51.5, lng: -0.12, addressPrivate: null,
        eventDate: past ? ymd(2020, 1, 4) : ymd(2027, 8, 14),
        notes: null, status: "forming", hidden, createdAt: new Date(), updatedAt: new Date(),
      });
      await db.insert(minyan).values({ eventId: id, nusach: "any", seferTorah: false, services: [{ tefilla: "maariv", time: null }] });
    }

    const res = await SELF.fetch(`https://x/api/discovery?lat=${LON.lat}&lng=${LON.lng}&from=${ymd(2027, 8, 1).getTime()}&to=${ymd(2027, 8, 31).getTime()}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();

    // Potential: one Saturday bucket, 10 men (Sefer-Torah moved off the location in 015).
    expect(body.potential.length).toBe(1);
    expect(body.potential[0].menCount).toBe(10);

    // Exactly the one active future minyan (completed + hidden excluded). With only minyanim seeded,
    // the generalized `events` field contains just that minyan (US2 — gatherings could also appear).
    expect(body.events.length).toBe(1);
    const m = body.events[0];
    expect(m.id).toBe(evId);
    expect(m.committedMen).toBe(10);
    // ≥10 committed ⇒ quorum reached; "ready" further needs a Ba'al Korei iff it's Shabbat-Shacharit
    // (depends on whether eventDate is a Saturday) — so assert quorum is reached either way.
    expect(["quorum-reached", "ready"]).toContain(m.status);
    expect(m).not.toHaveProperty("addressPrivate");
    expect(m).not.toHaveProperty("hostContact");
    expect(m.services.length).toBe(2);
    expect(body.attribution).toContain("MapTiler");
    // The caller is NOT the host here (a seeded user is) → not flagged as their own (#2).
    expect(m.viewerIsHost).toBeFalsy();
  });

  it("flags the caller's own hosted minyan with viewerIsHost (#2)", async () => {
    const cookie = await signIn();
    const SAT = ymd(2030, 1, 5); // 5 Jan 2030 (future ⇒ not completed)
    await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({
      type: "minyan", city: "London", country: "UK", lat: LON.lat, lng: LON.lng, eventDate: SAT.getTime(),
      minyan: { nusach: "any", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] }, hostNumMen: 2,
    }) });

    const res = await SELF.fetch(`https://x/api/discovery?lat=${LON.lat}&lng=${LON.lng}&from=${ymd(2030, 1, 1).getTime()}&to=${ymd(2030, 1, 31).getTime()}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    const mine = body.events.find((mm: { viewerIsHost?: boolean }) => mm.viewerIsHost);
    expect(mine).toBeTruthy();
  });

  it("surfaces traveler contact in potential: sharer's phone, imported per-stay contact, opt-out hidden", async () => {
    const cookie = await signIn();
    const db = createDb(env.DB);
    const mkStay = async (userId: string, extra: Record<string, unknown>) =>
      db.insert(stay).values({
        id: crypto.randomUUID(), userId, city: "London", country: "UK", lat: 51.51, lng: -0.13,
        arrivalDate: ymd(2027, 8, 2), departureDate: ymd(2027, 8, 8), numMen: 2, status: "active",
        createdAt: new Date(), updatedAt: new Date(), ...extra,
      });

    // Registered traveler who shares a phone (default) → phone appears.
    const sharer = await seedUser(db);
    await db.insert(phoneNumber).values({ id: crypto.randomUUID(), userId: sharer, e164: "+972501112222", label: null, createdAt: new Date() });
    await mkStay(sharer, {});

    // Registered traveler who opted OUT + has a phone → phone hidden.
    const optOut = crypto.randomUUID();
    await db.insert(user).values({ id: optOut, name: "מסרב", email: `o-${optOut}@example.com`, emailVerified: true, language: "he", theme: "system", sharePhone: false, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(phoneNumber).values({ id: crypto.randomUUID(), userId: optOut, e164: "+972505556666", label: null, createdAt: new Date() });
    await mkStay(optOut, {});

    // Imported traveler: a seeded stay carrying its own contact (no account of their own).
    const importer = await seedUser(db);
    await mkStay(importer, { contactName: "Imported Guy", contactPhone: "+972999888777" });

    const res = await SELF.fetch(`https://x/api/discovery?lat=${LON.lat}&lng=${LON.lng}&from=${ymd(2027, 8, 1).getTime()}&to=${ymd(2027, 8, 31).getTime()}`, { headers: { cookie } });
    const body = await res.json();
    const travelers = body.potential[0].travelers as { name: string; phone: string | null }[];
    expect(travelers.find((t) => t.phone === "+972501112222")).toBeTruthy(); // sharer
    expect(travelers.find((t) => t.name === "Imported Guy")?.phone).toBe("+972999888777"); // imported
    expect(travelers.find((t) => t.name === "מסרב")?.phone).toBeNull(); // opted out
  });
});
