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

const create = (cookie: string, arrival: number, departure: number) =>
  SELF.fetch("https://x/api/stays", {
    method: "POST",
    headers: { ...J, cookie },
    body: JSON.stringify({
      city: "וינה",
      country: "אוסטריה",
      arrivalDate: arrival,
      departureDate: departure,
      numMen: 2,
      bringsSeferTorah: false,
      prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    }),
  }).then((r) => r.json()) as Promise<OwnerStayDTO>;

const page = (cookie: string, limit: number, cursor?: string) =>
  SELF.fetch(`https://x/api/stays?scope=history&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, {
    headers: { ...J, cookie },
  }).then((r) => r.json()) as Promise<{ stays: OwnerStayDTO[]; nextCursor: string | null }>;

afterEach(() => vi.useRealTimers());

describe("History keyset pagination (004 R5/SC-005)", () => {
  it("returns complete, newest-first, non-duplicated pages across the boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    const cookie = await signIn();

    // 5 stays departing on distinct dates 24–28 Jun (created future, valid). After the clock moves
    // to 30 Jun they're all past → history-eligible (attended).
    const ids: string[] = [];
    for (const d of [24, 25, 26, 27, 28]) ids.push((await create(cookie, Date.UTC(2026, 5, 20), Date.UTC(2026, 5, d))).id);

    // A stay departing 30 Jun — at read time "today". Coarse SQL includes it (< tomorrow UTC) but
    // the tz refine drops it (isPast=false): it must NEVER appear in History, and the loop must
    // still fill complete pages around it.
    const todayStay = await create(cookie, Date.UTC(2026, 5, 20), Date.UTC(2026, 5, 30));

    // Read as of 30 Jun: the five 24–28 Jun stays are past; the 30 Jun one is "today".
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));

    // Paginate with limit=2 → expect 3 pages (2,2,1), 5 rows total.
    const collected: OwnerStayDTO[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const p = await page(cookie, 2, cursor);
      collected.push(...p.stays);
      cursor = p.nextCursor ?? undefined;
      pages++;
      expect(pages).toBeLessThanOrEqual(5); // guard against an infinite loop
    } while (cursor);

    // Complete: all 5 eligible, none duplicated, today-stay excluded.
    expect(collected.map((s) => s.id).sort()).toEqual([...ids].sort());
    expect(new Set(collected.map((s) => s.id)).size).toBe(5);
    expect(collected.map((s) => s.id)).not.toContain(todayStay.id);

    // Newest-departure first across the whole set.
    const deps = collected.map((s) => s.departureDate);
    expect(deps).toEqual([...deps].sort((a, b) => b - a));

    // Every emitted row is genuinely history.
    expect(collected.every((s) => s.historyTag === "attended")).toBe(true);
  });
});
