import { IMAGE_EXT, IMAGE_LIMITS, type ImageKind, type UploadResponse } from "@minyanim/shared";
import type { Db } from "../db/client";
import { Forbidden, NotFound, ImageTypeInvalid, ImageTooLarge, ImageGalleryFull } from "../lib/errors";
import { sniffType, stripMetadata } from "../lib/imageMeta";
import {
  parentState,
  isAdmin,
  getImages,
  setImages,
  getAvatar,
  setAvatar,
} from "../repositories/mediaRepository";
import { keyFor, prefixFor, putObject, deleteObject, deletePrefix } from "../repositories/storageRepository";

/** The stored ref is the app-relative serve URL — the client uses it directly as an <img src>. */
const refFromKey = (key: string) => `/api/media/${key}`;
/** Parse a stored ref back to its object key + parts. Returns null if it isn't one of ours. */
export function parseRef(ref: string): { kind: ImageKind; parentId: string; key: string } | null {
  const m = /^\/api\/media\/(avatar|stay|event|place)\/([^/]+)\/([^/]+)$/.exec(ref);
  if (!m) return null;
  const [, kind, parentId, file] = m as unknown as [string, ImageKind, string, string];
  return { kind, parentId, key: `${kind}/${parentId}/${file}` };
}

/** Whether `actor` may add/remove images on this parent: owner, or admin; `place` is admin-only. */
async function assertCanWrite(db: Db, actorId: string, kind: ImageKind, parentId: string): Promise<void> {
  const st = await parentState(db, kind, parentId);
  if (!st) throw NotFound();
  if (st.ownerId && st.ownerId === actorId) return; // owner (incl. avatar = self)
  if (await isAdmin(db, actorId)) return;
  throw Forbidden();
}

/**
 * Validate + store one uploaded image and attach its ref to the parent (012). Type is decided by magic
 * bytes (not the client MIME); GPS/EXIF is stripped before store; galleries are capped. Avatar is
 * replace-one (the prior object is deleted).
 */
export async function upload(
  db: Db,
  bucket: R2Bucket,
  actorId: string,
  input: { kind: ImageKind; parentId: string; bytes: Uint8Array },
): Promise<UploadResponse> {
  const { kind, parentId, bytes } = input;
  await assertCanWrite(db, actorId, kind, parentId);

  const type = sniffType(bytes);
  if (!type) throw ImageTypeInvalid();
  if (bytes.byteLength > IMAGE_LIMITS.maxBytes) throw ImageTooLarge();

  // Gallery cap is checked BEFORE storing so a rejected upload never orphans an object.
  if (kind !== "avatar") {
    const current = await getImages(db, kind, parentId);
    if (current.length >= IMAGE_LIMITS.galleryMax) throw ImageGalleryFull();
  }

  const clean = stripMetadata(bytes, type);
  const key = keyFor(kind, parentId, IMAGE_EXT[type]);
  await putObject(bucket, key, clean, type);
  const ref = refFromKey(key);

  if (kind === "avatar") {
    const old = await getAvatar(db, parentId);
    await setAvatar(db, parentId, ref);
    if (old) {
      const parsed = parseRef(old);
      if (parsed) await deleteObject(bucket, parsed.key); // remove the replaced object (no orphan)
    }
  } else {
    const current = await getImages(db, kind, parentId);
    await setImages(db, kind, parentId, [...current, ref]);
  }
  return { ref };
}

/** Remove one image by its ref (owner/admin). Idempotent — detaches even if the object is already gone. */
export async function remove(db: Db, bucket: R2Bucket, actorId: string, ref: string): Promise<void> {
  const parsed = parseRef(ref);
  if (!parsed) throw NotFound();
  await assertCanWrite(db, actorId, parsed.kind, parsed.parentId);

  await deleteObject(bucket, parsed.key);
  if (parsed.kind === "avatar") {
    if ((await getAvatar(db, parsed.parentId)) === ref) await setAvatar(db, parsed.parentId, null);
  } else {
    const current = await getImages(db, parsed.kind, parsed.parentId);
    await setImages(db, parsed.kind, parsed.parentId, current.filter((r) => r !== ref));
  }
}

/**
 * Whether `viewerId` may see an image of this parent (FR-007 visibility parity):
 * avatars + place photos are public; a Stay's photos are owner/admin-only (Stays are private records);
 * a Minyan's photos follow the minyan (public unless moderation-hidden, then host/admin only).
 */
export async function canView(db: Db, viewerId: string | null, kind: ImageKind, parentId: string): Promise<boolean> {
  if (kind === "avatar" || kind === "place") return true;
  const st = await parentState(db, kind, parentId);
  if (!st) return false;
  if (kind === "event") {
    if (!st.hidden) return true; // discoverable minyan → public (matches the join page)
    if (!viewerId) return false;
    return st.ownerId === viewerId || (await isAdmin(db, viewerId));
  }
  // stay — private to the owner (or an admin).
  if (!viewerId) return false;
  return st.ownerId === viewerId || (await isAdmin(db, viewerId));
}

/** Delete every stored image of a parent (orphan cleanup on parent delete). Best-effort. */
export async function cleanupParent(bucket: R2Bucket, kind: ImageKind, parentId: string): Promise<void> {
  await deletePrefix(bucket, prefixFor(kind, parentId));
}
