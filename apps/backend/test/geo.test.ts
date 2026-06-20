import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { reverseGeocode, searchPlaces } from "../src/services/geoService";
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

  it("searches globally in every language (never restricts by country) and uses the normalized query (m13)", async () => {
    const urls: string[] = [];
    const fetchStub = async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(mapTilerBody()), { status: 200, headers: J });
    };
    const heQ = `לונדון-${crypto.randomUUID()}`;
    await searchPlaces(liveEnv, `  ${heQ.toUpperCase()}  `, "he", { fetch: fetchStub });
    await searchPlaces(liveEnv, `Paris-${crypto.randomUUID()}`, "en", { fetch: fetchStub });
    // Travel product: a Hebrew search must reach places outside Israel — no country filter, ever.
    expect(urls[0]).not.toContain("country=il");
    expect(urls[0]).toContain("language=he");
    expect(urls[1]).not.toContain("country=il");
    expect(urls[1]).toContain("language=en");
    // The request path uses the trimmed/lowercased query (same string as the cache key).
    expect(urls[0]).toContain(encodeURIComponent(heQ.toLowerCase()));
  });

  it("reverse-geocodes coordinates to the nearest place (lng,lat order, rounded, no country filter)", async () => {
    const urls: string[] = [];
    const fetchStub = async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(mapTilerBody()), { status: 200, headers: J });
    };
    // A unique lng (5dp) per run keeps the Cache API from returning a prior reverse result.
    const lng = -0.1 - parseInt(crypto.randomUUID().slice(0, 4), 16) / 1e6;
    const out = await reverseGeocode(liveEnv, 51.5074, lng, "he", { fetch: fetchStub });
    expect(out.results[0].city).toBe("London");
    // MapTiler reverse takes `{lng},{lat}` (rounded to 5dp) — lng before lat in the path.
    expect(urls[0]).toContain(`/geocoding/${lng.toFixed(5)},51.50740.json`);
    expect(urls[0]).not.toContain("country=il");
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

describe("GET /api/geo/reverse (route)", () => {
  it("401 without a session", async () => {
    const res = await SELF.fetch("https://x/api/geo/reverse?lat=51.5&lng=-0.12");
    expect(res.status).toBe(401);
  });

  it("400 geo.invalid_coords for out-of-range coordinates", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/geo/reverse?lat=999&lng=-0.12", { headers: { cookie } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0].code).toBe("geo.invalid_coords");
  });

  it("returns canned results for an authed user with valid coordinates", async () => {
    const cookie = await signIn();
    const res = await SELF.fetch("https://x/api/geo/reverse?lat=51.5074&lng=-0.1278&lang=en", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].city).toBe("London");
  });
});
