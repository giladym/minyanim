import type { ImageKind } from "@minyanim/shared";

/**
 * R2 access for uploaded images (012). Isolates the `IMAGES` binding from services exactly as the
 * Drizzle repositories isolate `DB`. Keys are `{kind}/{parentId}/{uuid}.{ext}` so authorization and
 * orphan cleanup derive from the prefix.
 */

/** Build a fresh object key for a parent. `uuid` keeps keys unguessable + collision-free. */
export function keyFor(kind: ImageKind, parentId: string, ext: string): string {
  return `${kind}/${parentId}/${crypto.randomUUID()}.${ext}`;
}

/** The `{kind}/{parentId}/` prefix — used to list/delete all of a parent's objects. */
export function prefixFor(kind: ImageKind, parentId: string): string {
  return `${kind}/${parentId}/`;
}

export async function putObject(bucket: R2Bucket, key: string, body: Uint8Array, contentType: string): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
}

export async function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

export async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

/** Delete every object under a parent's prefix (orphan cleanup on parent delete). Idempotent. */
export async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length) await bucket.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
