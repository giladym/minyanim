import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };

async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

const VIENNA = { lat: 48.2082, lng: 16.3738 };
const SAT = Date.UTC(2030, 0, 5); // Sat 5 Jan 2030

const stay = (cookie: string, lat: number, lng: number) =>
  SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({
    city: "וינה", country: "אוסטריה", lat, lng,
    arrivalDate: Date.UTC(2030, 0, 3), departureDate: Date.UTC(2030, 0, 7), // covers 5 Jan
    numMen: 2, bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
  }) });

const host = (cookie: string) =>
  SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify({
    type: "minyan", city: "וינה", country: "אוסטריה", lat: VIENNA.lat, lng: VIENNA.lng, eventDate: SAT,
    minyan: { nusach: "any", seferTorah: false, services: [{ tefilla: "shacharit", time: "08:30" }] }, hostNumMen: 2,
  }) }).then((r) => r.json()) as Promise<{ id: string }>;

const kinds = (cookie: string) =>
  SELF.fetch("https://x/api/notifications", { headers: { cookie } }).then((r) => r.json())
    .then((d: { notifications: { kind: string }[] }) => d.notifications.map((n) => n.kind));

describe("host a minyan → nearby stay-havers notified (in-app)", () => {
  it("notifies a nearby person covering the date, excludes the host and far-away people", async () => {
    const near = await signIn();
    await stay(near, VIENNA.lat, VIENNA.lng); // active stay covering 5 Jan, in Vienna
    const far = await signIn();
    await stay(far, 40.7128, -74.006); // New York — outside the radius
    const hostCookie = await signIn();

    await host(hostCookie);

    expect(await kinds(near)).toContain("minyan_nearby");
    expect(await kinds(far)).not.toContain("minyan_nearby");
    expect(await kinds(hostCookie)).not.toContain("minyan_nearby"); // host excluded
  });

  it("does not notify someone whose stay doesn't cover the minyan's date", async () => {
    const other = await signIn();
    await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie: other }, body: JSON.stringify({
      city: "וינה", country: "אוסטריה", lat: VIENNA.lat, lng: VIENNA.lng,
      arrivalDate: Date.UTC(2030, 5, 1), departureDate: Date.UTC(2030, 5, 3), // June — not 5 Jan
      numMen: 2, bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
    }) });
    const hostCookie = await signIn();
    await host(hostCookie);
    expect(await kinds(other)).not.toContain("minyan_nearby");
  });
});
