import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { searchPlaces } from "../src/services/geoService";
import type { Env } from "../src/env";

const J = { "content-type": "application/json" };

/** Register + sign in, returning the session cookie header. */
async function signIn(): Promise<string> {
  const email = `u-${crypto.randomUUID()}@example.com`;
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

/** A MapTiler-shaped geocoding response with one usable feature. */
function mapTilerBody() {
  return {
    type: "FeatureCollection",
    features: [
      {
        text: "London",
        place_name: "London, United Kingdom",
        center: [-0.1278, 51.5074],
        context: [{ id: "country.1", text: "United Kingdom" }],
      },
      // A feature with no center is dropped during normalization.
      { text: "Nowhere", place_name: "Nowhere" },
    ],
  };
}

// The test env defaults GEO_MODE=mock (for the route); the provider-path service tests need the
// LIVE code path, so they override it back to "live".
const liveEnv = { ...(env as unknown as Env), GEO_MODE: "live" } as Env;

describe("geoService.searchPlaces (injected provider)", () => {
  it("normalizes provider features and returns attribution", async () => {
    const fetchStub = async () =>
      new Response(JSON.stringify(mapTilerBody()), { status: 200, headers: J });
    // Unique query avoids the Cache API returning a prior test's result.
    const out = await searchPlaces(liveEnv, `london-${crypto.randomUUID()}`, "en", { fetch: fetchStub });
    expect(out.attribution).toBe("© MapTiler © OpenStreetMap contributors");
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toEqual({ city: "London", country: "United Kingdom", lat: 51.5074, lng: -0.1278, label: "London, United Kingdom" });
  });

  it("throws 502 geo.unavailable on a provider non-2xx", async () => {
    const fetchStub = async () => new Response("nope", { status: 500 });
    await expect(searchPlaces(liveEnv, `down-${crypto.randomUUID()}`, "en", { fetch: fetchStub })).rejects.toMatchObject({ status: 502 });
  });

  it("throws 502 geo.unavailable when the provider fetch throws", async () => {
    const fetchStub = async () => {
      throw new Error("network");
    };
    await expect(searchPlaces(liveEnv, `boom-${crypto.randomUUID()}`, "en", { fetch: fetchStub })).rejects.toMatchObject({ status: 502 });
  });

  it("returns the canned result without a network call when GEO_MODE=mock", async () => {
    let called = false;
    const fetchStub = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };
    const out = await searchPlaces({ ...(env as unknown as Env), GEO_MODE: "mock" }, "anything", "en", { fetch: fetchStub });
    expect(called).toBe(false);
    expect(out.results[0].city).toBe("London");
  });
});

// The route runs with GEO_MODE=mock in tests (set in vitest.config.ts) — no live MapTiler call.
describe("GET /api/geo/search (route)", () => {
  it("401 without a session", async () => {
    const res = await SELF.fetch("https://x/api/geo/search?q=london&lang=en");
    expect(res.status).toBe(401);
  });

  it("returns canned results for an authed user", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/geo/search?q=london&lang=en", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attribution).toContain("MapTiler");
    expect(body.results[0].city).toBe("London");
  });
});
