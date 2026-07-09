import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { LayerDTO, PlaceDTO } from "@minyanim/shared";

const J = { "content-type": "application/json" };

async function signInAs(email: string): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "T", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
const req = (cookie: string, method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://x${path}`, { method, headers: { ...J, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });

// vitest.config sets ADMIN_EMAILS="admin@example.com".
describe("admin layers & places CRUD (010 US2)", () => {
  it("an admin manages layers and places end-to-end", async () => {
    const a = await signInAs("admin@example.com");

    // Create a layer.
    const created = await req(a, "POST", "/api/admin/layers", { name: "מסעדות", icon: "restaurant" });
    expect(created.status).toBe(201);
    const layer = (await created.json()) as LayerDTO;
    expect(layer.name).toBe("מסעדות");

    // Duplicate name (case-insensitive) → 400 layer.name_taken.
    const dup = await req(a, "POST", "/api/admin/layers", { name: "מסעדות" });
    expect(dup.status).toBe(400);
    expect((await dup.json()).errors[0].code).toBe("layer.name_taken");

    // Rename it.
    const renamed = await req(a, "PATCH", `/api/admin/layers/${layer.id}`, { name: "מסעדות כשרות" });
    expect(((await renamed.json()) as LayerDTO).name).toBe("מסעדות כשרות");

    // Create a place under it.
    const madePlace = await req(a, "POST", "/api/admin/places", {
      layerId: layer.id, name: "פיצה כשרה", lat: 48.87, lng: 2.35, address: "1 Rue", kosherMeta: { dietary: "dairy" },
    });
    expect(madePlace.status).toBe(201);
    const place = (await madePlace.json()) as PlaceDTO;
    expect(place.layerId).toBe(layer.id);
    expect(place.kosherMeta).toEqual({ dietary: "dairy" });

    // Deleting a layer that still has places is refused.
    const delBlocked = await req(a, "DELETE", `/api/admin/layers/${layer.id}`);
    expect(delBlocked.status).toBe(400);
    expect((await delBlocked.json()).errors[0].code).toBe("layer.has_places");

    // Delete the place, then the layer succeeds.
    expect((await req(a, "DELETE", `/api/admin/places/${place.id}`)).status).toBe(204);
    expect((await req(a, "DELETE", `/api/admin/layers/${layer.id}`)).status).toBe(204);
  });

  it("a place cannot be created under a non-existent layer", async () => {
    const a = await signInAs("admin@example.com");
    const res = await req(a, "POST", "/api/admin/places", { layerId: "nope", name: "x", lat: 1, lng: 1 });
    expect(res.status).toBe(400);
  });

  it("non-admins cannot manage layers or places (403)", async () => {
    const u = await signInAs(`u-${crypto.randomUUID()}@example.com`);
    expect((await req(u, "GET", "/api/admin/layers")).status).toBe(403);
    expect((await req(u, "POST", "/api/admin/layers", { name: "x" })).status).toBe(403);
    expect((await req(u, "POST", "/api/admin/places", { layerId: "x", name: "y", lat: 1, lng: 1 })).status).toBe(403);
  });

  it("the seeded 'Chabad houses' layer is present (migration 0010)", async () => {
    const a = await signInAs("admin@example.com");
    const layers = ((await (await req(a, "GET", "/api/admin/layers")).json()) as { layers: LayerDTO[] }).layers;
    expect(layers.some((l) => l.name === "Chabad houses")).toBe(true);
  });
});
