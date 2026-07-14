import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

const J = { "content-type": "application/json" };
/** Minimal bytes that pass the magic-byte JPEG sniff (server never decodes). */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

async function signIn(email = `u-${crypto.randomUUID()}@example.com`): Promise<string> {
  await SELF.fetch("https://x/api/auth/sign-up/email", { method: "POST", headers: J, body: JSON.stringify({ name: "U", email, password: "password123" }) });
  const res = await SELF.fetch("https://x/api/auth/sign-in/email", { method: "POST", headers: J, body: JSON.stringify({ email, password: "password123" }) });
  return (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
const myId = async (_cookie: string) =>
  ((await env.DB.prepare("SELECT id FROM user WHERE id = (SELECT user_id FROM session ORDER BY created_at DESC LIMIT 1)").first()) as { id: string }).id;

async function createStay(cookie: string): Promise<string> {
  const body = {
    city: "וינה", country: "AT", lat: 48.2, lng: 16.37, addressPrivate: null,
    arrivalDate: Date.UTC(2030, 5, 1), departureDate: Date.UTC(2030, 5, 8), numMen: 2,
    contactName: null, contactPhone: null, contactEmail: null, groupMembers: null, notes: null, folderId: null,
  };
  return (await (await SELF.fetch("https://x/api/stays", { method: "POST", headers: { ...J, cookie }, body: JSON.stringify(body) })).json()).id;
}

function upload(cookie: string, kind: string, parentId: string, bytes = JPEG, type = "image/jpeg", name = "a.jpg") {
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type }), name);
  fd.append("kind", kind);
  fd.append("parentId", parentId);
  return SELF.fetch("https://x/api/media", { method: "POST", headers: { cookie }, body: fd });
}
const del = (cookie: string, ref: string) =>
  SELF.fetch("https://x/api/media", { method: "DELETE", headers: { ...J, cookie }, body: JSON.stringify({ ref }) });

describe("media pipeline (012)", () => {
  it("uploads an avatar, serves it, and replaces it (old object gone)", async () => {
    const cookie = await signIn();
    const uid = await myId(cookie);
    const res = await upload(cookie, "avatar", uid);
    expect(res.status).toBe(201);
    const { ref } = await res.json();
    expect(ref).toMatch(new RegExp(`^/api/media/avatar/${uid}/`));

    const img = await SELF.fetch(`https://x${ref}`, { headers: { cookie } });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");

    await upload(cookie, "avatar", uid); // replace
    const listed = await env.IMAGES.list({ prefix: `avatar/${uid}/` });
    expect(listed.objects.length).toBe(1); // the replaced object was deleted
  });

  it("rejects a non-image and an oversize upload", async () => {
    const cookie = await signIn();
    const uid = await myId(cookie);
    const notImage = await upload(cookie, "avatar", uid, new TextEncoder().encode("hello"), "image/jpeg", "x.jpg");
    expect(notImage.status).toBe(400);
    expect((await notImage.json()).errors[0].code).toBe("image.type_invalid");

    const big = new Uint8Array(5_242_881);
    big.set(JPEG, 0);
    const oversize = await upload(cookie, "avatar", uid, big);
    expect(oversize.status).toBe(400);
    expect((await oversize.json()).errors[0].code).toBe("image.too_large");
  });

  it("lets the Stay owner add photos but refuses a non-owner (403)", async () => {
    const owner = await signIn();
    const stayId = await createStay(owner);
    expect((await upload(owner, "stay", stayId)).status).toBe(201);

    const other = await signIn();
    const refused = await upload(other, "stay", stayId);
    expect(refused.status).toBe(403);
  });

  it("enforces the gallery cap (409 image.gallery_full)", async () => {
    const owner = await signIn();
    const stayId = await createStay(owner);
    for (let i = 0; i < 6; i++) expect((await upload(owner, "stay", stayId)).status).toBe(201);
    const seventh = await upload(owner, "stay", stayId);
    expect(seventh.status).toBe(409);
    expect((await seventh.json()).errors[0].code).toBe("image.gallery_full");
  });

  it("deletes an image (detaches ref + removes object)", async () => {
    const cookie = await signIn();
    const uid = await myId(cookie);
    const { ref } = await (await upload(cookie, "avatar", uid)).json();
    expect((await del(cookie, ref)).status).toBe(200);
    expect((await SELF.fetch(`https://x${ref}`, { headers: { cookie } })).status).toBe(404);
    const avatar = (await env.DB.prepare("SELECT image FROM user WHERE id = ?").bind(uid).first()) as { image: string | null };
    expect(avatar.image).toBeNull();
  });

  it("hides a moderation-hidden minyan's photos from non-hosts (SC-003) but not the host", async () => {
    const host = await signIn();
    const body = {
      type: "minyan", city: "וינה", country: "AT", lat: 48.2, lng: 16.37, addressPrivate: null, addressNotes: null,
      eventDate: Date.UTC(2030, 0, 5), notes: null,
      minyan: { nusach: "ashkenaz", seferTorah: false, services: [{ tefilla: "maariv", time: null }] }, hostNumMen: 1,
    };
    const eventId = (await (await SELF.fetch("https://x/api/events", { method: "POST", headers: { ...J, cookie: host }, body: JSON.stringify(body) })).json()).id;
    const { ref } = await (await upload(host, "event", eventId)).json();
    expect((await SELF.fetch(`https://x${ref}`, { headers: { cookie: await signIn() } })).status).toBe(200); // visible while active

    for (const r of [await signIn(), await signIn(), await signIn()]) {
      await SELF.fetch(`https://x/api/events/${eventId}/flag`, { method: "POST", headers: { ...J, cookie: r }, body: JSON.stringify({ reason: "spam" }) });
    }
    expect((await SELF.fetch(`https://x${ref}`, { headers: { cookie: await signIn() } })).status).toBe(404); // hidden → gone for others
    expect((await SELF.fetch(`https://x${ref}`, { headers: { cookie: host } })).status).toBe(200); // host still sees it
  });

  it("lets an admin add place photos; a non-admin cannot", async () => {
    const admin = await signIn("admin@example.com"); // ADMIN_EMAILS allowlist
    await SELF.fetch("https://x/api/admin/me", { headers: { cookie: admin } }); // promote to admin
    const created = await (await SELF.fetch("https://x/api/admin/places", { method: "POST", headers: { ...J, cookie: admin }, body: JSON.stringify({ layerId: "layer_chabad_houses", name: "בית חב״ד", lat: 48.2, lng: 16.37, address: null, phone: null, description: null, hours: null, kosherMeta: null }) })).json();
    expect((await upload(admin, "place", created.id)).status).toBe(201);
    expect((await upload(await signIn(), "place", created.id)).status).toBe(403);
  });

  it("requires auth to upload", async () => {
    const cookie = await signIn();
    const uid = await myId(cookie);
    const fd = new FormData();
    fd.append("file", new Blob([JPEG], { type: "image/jpeg" }), "a.jpg");
    fd.append("kind", "avatar");
    fd.append("parentId", uid);
    expect((await SELF.fetch("https://x/api/media", { method: "POST", body: fd })).status).toBe(401);
  });
});
