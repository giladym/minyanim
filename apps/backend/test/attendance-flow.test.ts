import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T026 — request → approve → confirm → reveal happy path + decline; rsvp.closed after the cutoff;
// a re-join UPDATEs the soft-cancelled row (no duplicate). Also exercises GET /api/me/events.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

interface HostOpts { category?: "hosting" | "social"; capacity?: number | null; rsvpCutoff?: number | null }
async function hostGathering(cookie: string, opts: HostOpts = {}): Promise<string> {
  const category = opts.category ?? "hosting";
  const body = {
    type: "gathering", category, title: "מפגש", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
    addressPrivate: "Secret St 5", addressNotes: "Ring twice", eventDate: EVENT_DATE,
    capacity: opts.capacity ?? 8, rsvpCutoff: opts.rsvpCutoff ?? null,
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
const decline = (cookie: string, id: string, attId: string) =>
  SELF.fetch(`https://x/api/events/${id}/requests/${attId}/decline`, { method: "POST", headers: { ...J, cookie } });

describe("T026 request → approve → confirm → reveal", () => {
  it("request stays pending until the host approves, then the address is revealed", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting" });
    const g = await signIn();

    expect((await (await join(g, id, 2)).json()).myStatus).toBe("pending");
    expect("addressPrivate" in (await (await getEvent(g, id)).json())).toBe(false); // hidden while pending

    const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string; partySize: number }>;
    expect(reqs).toHaveLength(1);
    expect(reqs[0].partySize).toBe(2);

    expect((await approve(host, id, reqs[0].attendanceId)).status).toBe(200);
    const revealed = await (await getEvent(g, id)).json();
    expect(revealed.myStatus).toBe("confirmed");
    expect(revealed.addressPrivate).toBe("Secret St 5"); // revealed post-approval
  });

  it("a declined requester never sees the address", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting" });
    const g = await signIn();
    await join(g, id, 3);
    const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string }>;
    expect((await decline(host, id, reqs[0].attendanceId)).status).toBe(200);

    const dto = await (await getEvent(g, id)).json();
    expect(dto.myStatus).toBe("declined");
    expect("addressPrivate" in dto).toBe(false);
  });

  it("rejects a join after the RSVP cutoff has passed (rsvp.closed)", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "social", rsvpCutoff: Date.now() - 60_000 });
    const res = await join(await signIn(), id, 2);
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("rsvp.closed");
  });

  it("a re-join after a soft cancel UPDATEs the same row (no duplicate)", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "social", capacity: 10 });
    const a = await signIn();
    expect((await (await join(a, id, 2)).json()).myStatus).toBe("confirmed");
    expect((await cancelAtt(a, id)).status).toBe(200);
    expect((await (await join(a, id, 3)).json()).myStatus).toBe("confirmed"); // re-join UPDATEs the row
    expect((await join(a, id, 1)).status).toBe(409); // now live → duplicate rejected (still one row)
    expect((await (await getEvent(host, id)).json()).confirmedCount).toBe(3); // the single row, resized
  });

  it("GET /api/me/events groups hosting vs attending with a pending-request badge", async () => {
    const host = await signIn();
    const id = await hostGathering(host, { category: "hosting" });
    const g = await signIn();
    await join(g, id, 2); // pending request

    const hostView = await (await SELF.fetch("https://x/api/me/events", { headers: { cookie: host } })).json();
    const hosted = hostView.hosting.find((e: { id: string }) => e.id === id);
    expect(hosted).toBeTruthy();
    expect(hosted.pendingRequestCount).toBe(1); // approval-mode badge
    expect(hostView.attending.find((e: { id: string }) => e.id === id)).toBeUndefined();

    const guestView = await (await SELF.fetch("https://x/api/me/events", { headers: { cookie: g } })).json();
    const attending = guestView.attending.find((e: { id: string }) => e.id === id);
    expect(attending).toBeTruthy();
    expect(attending.myStatus).toBe("pending");
    expect(guestView.hosting).toHaveLength(0);
  });
});
