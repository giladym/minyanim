import { SELF } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import type { OwnerStayDTO } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** Coordless stay (tz pins to UTC → deterministic isPast). Creation requires a non-past arrival,
 * so "past" states are realized by advancing the clock after creation (no past-dated inserts). */
const body = (arrival: number, departure: number) => ({
  city: "פראג",
  country: "צ׳כיה",
  arrivalDate: arrival,
  departureDate: departure,
  numMen: 2,
  bringsSeferTorah: false,
  prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
});

const create = (cookie: string, arrival: number, departure: number) =>
  SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body(arrival, departure)) }).then((r) => r.json()) as Promise<OwnerStayDTO>;

const active = (cookie: string) =>
  SELF.fetch("https://x/api/stays?scope=active", { headers: { ...J, cookie } }).then((r) => r.json()) as Promise<{ stays: OwnerStayDTO[] }>;
const history = (cookie: string) =>
  SELF.fetch("https://x/api/stays?scope=history", { headers: { ...J, cookie } }).then((r) => r.json()) as Promise<{ stays: OwnerStayDTO[]; nextCursor: string | null }>;

afterEach(() => vi.useRealTimers());

describe("scope=active|history truth table (004 D1/D2, SC-002/SC-003)", () => {
  it("places upcoming on the dashboard, past 'attended' + cancelled in History — derived, no job", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    const cookie = await signIn();

    const upcoming = await create(cookie, Date.UTC(2026, 7, 1), Date.UTC(2026, 7, 3)); // Aug — stays future
    const willBePast = await create(cookie, Date.UTC(2026, 5, 20), Date.UTC(2026, 5, 23)); // dep 23 Jun
    const cancelled = await create(cookie, Date.UTC(2026, 7, 10), Date.UTC(2026, 7, 12)); // future…
    await SELF.fetch(`https://x/api/stays/${cancelled.id}/cancel`, { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({ confirm: true }) });

    // Advance past willBePast's departure (23 Jun), still before the August upcoming one.
    vi.setSystemTime(new Date("2026-06-25T12:00:00Z"));

    const a = await active(cookie);
    expect(a.stays.map((s) => s.id)).toEqual([upcoming.id]); // only the upcoming one

    const h = await history(cookie);
    const byId = Object.fromEntries(h.stays.map((s) => [s.id, s.historyTag]));
    expect(byId[willBePast.id]).toBe("attended");
    expect(byId[cancelled.id]).toBe("cancelled"); // cancelled wins, even though dates are future
    expect(byId[upcoming.id]).toBeUndefined(); // upcoming not in history
  });

  it("a stay spanning today stays active and is absent from History (D14)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    const cookie = await signIn();
    const spanning = await create(cookie, Date.UTC(2026, 5, 20), Date.UTC(2026, 5, 23)); // 20–23 Jun

    // Now it's the 21st: arrival past, departure (23rd) still future → spanning.
    vi.setSystemTime(new Date("2026-06-21T12:00:00Z"));
    expect((await active(cookie)).stays.map((s) => s.id)).toContain(spanning.id);
    expect((await history(cookie)).stays.map((s) => s.id)).not.toContain(spanning.id);
  });

  it("moves a stay to History on the next read once its departure passes — no job (SC-002)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    const cookie = await signIn();
    const s = await create(cookie, Date.UTC(2026, 5, 25), Date.UTC(2026, 5, 27)); // 25–27 Jun (future)
    expect((await active(cookie)).stays.map((x) => x.id)).toContain(s.id);

    // Advance past its departure — no write, just a later read.
    vi.setSystemTime(new Date("2026-06-28T12:00:00Z"));
    expect((await active(cookie)).stays.map((x) => x.id)).not.toContain(s.id);
    const h = await history(cookie);
    expect(h.stays.find((x) => x.id === s.id)?.historyTag).toBe("attended");
  });
});
