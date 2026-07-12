import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// T039 (confirm) + T040 (US3) — a SOCIAL gathering is just the `gathering` behavior with the social
// category variant: the create path applies `defaultRsvpMode='open'` (CATEGORY_META.social) when the
// body omits `rsvpMode`, validates the social attrs ({subcategory}) via ATTRS_BY_CATEGORY.social, and
// the shared open-mode attendance machine auto-confirms under capacity / waitlists past it / promotes
// the earliest-that-fits on a confirmed cancel. It also surfaces in discovery as
// `type='gathering' category='social'`, and gates the private address behind a confirmed attendance
// (SC-003) while still exposing the social attrs (subcategory) publicly.

const J = { "content-type": "application/json" };
const LON = { lat: 51.5074, lng: -0.1278 };
const EVENT_DATE = Date.UTC(2030, 0, 5); // future ⇒ not "completed"
const FROM = Date.UTC(2030, 0, 1);
const TO = Date.UTC(2030, 0, 31);

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

interface SocialOpts { subcategory?: string; capacity?: number | null; rsvpMode?: string }
async function hostSocial(cookie: string, opts: SocialOpts = {}): Promise<Response> {
  const body: Record<string, unknown> = {
    type: "gathering", category: "social", title: "קידוש קהילתי", city: "London", country: "UK",
    lat: LON.lat, lng: LON.lng, addressPrivate: "Secret St 5", addressNotes: "Ring twice, code 1234",
    eventDate: EVENT_DATE, capacity: opts.capacity ?? null,
    gathering: { subcategory: opts.subcategory ?? "kiddush" }, hostNumMen: 1,
  };
  if (opts.rsvpMode !== undefined) body.rsvpMode = opts.rsvpMode;
  return SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) });
}

const join = (cookie: string, id: string, partySize: number) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ partySize }) });
const cancelAtt = (cookie: string, id: string) =>
  SELF.fetch(`https://x/api/events/${id}/attendance`, { method: "DELETE", headers: { cookie } });
const getEvent = (cookie: string, id: string) => SELF.fetch(`https://x/api/events/${id}`, { headers: { cookie } });
const myStatus = async (cookie: string, id: string) => (await (await getEvent(cookie, id)).json()).myStatus as string;

describe("T039/T040 — social gathering (open RSVP by default)", () => {
  it("T039: create applies rsvp_mode='open' by default + validates social attrs (subcategory)", async () => {
    const host = await signIn();
    const res = await hostSocial(host, { capacity: 4, subcategory: "party" });
    expect(res.status).toBe(201);
    const created = await res.json();

    // The create response is assembled by re-reading the persisted row (getEvent), so these assert
    // what actually landed in the DB — no `rsvpMode` was sent, so the social default was applied.
    expect(created.type).toBe("gathering");
    expect(created.category).toBe("social");
    expect(created.rsvpMode).toBe("open"); // CATEGORY_META.social.defaultRsvpMode
    expect(created.visibility).toBe("public");
    expect(created.capacity).toBe(4);
    expect(created.attrs.subcategory).toBe("party"); // validated + persisted

    // A fresh, independent read confirms persistence of the applied default.
    const refetched = await (await getEvent(host, created.id)).json();
    expect(refetched.rsvpMode).toBe("open");
    expect(refetched.attrs.subcategory).toBe("party");
  });

  it("T039: an invalid social subcategory is rejected (gathering.attrs_invalid)", async () => {
    const host = await signIn();
    const res = await hostSocial(host, { subcategory: "not-a-real-subcategory" });
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("gathering.attrs_invalid");
  });

  it("T040: open-mode join auto-confirms under capacity, waitlists past it, promotes on cancel", async () => {
    const host = await signIn();
    const id = (await (await hostSocial(host, { capacity: 5 })).json()).id;
    const a = await signIn();
    const b = await signIn();
    const c = await signIn();

    // First joiner fits → auto-confirmed (no host approval in open mode).
    expect((await (await join(a, id, 3)).json()).myStatus).toBe("confirmed"); // sum 3
    // Past capacity → waitlisted.
    expect((await (await join(b, id, 3)).json()).myStatus).toBe("waitlisted"); // 3+3>5, earliest waitlisted
    // Later joiner that still fits under capacity → auto-confirmed.
    expect((await (await join(c, id, 2)).json()).myStatus).toBe("confirmed"); // 3+2=5 (full)

    const full = await (await getEvent(host, id)).json();
    expect(full.confirmedCount).toBe(5);
    expect(full.seatsRemaining).toBe(0);
    expect(full.status).toBe("full");

    // Cancelling a confirmed attendee frees seats and promotes the earliest waitlisted that FITS.
    expect((await cancelAtt(a, id)).status).toBe(200); // frees 3 → confirmed sum 2, remaining 3
    // b (size 3) now fits (2+3≤5) and is the earliest waitlisted → promoted to confirmed.
    expect(await myStatus(b, id)).toBe("confirmed");

    const afterPromote = await (await getEvent(host, id)).json();
    expect(afterPromote.confirmedCount).toBe(5); // c(2) + b(3)
    expect(afterPromote.seatsRemaining).toBe(0);
  });

  it("T040: unlimited capacity (null) auto-confirms every open-mode joiner", async () => {
    const host = await signIn();
    const id = (await (await hostSocial(host, { capacity: null })).json()).id;
    for (let i = 0; i < 3; i++) {
      expect((await (await join(await signIn(), id, 4)).json()).myStatus).toBe("confirmed");
    }
    const dto = await (await getEvent(host, id)).json();
    expect(dto.confirmedCount).toBe(12);
    expect(dto.seatsRemaining).toBe(null); // unlimited
    expect(dto.status).toBe("forming"); // never "full"
  });

  it("T040/SC-003: a non-confirmed viewer sees subcategory in attrs but NO private address", async () => {
    const host = await signIn();
    const id = (await (await hostSocial(host, { capacity: 8, subcategory: "farbrengen" })).json()).id;
    const viewer = await signIn(); // no attendance

    const dto = await (await getEvent(viewer, id)).json();
    expect(dto.category).toBe("social");
    expect(dto.attrs.subcategory).toBe("farbrengen"); // public social detail
    expect("addressPrivate" in dto).toBe(false); // structurally absent until confirmed
    expect("addressNotes" in dto).toBe(false);
    expect(dto.myStatus).toBe(null);

    // Once confirmed (open mode auto-confirms), the address is revealed.
    expect((await (await join(viewer, id, 2)).json()).myStatus).toBe("confirmed");
    const revealed = await (await getEvent(viewer, id)).json();
    expect(revealed.addressPrivate).toBe("Secret St 5");
    expect(revealed.addressNotes).toBe("Ring twice, code 1234");
  });

  it("T040: a social gathering appears in discovery as type='gathering' category='social'", async () => {
    const host = await signIn();
    const id = (await (await hostSocial(host, { capacity: 8 })).json()).id;
    const viewer = await signIn();

    const res = await SELF.fetch(`https://x/api/discovery?lat=${LON.lat}&lng=${LON.lng}&from=${FROM}&to=${TO}`, { headers: { cookie: viewer } });
    expect(res.status).toBe(200);
    const { events } = (await res.json()) as { events: { id: string; type: string; category: string | null }[] };
    const row = events.find((e) => e.id === id);
    expect(row).toBeTruthy();
    expect(row!.type).toBe("gathering");
    expect(row!.category).toBe("social");
  });
});
