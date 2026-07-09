import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { LayerDTO, PlaceDTO, PlacesResponse } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signInAs(email: string): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
const req = (cookie: string, method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://x${path}`, { method, headers: { ...J, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });

const LON = { lat: 51.5074, lng: -0.1278 };

describe("GET /api/places (010 US1)", () => {
  it("returns active-layer places near a point, excludes far + retired ones", async () => {
    const admin = await signInAs("admin@example.com");
    const layer = (await (await req(admin, "POST", "/api/admin/layers", { name: `worship-${crypto.randomUUID()}` })).json()) as LayerDTO;

    // A place ~at London, and one far away (New York).
    await req(admin, "POST", "/api/admin/places", { layerId: layer.id, name: "בית כנסת מרכזי", lat: LON.lat, lng: LON.lng });
    await req(admin, "POST", "/api/admin/places", { layerId: layer.id, name: "Far Shul", lat: 40.71, lng: -74.0 });

    const user = await signInAs(`u-${crypto.randomUUID()}@example.com`);
    const near = (await (await req(user, "GET", `/api/places?lat=${LON.lat}&lng=${LON.lng}`)).json()) as PlacesResponse;
    const names = near.places.map((p) => p.name);
    expect(names).toContain("בית כנסת מרכזי");
    expect(names).not.toContain("Far Shul");
    expect(near.layers.some((l) => l.id === layer.id)).toBe(true);

    // Retire the layer → its places drop out of the user view.
    await req(admin, "PATCH", `/api/admin/layers/${layer.id}`, { active: false });
    const after = (await (await req(user, "GET", `/api/places?lat=${LON.lat}&lng=${LON.lng}`)).json()) as PlacesResponse;
    expect(after.places.some((p) => p.name === "בית כנסת מרכזי")).toBe(false);
    expect(after.layers.some((l) => l.id === layer.id)).toBe(false);
  });

  it("400s on missing/invalid coordinates", async () => {
    const user = await signInAs(`u-${crypto.randomUUID()}@example.com`);
    expect((await req(user, "GET", "/api/places")).status).toBe(400);
    expect((await req(user, "GET", "/api/places?lat=999&lng=0")).status).toBe(400);
  });

  it("requires auth", async () => {
    expect((await SELF.fetch(`https://x/api/places?lat=${LON.lat}&lng=${LON.lng}`)).status).toBe(401);
  });

  it("GET /api/layers returns only active layers", async () => {
    const user = await signInAs(`u-${crypto.randomUUID()}@example.com`);
    const res = (await (await req(user, "GET", "/api/layers")).json()) as { layers: LayerDTO[] };
    expect(res.layers.every((l) => l.active)).toBe(true);
  });
});
