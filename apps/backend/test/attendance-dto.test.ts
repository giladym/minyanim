import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T025 — per-type DTO non-exposure (SC-003 / A8). Private fields (address / entry notes / exact
// coords / email) are STRUCTURALLY ABSENT until the viewer is confirmed. For a HOSTING gathering the
// named attendee list is host/confirmed-only — a non-confirmed viewer gets `attendees:null` + count.

const J = { "content-type": "application/json" };
const EVENT_DATE = Date.UTC(2030, 0, 5);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function hostHosting(cookie: string): Promise<string> {
  const body = {
    type: "gathering", category: "hosting", title: "סעודת שבת", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
    addressPrivate: "Secret St 5", addressNotes: "Ring twice, code 1234", eventDate: EVENT_DATE, capacity: 8,
    gathering: { mealType: "shabbat_dinner", kashrut: "glatt" }, hostNumMen: 1,
  };
  return (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

const join = (cookie: string, id: string, partySize: number) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ partySize }) });
const getEvent = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } });
const listRequests = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}/requests`, { headers: { cookie } });
const approve = (cookie: string, id: string, attId: string) =>
  SELF.fetch(`https://x/api/events/${id}/requests/${attId}/approve`, { method: "POST", headers: { ...J, cookie } });

describe("T025 per-type DTO non-exposure", () => {
  it("a pending hosting requester gets address/entry-notes/email absent + attendees withheld", async () => {
    const host = await signIn();
    const id = await hostHosting(host);
    const g = await signIn();
    expect((await (await join(g, id, 2)).json()).myStatus).toBe("pending");

    const dto = await (await getEvent(g, id)).json();
    expect("addressPrivate" in dto).toBe(false); // structurally absent (RosterGatheringDTO)
    expect("addressNotes" in dto).toBe(false);
    expect(dto.attendees).toBe(null); // hosting: named list withheld from a non-confirmed viewer (A8)
    expect(dto.confirmedCount).toBe(0);
    expect(dto.hostContact.email).toBe(null); // email is confirmed-only
    expect(dto.myStatus).toBe("pending");
  });

  it("a confirmed guest + the host see the exact address, entry notes and attendee emails", async () => {
    const host = await signIn();
    const id = await hostHosting(host);
    const g = await signIn();
    await join(g, id, 2);
    const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string }>;
    expect((await approve(host, id, reqs[0].attendanceId)).status).toBe(200);

    const guestDto = await (await getEvent(g, id)).json();
    expect(guestDto.addressPrivate).toBe("Secret St 5"); // revealed on confirm
    expect(guestDto.addressNotes).toBe("Ring twice, code 1234");
    expect(guestDto.lat).toBe(49.3); // exact (un-fuzzed) coords for a confirmed viewer
    expect(Array.isArray(guestDto.attendees)).toBe(true);
    expect(guestDto.attendees.some((a: { email: string | null }) => a.email)).toBe(true);
    expect(guestDto.myStatus).toBe("confirmed");

    const hostDto = await (await getEvent(host, id)).json();
    expect(hostDto.isHost).toBe(true);
    expect(hostDto.addressPrivate).toBe("Secret St 5");
    expect(Array.isArray(hostDto.pendingRequests)).toBe(true);
  });

  it("a signed-in NON-confirmed viewer of a hosting gathering gets attendees:null + confirmedCount", async () => {
    const host = await signIn();
    const id = await hostHosting(host);
    const g = await signIn();
    await join(g, id, 2);
    const reqs = (await (await listRequests(host, id)).json()).requests as Array<{ attendanceId: string }>;
    await approve(host, id, reqs[0].attendanceId); // g confirmed → confirmedCount 2

    const viewer = await signIn(); // no attendance
    const dto = await (await getEvent(viewer, id)).json();
    expect("addressPrivate" in dto).toBe(false);
    expect(dto.attendees).toBe(null); // still withheld — this viewer is not confirmed
    expect(dto.confirmedCount).toBe(2); // aggregate count instead of names (A8)
    expect(dto.myStatus).toBe(null);
  });
});
