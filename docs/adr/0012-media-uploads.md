# 0012 — R2-backed media pipeline (avatars, listing galleries, place photos)

**Status**: Accepted (2026-07-10) · **Feature**: 012 (media uploads)

## Context

Several surfaces wanted user-supplied images — profile avatars, Stay/Minyan photos (recognizability for
travelers), and admin-curated place photos — but the app had no image storage or upload path. `user.image`
and `place.images` fields existed but were unfilled. We needed one mechanism, not three, and it had to
respect the app's existing visibility + moderation rules and protect privacy (phone photos carry GPS).

## Decision

- **Storage.** Image bytes live in a Cloudflare **R2** bucket bound as `IMAGES` (Workers-native,
  first-party, no egress fees) — isolated behind a `storageRepository` the same way Drizzle isolates D1.
  Image **references** live on the parent rows (`user.image`, `stay.images`, `event.images`,
  `place.images`); no separate media table.
- **Keys** are `{kind}/{parentId}/{uuid}.{ext}`, so authorization and orphan cleanup derive from the key
  prefix. The stored ref is the app-relative `/api/media/{key}` (env-independent; no bucket URL in the DB).
- **One pipeline** (`mediaService` + `routes/media.ts`): `POST /api/media` (multipart, owner/admin,
  rate-limited), `DELETE /api/media`, and `GET /api/media/*` (serve). Three consumers (avatar / stay+event
  galleries / place) wire onto it — no bespoke flows.
- **Validation & privacy.** Type is decided by **magic bytes** (never the client MIME); size is capped
  (5 MB); **EXIF/GPS is stripped server-side** by a zero-dependency marker stripper (`lib/imageMeta` —
  drops JPEG APP1/COM, WebP EXIF/XMP, PNG text chunks; no full decode). The client also `<canvas>`-
  downscales before upload (size + defense in depth). No paid image service; no server thumbnails in v1.
- **Visibility-gated serving (FR-007).** `GET /api/media/*` enforces the parent's own visibility: avatars
  + place photos are public; **a moderation-hidden minyan** gates its photos to host/admin; **stay photos**
  are owner/admin-only (a Stay is a private record). An image never outlives its parent's visibility.
- **Lifecycle.** Avatar replace deletes the prior object; `cleanupParent` prefix-deletes on parent delete
  (wired for stay hard-delete + place delete; user/seed-merge avatar cleanup is a deferred best-effort
  follow-up — an orphan avatar is harmless + sweepable).
- **Limits** (`IMAGE_LIMITS` in `packages/shared`, enforced server-side + hinted client-side): JPEG/PNG/
  WebP, ≤ 5 MB, ≤ 6 photos per gallery, 1 avatar.

## Consequences

- Adds a new binding (`IMAGES`) requiring a one-time `wrangler r2 bucket create` per environment
  (dev = `minyanim-images-dev`). Local dev + tests use miniflare's in-memory R2.
- Worker-proxied serving costs a per-render auth check; fine at current scale. Public-safe kinds
  (avatar/place) can move to a public bucket + CDN later **without changing stored refs**.
- FE media components (`features/media/`) are provider-free (plain `lib/media` fns + local state), so they
  render in isolation without a `QueryClientProvider`.

## Alternatives considered

- **Cloudflare Images / a WASM re-encoder** for resize + strip — rejected for v1 (paid dependency / bundle
  + CPU); marker-stripping + client canvas downscale is sufficient for privacy + size.
- **Public bucket for everything** — rejected: violates FR-007 for hidden/private listing photos.
- **A dedicated `media` table** — rejected for v1: the parent ref arrays are the SoT and prefix-scoped
  cleanup needs no manifest (revisit if reconciliation needs an index).
