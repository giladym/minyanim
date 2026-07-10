# Research: Image Uploads (Shared Media Pipeline)

Decisions for the unknowns the spec deferred to planning. No external research was required beyond the
Cloudflare R2/Workers docs and the existing codebase conventions.

## D1 — Storage & binding

**Decision**: A single R2 bucket bound as `IMAGES` in `wrangler.jsonc` (`r2_buckets`) and typed on `Env`
as `IMAGES: R2Bucket`. A `storageRepository` wraps `put/get/delete/list` so services never touch the
binding directly (mirrors how Drizzle repositories isolate `DB`).

**Rationale**: R2 is Workers-native, first-party (no CORS), no egress fees, and matches the
constitution's binding/secret model. Isolating it behind a repository keeps the layered architecture.

**Alternatives**: Cloudflare Images (paid, and adds a service dependency — rejected for v1); storing
bytes in D1 (blobs bloat the DB and cap at 1 MB-ish per row — rejected).

## D2 — Key strategy & the image reference

**Decision**: Object key = `{kind}/{parentId}/{uuid}.{ext}` where `kind ∈ {avatar, stay, event, place}`.
The **stored reference** persisted on the parent row is the app-relative URL `/api/media/{key}` (not an
absolute/bucket URL). Consumers render it directly as an `<img src>`.

**Rationale**: The prefix makes authorization (derive parent from key) and orphan cleanup (delete by
`{kind}/{parentId}/` prefix) trivial and env-independent. Relative refs mean no bucket/domain leaks into
the DB and no rewrite between dev/prod. `place.images` already holds renderable strings (imported
absolute URLs); uploaded refs are just relative strings alongside them — no schema change to `place`.

**Alternatives**: A dedicated `media` table mapping key→parent (more robust reconciliation, but heavier;
the parent json arrays are already the SoT — rejected for v1, revisit if reconciliation needs an index).

## D3 — Serving model (FR-007 visibility parity)

**Decision**: Serve every image through a Worker route `GET /api/media/{kind}/{parentId}/{file}`. The
route derives the parent from the key prefix and enforces the SAME visibility the parent already has:

- `avatar/*` — visible to any signed-in user (respects an avatar's existence only; avatars carry no
  private data). Long-lived cache.
- `place/*` — visible like the places read path (active layer). Long-lived cache.
- `stay/*` and `event/*` — reuse the existing read authorization: a moderation-`hidden` parent → 404;
  owner-private (contact-tier) photos → only to a permitted viewer (owner/committed), per 003/008. These
  responses are `private`, short-cache.

**Rationale**: One mechanism gives FR-007 by construction and keeps the stored ref stable regardless of
visibility. At current scale the extra per-render auth is negligible; if it becomes hot, public-safe
kinds (avatar/place) can move to a public bucket + CDN later without changing stored refs.

**Alternatives**: Public bucket for all (violates FR-007 for gated listing photos — rejected); signed
time-limited URLs (more moving parts, and still needs the visibility check to mint them — deferred).

## D4 — Validation & EXIF/GPS stripping in the Workers runtime

**Decision**: Server-side, in `lib/imageMeta.ts` with **no new runtime dependency**:
1. **Type sniff** by magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF`…`WEBP`) — never trust
   the client-sent MIME.
2. **Size cap** by byte length (≤ 5 MB) before store.
3. **Metadata strip** by dropping metadata segments without a full decode: JPEG → remove `APP1`(EXIF)
   /`APPn`/`COM` markers; WebP → drop the `EXIF`/`XMP` RIFF chunks; PNG → strip ancillary text/`eXIf`
   chunks. GPS lives in those segments, so removing them satisfies FR-005 while preserving the image
   bitstream (no re-encode, no quality loss, fast).

Additionally the **client** re-encodes via `<canvas>` (downscale to a max dimension) before upload — this
both meets the size cap on phone photos and strips all metadata; the server strip is the authoritative
guarantee (never trust the client).

**Rationale**: Full decode/re-encode in a Worker needs a heavy WASM codec; marker-stripping is pure,
tiny, and sufficient for privacy. Canvas re-encode on the client is the pragmatic downscale path.

**Alternatives**: WASM image lib for full re-encode (bundle size + CPU — rejected for v1); trusting
client-stripped uploads only (fails "never trust the client" — rejected).

## D5 — Limits, authorization & abuse

**Decision**: `IMAGE_LIMITS` in `packages/shared` (types, ≤ 5 MB, gallery max 6, avatar 1) — the single
SoT enforced server-side and surfaced client-side. Writes (`POST`/`DELETE /api/media`) require the
parent's owner (`stay.userId` / `event.hostUserId` / the acting user for avatar) or an admin
(`requireAdmin`), reusing the existing ownership checks. Uploads are rate-limited via the existing
`RATE_LIMITER` binding keyed on the user.

**Rationale**: Shared limits keep client hints and server enforcement in lockstep. Reusing ownership +
rate-limit primitives avoids new auth surface (KISS).

## D6 — Lifecycle / orphan cleanup (FR-008 / SC-004)

**Decision**: On parent deletion, `mediaService.cleanupParent(kind, parentId)` lists the R2 prefix and
deletes the objects; wired into: stay hard-delete (004), event delete/cancel-purge path, place delete
(010), user delete + **seed-merge** (009). Avatar replace deletes the prior object by its key. Best-effort
+ logged: a cleanup failure never blocks the parent delete (the object is still unreferenced and can be
swept later).

**Rationale**: Prefix-scoped deletes need no manifest table and are naturally idempotent. Reconciliation
(SC-004) is "list bucket vs. referenced keys" — a later dev script if needed.

**Alternatives**: R2 lifecycle rules / TTL (can't express "when parent deleted" — rejected as the primary
mechanism, usable later as a backstop sweep).

## D7 — Testing R2 in vitest-pool-workers

**Decision**: Add an `IMAGES` R2 bucket to the miniflare test bindings in `apps/backend/vitest.config.ts`
(pool-workers simulates R2 in-memory, isolated per file). Tests upload via `SELF.fetch` with a
`FormData`/`Blob`, then assert the stored object, the stripped metadata, authz (403 for non-owner),
visibility (hidden parent → 404 on `GET /api/media`), and cleanup (prefix empty after delete).

**Rationale**: Same isolated-per-file model as D1 tests; no real R2 needed in CI. The EXIF stripper is
also unit-tested directly with tiny fixture buffers (a JPEG with a known APP1/GPS segment → asserted
absent after strip).
