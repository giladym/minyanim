# API Contracts — Image Uploads (Shared Media Pipeline)

Base `/api` on the backend Worker (Hono). Conventions inherited: `401 auth.required`; `403 auth.forbidden`;
`404 resource.not_found`; shared error shape `{ errors: [{ field, code, params? }] }`. Uploads are
rate-limited via the existing `RATE_LIMITER` binding (keyed on the user).

Shared types (`packages/shared/src/schemas/media.ts`): `IMAGE_KIND`, `ALLOWED_IMAGE_TYPES`,
`IMAGE_LIMITS { maxBytes, galleryMax, avatarMax }`, `UploadResponse { ref }`.

---

## `POST /api/media` — upload one image (auth'd; owner or admin)

`multipart/form-data`:
- `file` — the image (JPEG/PNG/WebP).
- `kind` — `avatar | stay | event | place`.
- `parentId` — the target id (the user's own id for `avatar`; a Stay id; an event id; a place id).

Server: authorize writer (parent owner / admin; `avatar` ⇒ the acting user) → sniff type by magic bytes
→ enforce size → strip EXIF/GPS → store to R2 at `{kind}/{parentId}/{uuid}.{ext}` → append the ref to the
parent (`user.image` replace for avatar; array append for galleries; `image.gallery_full` if at
`galleryMax`).

- → `201 { ref: "/api/media/{kind}/{parentId}/{uuid}.{ext}" }`
- `400 image.type_invalid` (not a real JPEG/PNG/WebP) · `400 image.too_large` (> maxBytes) ·
  `409 image.gallery_full` · `401` · `403 auth.forbidden` · `429 rate.limited`.

## `DELETE /api/media` — remove one image (auth'd; owner or admin)

`application/json`: `{ "ref": "/api/media/{kind}/{parentId}/{file}" }`.

Server: parse the ref → authorize by its parent → delete the R2 object → remove the ref from the parent
(clear `user.image` for avatar). Idempotent (missing object → still detaches the ref).

- → `200 { ok: true }` · `401` · `403` · `404 resource.not_found` (unknown parent).

## `GET /api/media/:kind/:parentId/:file` — serve an image (visibility-gated)

Streams the R2 object with a content type + cache headers, **after** enforcing the parent's visibility
(D3 / FR-007):

| kind | rule | Cache-Control |
|------|------|---------------|
| `avatar` | any signed-in user | `public, max-age=604800` |
| `place` | active-layer places audience | `public, max-age=604800` |
| `stay` / `event` | parent not moderation-`hidden`; owner-private (contact-tier) photos only to owner/committed viewers | `private, max-age=300` |

- → `200` image bytes · `304` (revalidation) · `401` (where sign-in required) ·
  `404 resource.not_found` (missing object, or parent hidden/not visible to this viewer).

Signed-out behavior matches the parent read path (e.g. a public Minyan join page may show its host avatar;
a hidden listing's images 404 for everyone).

---

## Consumer wiring (no new endpoints — existing read/write paths carry the refs)

- **Avatar**: `user.image` already serialized on the profile/session + roster/organizer/message DTOs; FE
  renders it with an initials placeholder fallback.
- **Stay gallery**: `stay.images` added to the owner + viewer Stay DTOs (respecting the contact-tier — a
  not-yet-permitted viewer does not receive owner-private refs).
- **Minyan gallery**: `event.images` added to the Minyan DTOs (public/roster/participant/owner), gated by
  the existing `hidden` + tier rules.
- **Place gallery**: `place.images` already on `PlaceDTO` (010); the admin places manager gains upload/
  remove; discovery + places views render the gallery.

## Errors (new — `packages/shared/src/errors.ts`)

| Code | Constant | When |
|------|----------|------|
| `image.type_invalid` | `IMAGE_TYPE_INVALID` | upload not a real JPEG/PNG/WebP (magic-byte sniff) |
| `image.too_large` | `IMAGE_TOO_LARGE` | upload exceeds `IMAGE_LIMITS.maxBytes` |
| `image.gallery_full` | `IMAGE_GALLERY_FULL` | gallery already at `galleryMax` |

Reuses `auth.required`, `auth.forbidden`, `resource.not_found`, `rate.limited`.
