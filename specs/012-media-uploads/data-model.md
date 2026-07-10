# Data Model: Image Uploads (Shared Media Pipeline)

Image **references** live on the parent rows (D1); image **bytes** live in R2 under a parent-scoped key.
No separate media table (D2).

## R2 object

- **Binding**: `IMAGES` (R2 bucket).
- **Key**: `{kind}/{parentId}/{uuid}.{ext}` — `kind ∈ {avatar, stay, event, place}`,
  `ext ∈ {jpg, png, webp}`.
- **Body**: the validated, EXIF/GPS-stripped image bytes.
- **HTTP metadata**: `contentType` set from the sniffed type; served with cache headers per D3.

## D1 changes (migration 0013)

Additive; nullable; mirrors `place.images` exactly.

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `stay` | `images` | `text` (json `string[]`), nullable | ordered gallery of image refs (owner-managed) |
| `event` | `images` | `text` (json `string[]`), nullable | ordered gallery (minyan host-managed) |

`ALTER TABLE stay ADD COLUMN images text;` + `ALTER TABLE event ADD COLUMN images text;` — single-line
ALTERs (both tables have FK children → no PRAGMA rebuild, per the 004/006 rule). Drizzle `schema.ts`
adds `images: text("images", { mode: "json" }).$type<string[]>()` to `stay` and `event`.

### Existing fields reused (no change)

- `user.image` (text, nullable) — the single avatar ref (better-auth field).
- `place.images` (text json `string[]`, nullable, from 010) — place gallery; now also holds uploaded
  refs alongside imported absolute URLs.

## Image reference (the stored string)

A renderable string put into the arrays / `user.image`:

- **Uploaded** → app-relative `"/api/media/{kind}/{parentId}/{uuid}.{ext}"`.
- **Imported** (place only, from 010) → the source's absolute URL (unchanged).

The client uses the string as an `<img src>` verbatim. Alt text is derived at render from the parent's
name (FR-012) — not stored per image in v1 (kept simple; editable alt is a later iteration if needed).

## Shared contracts (`packages/shared/src/schemas/media.ts`)

- `IMAGE_KIND` = `"avatar" | "stay" | "event" | "place"`.
- `ALLOWED_IMAGE_TYPES` = `["image/jpeg","image/png","image/webp"]`.
- `IMAGE_LIMITS` = `{ maxBytes: 5_242_880, galleryMax: 6, avatarMax: 1 }`.
- `UploadResponse` = `{ ref: string }` (the stored image ref to append to the parent).
- Error codes (extend `errors.ts`): `image.type_invalid`, `image.too_large`, `image.gallery_full`,
  `image.not_found` (reuses `auth.forbidden`, `resource.not_found`, `rate.limited`).

## Validation rules (enforced server-side — `mediaService`)

- Type ∈ `ALLOWED_IMAGE_TYPES` **by magic bytes** (not client MIME) → else `image.type_invalid` (400).
- Size ≤ `IMAGE_LIMITS.maxBytes` → else `image.too_large` (400).
- Gallery add when parent already has `galleryMax` refs → `image.gallery_full` (409); avatar is
  replace-one (no "full").
- Writer must be parent owner or admin → else `auth.forbidden` (403).
- GPS/EXIF stripped before store (FR-005).

## Visibility (serving — `GET /api/media/*`, D3)

| kind | visible to | cache |
|------|-----------|-------|
| `avatar` | any signed-in user | public, long |
| `place` | places read audience (active layer) | public, long |
| `stay` / `event` | parent's existing tier — moderation-`hidden` → 404; contact-tier photos only to permitted viewers | private, short |

## Lifecycle

- **Replace avatar** → delete prior object by key, set `user.image` to the new ref.
- **Remove one gallery image** → delete object, drop the ref from the array.
- **Parent deleted** (stay hard-delete / event delete / place delete / user delete / seed-merge) →
  `cleanupParent` deletes the whole `{kind}/{parentId}/` prefix (FR-008). Best-effort, logged.

## State & validation summary

No state machine. Guarantees are structural: parent-scoped keys (authz + cleanup), server-side
sniff/size/strip (safety/privacy), shared `IMAGE_LIMITS` (consistent enforcement), parent-visibility
serving (FR-007).
