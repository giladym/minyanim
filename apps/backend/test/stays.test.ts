import { SELF, env } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDb } from "../src/db/client";
import { createStay as svcCreate, updateStay as svcUpdate } from "../src/services/stayService";

const J = { "content-type": "application/json" };

/** Register + sign in, returning the session cookie header. */
async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** Epoch-ms at UTC midnight for a YYYY-MM-DD civil date. */
function utcMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

/** A valid create body far enough in the future to pass the temporal check. */
function futureStay(overrides: Record<string, unknown> = {}) {
  return {
    city: "לונדון",
    country: "בריטניה",
    lat: 51.5074,
    lng: -0.1278,
    arrivalDate: utcMidnight(2027, 1, 10),
    departureDate: utcMidnight(2027, 1, 12),
    numMen: 3,
    ...overrides,
  };
}

describe("POST /api/stays (create + structural validation)", () => {
  it("401 without a session", async () => {
    const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: J, body: JSON.stringify(futureStay()) });
    expect(res.status).toBe(401);
  });

  it("creates a stay (201) with derived isPast/coversShabbat", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay()) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.city).toBe("לונדון");
    expect(body.numMen).toBe(3);
    expect(body.status).toBe("active");
    expect(body.isPast).toBe(false);
    // Jan 10–12 2027: Jan 10 is a Sunday, Jan 11 Mon, Jan 12 Tue — no Shabbat.
    expect(body.coversShabbat).toBe(false);
  });

  it("computes coversShabbat=true when the range spans a Friday/Saturday", async () => {
    const cookie = await signIn();
    // Jan 15 2027 is a Friday, Jan 16 a Saturday.
    const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ arrivalDate: utcMidnight(2027, 1, 15), departureDate: utcMidnight(2027, 1, 16) })) });
    expect((await res.json()).coversShabbat).toBe(true);
  });

  it("rejects missing location (location.required)", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ city: "" })) });
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("location.required");
  });

  it("rejects numMen < 1 (num_men.too_low)", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ numMen: 0 })) });
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0].code).toBe("num_men.too_low");
  });

  it("rejects departure before arrival (date.range_invalid)", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ arrivalDate: utcMidnight(2027, 1, 12), departureDate: utcMidnight(2027, 1, 10) })) });
    expect(res.status).toBe(400);
    const errs = (await res.json()).errors;
    expect(errs.some((e: { code: string }) => e.code === "date.range_invalid")).toBe(true);
  });
});

describe("GET /api/stays (list, nearest-first, active only)", () => {
  it("returns the user's active stays sorted by arrival ASC, excluding cancelled", async () => {
    const cookie = await signIn();
    // Insert out of order.
    await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ city: "C", arrivalDate: utcMidnight(2027, 3, 1), departureDate: utcMidnight(2027, 3, 2) })) });
    await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ city: "A", arrivalDate: utcMidnight(2027, 1, 1), departureDate: utcMidnight(2027, 1, 2) })) });
    const toCancel = await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay({ city: "B", arrivalDate: utcMidnight(2027, 2, 1), departureDate: utcMidnight(2027, 2, 2) })) })).json();
    await SELF.fetch(`https://x/api/stays/${toCancel.id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });

    const list = await (await SELF.fetch("https://x/api/stays", { headers: { cookie } })).json();
    expect(list.stays.map((s: { city: string }) => s.city)).toEqual(["A", "C"]);
  });
});

describe("GET /api/stays/:id (ownership)", () => {
  it("returns an owned stay and 404s for another user's", async () => {
    const cookieA = await signIn();
    const created = await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie: cookieA }, body: JSON.stringify(futureStay()) })).json();
    const get = await SELF.fetch(`https://x/api/stays/${created.id}`, { headers: { cookie: cookieA } });
    expect(get.status).toBe(200);

    const cookieB = await signIn();
    const cross = await SELF.fetch(`https://x/api/stays/${created.id}`, { headers: { cookie: cookieB } });
    expect(cross.status).toBe(404);
  });
});

describe("PATCH /api/stays/:id (update)", () => {
  it("updates numMen + city and reflects in the response", async () => {
    const cookie = await signIn();
    const created = await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay()) })).json();
    const res = await SELF.fetch(`https://x/api/stays/${created.id}`, { method: "PATCH", headers: { ...J, cookie }, body: JSON.stringify({ numMen: 9, city: "מנצ׳סטר" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.numMen).toBe(9);
    expect(body.city).toBe("מנצ׳סטר");
  });

  it("404s when updating a stay you don't own", async () => {
    const cookieA = await signIn();
    const created = await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie: cookieA }, body: JSON.stringify(futureStay()) })).json();
    const cookieB = await signIn();
    const res = await SELF.fetch(`https://x/api/stays/${created.id}`, { method: "PATCH", headers: { ...J, cookie: cookieB }, body: JSON.stringify({ numMen: 2 }) });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/stays/:id/cancel (soft cancel + confirm guard)", () => {
  it("requires confirm:true (confirm.required) then soft-cancels (drops off active list)", async () => {
    const cookie = await signIn();
    const created = await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(futureStay()) })).json();

    const noConfirm = await SELF.fetch(`https://x/api/stays/${created.id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({}) });
    expect(noConfirm.status).toBe(400);
    expect((await noConfirm.json()).errors[0].code).toBe("confirm.required");

    const ok = await SELF.fetch(`https://x/api/stays/${created.id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });
    expect(ok.status).toBe(200);
    expect((await ok.json()).ok).toBe(true);

    const list = await (await SELF.fetch("https://x/api/stays", { headers: { cookie } })).json();
    expect(list.stays.find((s: { id: string }) => s.id === created.id)).toBeUndefined();
  });

  it("404s when cancelling a stay you don't own", async () => {
    const cookieA = await signIn();
    const created = await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie: cookieA }, body: JSON.stringify(futureStay()) })).json();
    const cookieB = await signIn();
    const res = await SELF.fetch(`https://x/api/stays/${created.id}/cancel`, { method: "POST", headers: { ...J, cookie: cookieB }, body: JSON.stringify({ confirm: true }) });
    expect(res.status).toBe(404);
  });
});

// Temporal validation crosses the international date boundary: a date that is "today" in
// Jerusalem can already be "yesterday" in New York. Uses vi.setSystemTime + the REAL tz-lookup
// (coords drive the tz) to assert destination-local rejection.
//
// These exercise the SERVICE layer directly (not the HTTP route): vi.setSystemTime installs fake
// timers process-wide, which stalls better-auth's async session check (→ spurious 401s). The
// service is the unit that owns the temporal rule, so we seed a real user row, call the service
// against the real D1, and assert the AppError code — the tz math is what's under test.
describe("temporal validation (destination-local 'today', real tz-lookup)", () => {
  afterEach(() => vi.useRealTimers());

  /** Insert a bare user row (FK target) and return its id. */
  async function seedUser(): Promise<string> {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO user (id, name, email, email_verified, language, theme, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(id, "T", `${id}@example.com`, 0, "he", "system", Date.now(), Date.now())
      .run();
    return id;
  }

  const NY = { lat: 40.7128, lng: -74.006 };
  const baseStay = {
    city: "New York",
    country: "United States",
    numMen: 2,
  } as const;

  /** Anchor "now" at `hourUtc` of an arbitrary fixed date. */
  function anchorNow(hourUtc: number): Date {
    return new Date(Date.UTC(2027, 0, 10, hourUtc, 0, 0));
  }
  /** Epoch-ms at UTC midnight `offsetDays` from a base instant's UTC civil date. */
  function dayOffset(base: Date, offsetDays: number): number {
    return Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + offsetDays * 86_400_000;
  }

  it("rejects an arrival before the destination-local today", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(23); // 23:00 UTC → NY (UTC-5) is still "today".
    vi.setSystemTime(now);
    await expect(
      svcCreate(db, userId, { ...baseStay, ...NY, arrivalDate: dayOffset(now, -1), departureDate: dayOffset(now, -1) }),
    ).rejects.toMatchObject({ status: 400, errors: [{ code: "date.in_past", field: "arrivalDate" }] });
  });

  it("accepts an arrival equal to the destination-local today", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(23); // NY is still on the base civil date → arrival = base day is allowed.
    vi.setSystemTime(now);
    const dto = await svcCreate(db, userId, { ...baseStay, ...NY, arrivalDate: dayOffset(now, 0), departureDate: dayOffset(now, 1) });
    expect(dto.id).toBeTruthy();
    expect(dto.city).toBe("New York");
  });

  it("uses X-Client-Timezone when the stay has no coordinates", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(3); // 03:00 UTC → Los Angeles (UTC-8) is still the *previous* civil date.
    vi.setSystemTime(now);
    await expect(
      svcCreate(db, userId, { ...baseStay, lat: null, lng: null, arrivalDate: dayOffset(now, -2), departureDate: dayOffset(now, -2) }, "America/Los_Angeles"),
    ).rejects.toMatchObject({ status: 400, errors: [{ code: "date.in_past" }] });

    const ok = await svcCreate(db, userId, { ...baseStay, lat: null, lng: null, arrivalDate: dayOffset(now, 1), departureDate: dayOffset(now, 2) }, "America/Los_Angeles");
    expect(ok.id).toBeTruthy();
  });

  it("blocks moving an arrival into the past on edit", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(12);
    vi.setSystemTime(now);
    const created = await svcCreate(db, userId, { ...baseStay, ...NY, arrivalDate: dayOffset(now, 10), departureDate: dayOffset(now, 12) });
    await expect(
      svcUpdate(db, userId, created.id, { arrivalDate: dayOffset(now, -9) }),
    ).rejects.toMatchObject({ status: 400, errors: [{ code: "date.in_past", field: "arrivalDate" }] });
  });

  // M1 — a far-positive client tz (UTC+14) picking "today" in that tz must NOT be rejected as past,
  // while a clearly-past date IS rejected. Manual-entry (null coords) so X-Client-Timezone drives.
  it("accepts a coordless stay for 'today' in a far-positive client tz (Pacific/Kiritimati)", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    // 23:00 UTC: Kiritimati (UTC+14) is already on the NEXT civil date. "Today" there = base+1.
    const now = anchorNow(23);
    vi.setSystemTime(now);
    const kiritimatiToday = dayOffset(now, 1);
    const dto = await svcCreate(
      db,
      userId,
      { ...baseStay, lat: null, lng: null, arrivalDate: kiritimatiToday, departureDate: kiritimatiToday },
      "Pacific/Kiritimati",
    );
    expect(dto.id).toBeTruthy();
    expect(dto.isPast).toBe(false);
  });

  it("rejects a clearly-past coordless stay in a far-positive client tz", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(23);
    vi.setSystemTime(now);
    await expect(
      svcCreate(
        db,
        userId,
        { ...baseStay, lat: null, lng: null, arrivalDate: dayOffset(now, -5), departureDate: dayOffset(now, -5) },
        "Pacific/Kiritimati",
      ),
    ).rejects.toMatchObject({ status: 400, errors: [{ code: "date.in_past", field: "arrivalDate" }] });
  });

  // M2 — single-field departure PATCH must re-validate the EFFECTIVE pair (the Zod refine only
  // fires when both dates are in the body), and must block moving departure into the past.
  it("rejects a departure-only PATCH that precedes the existing arrival (date.range_invalid)", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(12);
    vi.setSystemTime(now);
    const created = await svcCreate(db, userId, { ...baseStay, ...NY, arrivalDate: dayOffset(now, 10), departureDate: dayOffset(now, 12) });
    await expect(
      svcUpdate(db, userId, created.id, { departureDate: dayOffset(now, 9) }),
    ).rejects.toMatchObject({ status: 400, errors: [{ code: "date.range_invalid", field: "departureDate" }] });
  });

  it("rejects a departure-only PATCH moved into the past (date.in_past on departureDate)", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    // Create while the dates are still valid, then advance "now" so the stay started in the past.
    const created = await svcCreate(db, userId, { ...baseStay, ...NY, arrivalDate: dayOffset(anchorNow(12), 0), departureDate: dayOffset(anchorNow(12), 12) });
    // Jump 30 days ahead: the existing arrival is now in the past (untouched, so not re-checked).
    const later = new Date(anchorNow(12).getTime() + 30 * 86_400_000);
    vi.setSystemTime(later);
    // Patch departure to a date that is ≥ arrival (avoids range_invalid) but before today.
    await expect(
      svcUpdate(db, userId, created.id, { departureDate: dayOffset(anchorNow(12), 5) }),
    ).rejects.toMatchObject({ status: 400, errors: [{ code: "date.in_past", field: "departureDate" }] });
  });

  it("accepts a valid departure-only PATCH", async () => {
    const db = createDb(env.DB);
    const userId = await seedUser();
    const now = anchorNow(12);
    vi.setSystemTime(now);
    const created = await svcCreate(db, userId, { ...baseStay, ...NY, arrivalDate: dayOffset(now, 10), departureDate: dayOffset(now, 12) });
    const updated = await svcUpdate(db, userId, created.id, { departureDate: dayOffset(now, 20) });
    expect(updated?.departureDate).toBe(dayOffset(now, 20));
  });
});
