import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T024 — capacity + waitlist concurrency (SC-006): a `→confirmed` transition is always a single
// guarded SQL statement, so the confirmed party-size SUM can never exceed capacity, regardless of
// interleaving, variable party sizes, or a re-join race.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

interface HostOpts { category?: "hosting" | "social"; rsvpMode?: string; capacity?: number | null; rsvpCutoff?: number | null; addressPrivate?: string }
async function hostGathering(cookie: string, opts: HostOpts = {}): Promise<string> {
  const category = opts.category ?? "hosting";
  const body = {
    type: "gathering", category, title: "מפגש", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
    addressPrivate: opts.addressPrivate ?? "Secret St 5", addressNotes: "Ring twice", eventDate: EVENT_DATE,
    rsvpMode: opts.rsvpMode, capacity: opts.capacity ?? null, rsvpCutoff: opts.rsvpCutoff ?? null,
    gathering: category === "social" ? { subcategory: "kiddush" } : { mealType: "shabbat_dinner", kashrut: "glatt" },
    hostNumMen: 1,
  };
  const res = await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await res.json()).id;
}

const join = (cookie: string, id: string, partySize: number) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ partySize }) });
const cancelAtt = (cookie: string, id: string) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "DELETE", headers: { cookie } });
const getEvent = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } });
const listRequests = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}/requests`, { headers: { cookie } });
const approve = (cookie: string, id: string, attId: string) =>
  SELF.fetch(`https://x/api/events/${id}/requests/${attId}/approve`, { method: "POST", headers: { ...J, cookie } });

const myStatus = async (cookie: string, id: string) => (await (await getEvent(cookie, id)).json()).myStatus as string;

describe("T024 capacity + waitlist concurrency", () => {
  it("approval mode: approving beyond capacity fails capacity.full (variable party sizes)", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting", capacity: 4 }); // approval by default
    const g1 = await signIn();
    const g2 = await signIn();
    expect((await (await join(g1, id, 3)).json()).myStatus).toBe("pending");
    expect((await (await join(g2, id, 2)).json()).myStatus).toBe("pending");

    const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string; partySize: number }>;
    const a1 = reqs.find((r) => r.partySize === 3)!.attendanceId;
    const a2 = reqs.find((r) => r.partySize === 2)!.attendanceId;

    expect((await approve(host, id, a1)).status).toBe(200); // 3 ≤ 4
    const bad = await approve(host, id, a2); // 3 + 2 = 5 > 4
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors[0].code).toBe("capacity.full");
  });

  it("open mode: the (capacity+1)th confirm is impossible — confirmed sum never exceeds capacity", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "social", capacity: 4 }); // open by default
    expect((await (await join(await signIn(), id, 3)).json()).myStatus).toBe("confirmed"); // sum 3
    expect((await (await join(await signIn(), id, 2)).json()).myStatus).toBe("waitlisted"); // 3+2>4
    expect((await (await join(await signIn(), id, 1)).json()).myStatus).toBe("confirmed"); // 3+1=4
    expect((await (await join(await signIn(), id, 1)).json()).myStatus).toBe("waitlisted"); // 4+1>4

    const dto = await (await getEvent(host, id)).json();
    expect(dto.confirmedCount).toBe(4);
    expect(dto.seatsRemaining).toBe(0);
  });

  it("open mode: cancelling a confirmed seat promotes the EARLIEST waitlisted that still fits", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "social", capacity: 5 });
    const a = await signIn();
    const d = await signIn();
    const b = await signIn();
    const c = await signIn();
    expect((await (await join(a, id, 3)).json()).myStatus).toBe("confirmed"); // sum 3
    expect((await (await join(d, id, 2)).json()).myStatus).toBe("confirmed"); // sum 5 (full)
    expect((await (await join(b, id, 3)).json()).myStatus).toBe("waitlisted"); // earliest waitlisted, size 3
    expect((await (await join(c, id, 1)).json()).myStatus).toBe("waitlisted"); // later waitlisted, size 1

    expect((await cancelAtt(d, id)).status).toBe(200); // frees 2 → sum 3, remaining 2

    // b (size 3) does NOT fit (3+3>5); c (size 1) does (3+1≤5) → c promoted, b stays waitlisted.
    expect(await myStatus(c, id)).toBe("confirmed");
    expect(await myStatus(b, id)).toBe("waitlisted");
  });

  it("approval mode: a freed seat does NOT auto-confirm a pending request", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting", capacity: 4 });
    const g1 = await signIn();
    const g2 = await signIn();
    await join(g1, id, 4);
    await join(g2, id, 2);
    const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string; partySize: number }>;
    await approve(host, id, reqs.find((r) => r.partySize === 4)!.attendanceId); // g1 confirmed (sum 4)

    expect((await cancelAtt(g1, id)).status).toBe(200); // frees 4

    // Approval mode never auto-promotes — g2 is still pending, awaiting the host.
    expect(await myStatus(g2, id)).toBe("pending");
    const stillPending = (await (await listRequests(host, id)).json()).requests as unknown[];
    expect(stillPending).toHaveLength(1);
  });

  it("re-join after cancel UPDATEs the row and RECOMPUTES confirmed-vs-waitlisted", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "social", capacity: 4 });
    const a = await signIn();
    const b = await signIn();
    expect((await (await join(a, id, 4)).json()).myStatus).toBe("confirmed"); // sum 4
    expect((await cancelAtt(a, id)).status).toBe(200); // sum 0
    expect((await (await join(b, id, 3)).json()).myStatus).toBe("confirmed"); // sum 3
    // a re-joins (its row is terminal → UPDATE) with 3 → 3+3=6 > 4 → recomputed to waitlisted.
    expect((await (await join(a, id, 3)).json()).myStatus).toBe("waitlisted");
    // a is now live (waitlisted) → a duplicate live join is rejected (unique guard, no new row).
    expect((await join(a, id, 1)).status).toBe(409);
  });

  it("two concurrent first-joins by the same user → exactly one succeeds (unique guard)", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "social", capacity: 10 });
    const u = await signIn();
    const [r1, r2] = await Promise.all([join(u, id, 2), join(u, id, 2)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });
});
