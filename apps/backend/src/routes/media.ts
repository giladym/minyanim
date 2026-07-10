import { Hono } from "hono";
import { IMAGE_KINDS, type ImageKind } from "@minyanim/shared";
import { createDb } from "../db/client";
import { requireUserId, optionalUserId } from "../lib/auth";
import { NotFound } from "../lib/errors";
import { rateLimit } from "../middleware";
import { upload, remove, canView } from "../services/mediaService";
import { getObject } from "../repositories/storageRepository";
import type { Env } from "../env";

/** Media pipeline (012): upload / delete / serve images backed by R2. */
export const media = new Hono<{ Bindings: Env }>();

const isKind = (v: string): v is ImageKind => (IMAGE_KINDS as readonly string[]).includes(v);

/** POST /api/media — multipart upload (file/kind/parentId). Auth'd + rate-limited; owner/admin only. */
media.post("/api/media", rateLimit(), async (c) => {
  const userId = await requireUserId(c);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "");
  const parentId = String(form?.get("parentId") ?? "");
  // FormData values are `string | File`; a real upload is the non-string (File/Blob) branch.
  if (!file || typeof file === "string" || !isKind(kind) || !parentId) {
    return c.json({ errors: [{ field: null, code: "validation.invalid" }] }, 400);
  }
  const bytes = new Uint8Array(await (file as Blob).arrayBuffer());
  const res = await upload(createDb(c.env.DB), c.env.IMAGES, userId, { kind, parentId, bytes });
  return c.json(res, 201);
});

/** DELETE /api/media — remove one image by its ref. Auth'd; owner/admin only. */
media.delete("/api/media", async (c) => {
  const userId = await requireUserId(c);
  const body = (await c.req.json().catch(() => ({}))) as { ref?: string };
  if (!body.ref) return c.json({ errors: [{ field: "ref", code: "validation.invalid" }] }, 400);
  await remove(createDb(c.env.DB), c.env.IMAGES, userId, body.ref);
  return c.json({ ok: true });
});

/** GET /api/media/:kind/:parentId/:file — serve the object, gated by the parent's visibility (FR-007). */
media.get("/api/media/:kind/:parentId/:file", async (c) => {
  const kind = c.req.param("kind");
  const parentId = c.req.param("parentId");
  const file = c.req.param("file");
  if (!isKind(kind)) throw NotFound();

  const db = createDb(c.env.DB);
  const viewerId = await optionalUserId(c);
  if (!(await canView(db, viewerId, kind, parentId))) throw NotFound();

  const obj = await getObject(c.env.IMAGES, `${kind}/${parentId}/${file}`);
  if (!obj) throw NotFound();

  // avatars/places are public (no private data); stay/event follow the parent → keep private + short.
  const cache = kind === "avatar" || kind === "place" ? "public, max-age=604800" : "private, max-age=300";
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": cache,
      etag: obj.httpEtag,
    },
  });
});
