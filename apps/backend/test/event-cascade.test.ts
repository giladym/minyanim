import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { event, gathering, attendance } from "../src/db/schema";

const J = { "content-type": "application/json" };

async function signIn(): Promise<{ cookie: string; id: string }> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const cookie = cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const id = (await (await SELF.fetch("https://x/api/me", { headers: { cookie } })).json()).id as string;
  return { cookie, id };
}

async function hostEvent(cookie: string): Promise<string> {
  const body = {
    type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, addressPrivate: null, addressNotes: null,
    eventDate: Date.UTC(2030, 0, 5), notes: null,
    minyan: { nusach: "ashkenaz", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }] },
    hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const count = async (sql: string, ...binds: string[]): Promise<number> =>
  (((await env.DB.prepare(sql).bind(...binds).first()) as { n: number }).n);

describe("account deletion cascades all 003 data (zero orphans)", () => {
  it("removes events/minyan/attendance/roles/notifications/flags for a deleted host", async () => {
    const host = await signIn();
    const eventId = await hostEvent(host.cookie); // event + minyan + host self-attendance
    const b = await signIn();
    await SELF.fetch(`https://x/api/events/${eventId}/commit`, { method: "POST", headers: { ...J, cookie: b.cookie }, body: JSON.stringify({ numMen: 9 }) }); // → quorum: host gets a notification
    await SELF.fetch(`https://x/api/events/${eventId}/roles/baal_korei`, { method: "POST", headers: { ...J, cookie: host.cookie }, body: "{}" }); // host claims a role
    await SELF.fetch(`https://x/api/events/${eventId}/flag`, { method: "POST", headers: { ...J, cookie: host.cookie }, body: JSON.stringify({ reason: "spam" }) }); // host flags (006: reason required)

    expect(await count("SELECT COUNT(*) n FROM event WHERE host_user_id = ?", host.id)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM minyan WHERE event_id = ?", eventId)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM attendance WHERE event_id = ?", eventId)).toBe(2); // host + B
    expect(await count("SELECT COUNT(*) n FROM event_role WHERE user_id = ?", host.id)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM notification WHERE recipient_user_id = ?", host.id)).toBeGreaterThan(0);
    expect(await count("SELECT COUNT(*) n FROM flag WHERE user_id = ?", host.id)).toBe(1);

    const del = await SELF.fetch("https://x/api/me", { method: "DELETE", headers: { ...J, cookie: host.cookie }, body: JSON.stringify({ confirm: true }) });
    expect(del.status).toBe(200);

    // Everything owned by, or hanging off the host's event, is gone — no orphans.
    expect(await count("SELECT COUNT(*) n FROM event WHERE host_user_id = ?", host.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM minyan WHERE event_id = ?", eventId)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM attendance WHERE event_id = ?", eventId)).toBe(0); // incl. B's (cascade via event)
    expect(await count("SELECT COUNT(*) n FROM event_role WHERE user_id = ?", host.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM notification WHERE recipient_user_id = ?", host.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM flag WHERE user_id = ?", host.id)).toBe(0);
  });

  it("cascades a gathering detail row + its attendances when the event is deleted (014)", async () => {
    // A gathering event isn't yet creatable via the wire (US1), so seed it directly, then delete the
    // parent event and assert the gathering detail + attendance children are removed (FK cascade).
    const host = await signIn();
    const guest = await signIn();
    const db = createDb(env.DB);
    const eventId = `evt_${crypto.randomUUID()}`;
    const now = new Date();
    await db.insert(event).values({
      id: eventId, type: "gathering", category: "hosting", hostUserId: host.id, title: "סעודת שבת",
      city: "פריז", country: "צרפת", lat: 48.85, lng: 2.35, eventDate: new Date(Date.UTC(2030, 0, 5)),
      rsvpMode: "approval", visibility: "public", capacity: 8, status: "forming", hidden: false,
      createdAt: now, updatedAt: now,
    });
    await db.insert(gathering).values({ eventId, attrs: { mealType: "shabbat_dinner", kashrut: "glatt", dietary: [], alcohol: false } });
    await db.insert(attendance).values({
      id: `att_${crypto.randomUUID()}`, eventId, userId: guest.id, partySize: 2, status: "pending",
      requestedAt: now, createdAt: now, updatedAt: now,
    });

    expect(await count("SELECT COUNT(*) n FROM gathering WHERE event_id = ?", eventId)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM attendance WHERE event_id = ?", eventId)).toBe(1);

    await db.delete(event).where(eq(event.id, eventId));

    expect(await count("SELECT COUNT(*) n FROM gathering WHERE event_id = ?", eventId)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM attendance WHERE event_id = ?", eventId)).toBe(0);
  });

  it("cascades attendance when the attendee's account is deleted (014)", async () => {
    const host = await signIn();
    const guest = await signIn();
    const db = createDb(env.DB);
    const eventId = `evt_${crypto.randomUUID()}`;
    const now = new Date();
    await db.insert(event).values({
      id: eventId, type: "gathering", category: "social", hostUserId: host.id, title: "קידוש",
      city: "פריז", country: "צרפת", lat: 48.85, lng: 2.35, eventDate: new Date(Date.UTC(2030, 0, 5)),
      rsvpMode: "open", visibility: "public", capacity: null, status: "forming", hidden: false,
      createdAt: now, updatedAt: now,
    });
    await db.insert(gathering).values({ eventId, attrs: { subcategory: "kiddush" } });
    await db.insert(attendance).values({
      id: `att_${crypto.randomUUID()}`, eventId, userId: guest.id, partySize: 3, status: "confirmed",
      requestedAt: now, createdAt: now, updatedAt: now,
    });
    expect(await count("SELECT COUNT(*) n FROM attendance WHERE user_id = ?", guest.id)).toBe(1);

    const del = await SELF.fetch("https://x/api/me", { method: "DELETE", headers: { ...J, cookie: guest.cookie }, body: JSON.stringify({ confirm: true }) });
    expect(del.status).toBe(200);

    // The guest's attendance cascades away; the host's event + gathering detail survive.
    expect(await count("SELECT COUNT(*) n FROM attendance WHERE user_id = ?", guest.id)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM event WHERE id = ?", eventId)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM gathering WHERE event_id = ?", eventId)).toBe(1);
  });
});
