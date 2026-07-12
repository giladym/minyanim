import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T042a — host edit + cancel generalized to a gathering (FR-012): editing generic axes + attrs,
// the capacity-reduce-below-confirmed guard, and cancel voiding attendances + notifying guests.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

interface HostOpts { category?: "hosting" | "social"; capacity?: number | null }
async function hostGathering(cookie: string, opts: HostOpts = {}): Promise<string> {
  const category = opts.category ?? "hosting";
  const body = {
    type: "gathering", category, title: "מפגש", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
    addressPrivate: "Secret St 5", addressNotes: "Ring twice", eventDate: EVENT_DATE,
    capacity: opts.capacity ?? 8,
    gathering: category === "social" ? { subcategory: "kiddush" } : { mealType: "shabbat_dinner", kashrut: "glatt" },
    hostNumMen: 1,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()).id;
}

const patch = (cookie: string, id: string, body: unknown) =>
  SELF.fetch(`https://x/api/events/${id}`, { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify(body) });
const getEvent = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } });
const join = (cookie: string, id: string, partySize: number) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ partySize }) });
const listRequests = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}/requests`, { headers: { cookie } });
const approve = (cookie: string, id: string, attId: string) =>
  SELF.fetch(`https://x/api/events/${id}/requests/${attId}/approve`, { method: "POST", headers: { ...J, cookie } });

/** Sign a guest in, request `size` seats, and have the host approve → confirmed. */
async function confirmGuest(host: string, id: string, size: number): Promise<string> {
  const g = await signIn();
  await join(g, id, size);
  const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string; partySize: number }>;
  const mine = reqs.find((r) => r.partySize === size)!;
  expect((await approve(host, id, mine.attendanceId)).status).toBe(200);
  return g;
}

async function inboxKinds(cookie: string): Promise<string[]> {
  const body = await (await SELF.fetch("https://x/api/notifications", { headers: { cookie } })).json();
  return body.notifications.map((n: { kind: string }) => n.kind);
}

describe("T042a — edit a hosting gathering", () => {
  it("edits seats (capacity) and gathering attrs; 404 for a non-host", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting", capacity: 8 });

    const res = await patch(host, id, { capacity: 12, title: "סעודה", gathering: { mealType: "shabbat_lunch", kashrut: "kosher" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.capacity).toBe(12);
    expect(body.seatsRemaining).toBe(12); // no confirmed guests yet
    expect(body.title).toBe("סעודה");
    expect(body.attrs.kashrut).toBe("kosher"); // attrs re-validated + persisted
    expect(body.attrs.mealType).toBe("shabbat_lunch");

    const other = await signIn();
    expect((await patch(other, id, { capacity: 20 })).status).toBe(404);
  });

  it("rejects reducing capacity below the confirmed party-size sum (capacity.invalid)", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting", capacity: 8 });
    await confirmGuest(host, id, 4); // 4 confirmed seats

    const bad = await patch(host, id, { capacity: 3 }); // below the confirmed sum
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors[0].code).toBe("capacity.invalid");

    // Reducing to exactly the confirmed sum is allowed (does not bump anyone off).
    const ok = await patch(host, id, { capacity: 4 });
    expect(ok.status).toBe(200);
    expect((await ok.json()).capacity).toBe(4);
  });
});

describe("T042a — cancel a hosting gathering", () => {
  it("voids attendances + notifies confirmed guests", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting", capacity: 8 });
    const guest = await confirmGuest(host, id, 2);
    expect((await (await getEvent(host, id)).json()).confirmedCount).toBe(2);

    const res = await SELF.fetch(`https://x/api/events/${id}/cancel`, { method: "POST", headers: { ...J, cookie: host }, body: JSON.stringify({ confirm: true }) });
    expect(res.status).toBe(200);

    // Confirmed guest is notified of the cancellation…
    expect(await inboxKinds(guest)).toContain("cancelled");
    // …the event flips to cancelled and its attendances are voided (deleted).
    expect((await (await getEvent(host, id)).json()).status).toBe("cancelled");
    const remaining = (await env.DB.prepare("SELECT count(*) AS n FROM attendance WHERE event_id = ?").bind(id).first()) as { n: number };
    expect(remaining.n).toBe(0);
  });
});
