# Tasks: Image Uploads (Shared Media Pipeline)

**Feature**: `specs/012-media-uploads/` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

**Organization**: Setup (R2 binding + migration + shared contract) → Foundational (the shared media
pipeline + reusable UI — blocks all consumers) → US1 avatar (P1) → US2 listing galleries (P1) → US3 place
photos (P2) → Polish (cleanup wiring, i18n, e2e, docs). Tests included (project a11y + contract-first
gates). MVP = Foundational + US1.

---

## Phase 1: Setup

- [ ] T001 Branch `012-media-uploads` off `develop`. Add the R2 bucket binding to `apps/backend/wrangler.jsonc` (`"r2_buckets": [{ "binding": "IMAGES", "bucket_name": "minyanim-images" }]`) and type it on `apps/backend/src/env.ts` (`IMAGES: R2Bucket`). Add the same `IMAGES` R2 bucket to the miniflare bindings in `apps/backend/vitest.config.ts` (test sim).
- [ ] T002 [P] Create `packages/shared/src/schemas/media.ts`: `IMAGE_KIND` (`"avatar"|"stay"|"event"|"place"`), `ALLOWED_IMAGE_TYPES`, `IMAGE_LIMITS { maxBytes: 5_242_880, galleryMax: 6, avatarMax: 1 }`, `UploadResponse { ref: string }`. Export from `schemas/index.ts`. JSDoc. (contracts/media.md, data-model.md)
- [ ] T003 [P] Extend `packages/shared/src/errors.ts`: add `IMAGE_TYPE_INVALID: "image.type_invalid"`, `IMAGE_TOO_LARGE: "image.too_large"`, `IMAGE_GALLERY_FULL: "image.gallery_full"` under a `// 012 — media uploads` comment.
- [ ] T004 Migration `apps/backend/migrations/0013_*.sql` + `apps/backend/src/db/schema.ts`: add `stay.images` and `event.images` (`text("images", { mode: "json" }).$type<string[]>()`, nullable) via single `ALTER TABLE … ADD COLUMN images text` statements (no PRAGMA rebuild — both have FK children; hand-fix if drizzle-kit emits a rebuild). Apply `db:migrate:local`. (data-model.md)

**Checkpoint**: binding + shared types + schema in place; both apps typecheck.

---

## Phase 2: Foundational (BLOCKING — the shared pipeline + reusable UI)

**Purpose**: One upload/delete/serve mechanism + two reusable FE components that all three consumers use.

- [ ] T005 Create `apps/backend/src/lib/imageMeta.ts`: `sniffType(bytes)` (magic-byte JPEG/PNG/WebP → mime or null), `stripMetadata(bytes, type)` (drop JPEG `APPn`/EXIF/`COM` markers; WebP `EXIF`/`XMP` chunks; PNG `eXIf`/text chunks — no full decode). Pure, unit-testable. (research D4)
- [ ] T006 Create `apps/backend/src/repositories/storageRepository.ts` over `env.IMAGES`: `put(key, bytes, contentType)`, `get(key)`, `delete(key)`, `deletePrefix(prefix)` (list + batch delete), `keyFor(kind, parentId, ext)` → `{kind}/{parentId}/{uuid}.{ext}`. (research D1/D2/D6)
- [ ] T007 Create `apps/backend/src/services/mediaService.ts`: `upload(db, env, actorId, {kind, parentId, file})` → authorize (parent owner via stay.userId/event.hostUserId, self for avatar, or admin) → `sniffType` (else `image.type_invalid`) → size ≤ maxBytes (else `image.too_large`) → `stripMetadata` → `storageRepository.put` → attach ref to parent (avatar replace incl. delete-old; gallery append with `galleryMax` guard → `image.gallery_full`); `remove(db, env, actorId, ref)` → authorize by parent → delete object + detach ref; `cleanupParent(env, kind, parentId)` → `deletePrefix`; `canView(db, viewerId, kind, parentId)` → the D3 visibility rule. (contracts/media.md, research D3/D5/D6)
- [ ] T008 Create `apps/backend/src/routes/media.ts`: `POST /api/media` (multipart: file/kind/parentId; `requireUserId`; rate-limit via `RATE_LIMITER`; → 201 `{ref}`), `DELETE /api/media` (`{ref}`), `GET /api/media/:kind/:parentId/:file` (`canView` gate → stream R2 object with content-type + Cache-Control per D3; 404 if hidden/missing). Mount in `apps/backend/src/index.ts`. (contracts/media.md)
- [ ] T009 [P] Create `apps/frontend/src/lib/media.ts`: `useUploadImage()` (client `<canvas>` downscale to a max dimension → `FormData` POST `/api/media` → returns ref), `useDeleteImage()`; map `image.*`/`auth.forbidden`/`rate.limited` to i18n. (research D4)
- [ ] T010 [P] Create `apps/frontend/src/features/media/ImageUploader.tsx`: RTL/mobile `<input type=file accept=image/*>` control with visible progress + localized error state, ≥44px, keyboard + accessible label; calls `useUploadImage`. (FR-012)
- [ ] T011 [P] Create `apps/frontend/src/features/media/Gallery.tsx`: renders image refs as thumbnails with alt text (from a passed item name), owner-only remove buttons, placeholder when empty; tokens-only. (FR-009/012)
- [ ] T012 [P] `apps/backend/test/media.test.ts`: upload authz (owner ok, non-owner 403), type sniff (txt→400 `image.type_invalid`), oversize→400 `image.too_large`, gallery cap→409, delete detaches + removes object; `apps/backend/test/imageMeta.test.ts`: a fixture JPEG with GPS EXIF → `stripMetadata` output has no APP1/GPS.

**Checkpoint**: `POST/DELETE/GET /api/media` work with authz, validation, EXIF strip; FE upload control + gallery exist.

---

## Phase 3: User Story 1 — Profile avatar (Priority: P1)

**Goal**: A user uploads/replaces/removes their avatar; it renders across roster/organizer/messages.

**Independent Test**: Upload avatar on Profile → appears on roster/organizer/messages; replace → old gone; remove → placeholder.

- [ ] T013 [US1] Wire avatar upload/remove into `apps/frontend/src/features/profile/…` using `ImageUploader` (kind `avatar`, parentId = the user's id) → sets `user.image`; show current avatar + remove. Placeholder (initials) component reused across surfaces.
- [ ] T014 [US1] Ensure `user.image` is present on the DTOs that render a person — roster/organizer (003), message thread + list (008) — and render the avatar (with placeholder fallback) in `MinyanDetail`/roster, organizer card, and `Messages`.
- [ ] T015 [P] [US1] `apps/frontend/src/features/profile/…test.tsx`: uploading sets the avatar; removing falls back to placeholder; a non-image is rejected with a message. Backend avatar-replace deletes the prior object (assert in `media.test.ts`).

**Checkpoint**: avatars work end-to-end (MVP).

---

## Phase 4: User Story 2 — Stay / Minyan galleries (Priority: P1)

**Goal**: Owners add photos to their Stay/Minyan; photos follow visibility + moderation; only owner/admin edits.

**Independent Test**: Owner adds photos → render on the listing; non-owner 403; hidden parent → images 404; contact-tier photos gated.

- [ ] T016 [US2] Surface `stay.images` on the owner + viewer Stay DTOs in `apps/backend/src/services/stayService.ts` (contact-tier: omit owner-private refs for not-yet-permitted viewers); surface `event.images` on the Minyan DTOs in `apps/backend/src/services/eventService.ts` (respect `hidden` + tier). (contracts/media.md)
- [ ] T017 [US2] Wire the `Gallery` + `ImageUploader` into the Stay form/detail (`apps/frontend/src/features/stays/…`, kind `stay`) and the Minyan detail/host surfaces (`apps/frontend/src/features/events/…`, kind `event`) — owner/host only.
- [ ] T018 [US2] Enforce visibility in `mediaService.canView` for `stay`/`event`: moderation-`hidden` parent → not viewable; owner-private photos only to owner/committed (reuse existing tier checks). Wire `GET /api/media` to it.
- [ ] T019 [P] [US2] `apps/backend/test/media.test.ts` (extend): a 3-flag auto-hidden Stay → `GET /api/media/stay/<id>/<file>` 404; non-owner cannot upload/remove; a committed vs non-committed viewer sees/does-not-see a contact-tier photo.

**Checkpoint**: listing galleries respect ownership + moderation + visibility.

---

## Phase 5: User Story 3 — Admin place photos (Priority: P2)

**Goal**: Admins add/remove place photos; they render on places/discovery; imported attribution intact.

**Independent Test**: Admin adds a place photo → renders in the gallery; non-admin 403; imported place keeps attribution.

- [ ] T020 [US3] Wire `ImageUploader` + `Gallery` into `apps/frontend/src/features/admin/AdminPlacesManager.tsx` (kind `place`) → appends to `place.images`; render the place gallery in the places view + discovery popup (`apps/frontend/src/features/places/…`, `DiscoveryMap` popup) keeping the attribution line.
- [ ] T021 [P] [US3] `apps/backend/test/media.test.ts` (extend): admin can upload to a place; a non-admin gets 403; place gallery cap enforced.

**Checkpoint**: all three consumers on the one pipeline.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 Wire `mediaService.cleanupParent` into every parent-delete path: stay hard-delete (`stayService`), event delete/cancel-purge (`eventService`), place delete (`placesService`), user delete + **seed-merge** (009 `claim`/user delete) → no orphaned objects (FR-008/SC-004).
- [ ] T023 [P] i18n he+en parity in `apps/frontend/src/i18n/locales/{he,en}.ts`: `media.{upload,uploading,remove,replace,addPhoto,dragHint,typeInvalid,tooLarge,galleryFull,avatarAlt,photoAlt,placeholder}`; parity test passes.
- [ ] T024 [P] e2e: extend `apps/frontend/e2e/profile.spec.ts` (avatar upload + axe), `stays.spec.ts` (Stay gallery + axe), `admin.spec.ts` (place photo + axe) — WCAG 2.1 AA, RTL, keyboard, every image has alt (SC-007). Use a tiny in-repo fixture image.
- [ ] T025 Run all gates (quickstart "Automated gates"): typecheck + unit (shared/backend/frontend) + e2e; fix drift.
- [ ] T026 Docs at merge time: `CLAUDE.md` (012 complete; latest-migration → 0013; note the `IMAGES` R2 binding + that `wrangler r2 bucket create minyanim-images` is a one-time provisioning step for dev/prod) + `specs/ROADMAP.md`; add ADR (R2 media pipeline: key strategy, visibility-gated serving, EXIF strip, no thumbnails v1). Note remote dev needs `db:migrate:remote` (0013) + the R2 bucket provisioned on deploy.

---

## Dependencies & Execution Order

- **Setup (T001–T004)** → **Foundational (T005–T012)** blocks all stories.
- Within Foundational: T005 (imageMeta) + T006 (storage) → T007 (service) → T008 (routes); FE T009→T010/T011 in parallel; T012 tests after the code.
- **US1 (T013–T015)** after Foundational. **US2 (T016–T019)** after Foundational (independent of US1). **US3 (T020–T021)** after Foundational.
- **Polish (T022–T026)** last; T022 (cleanup) depends on all consumers existing.

## Parallel Opportunities

- Setup: T002 + T003 [P] (shared contract vs errors).
- Foundational: T009/T010/T011 [P] (FE lib + two components) alongside backend T005–T008; T012 [P] after.
- Stories: US1, US2, US3 can proceed in parallel once Foundational lands (different consumer files); their `media.test.ts` extensions coordinate on one file.

## Implementation Strategy

**MVP = Foundational + US1 (avatar)** — proves the whole pipeline (upload → strip → store → serve →
render, with authz + limits) on the simplest consumer. Then US2 (the core product value: listing photos
with visibility/moderation) and US3 (admin place photos). Ship as one PR (the pipeline + all three
consumers are tightly coupled and share the migration + contract); CI green; run the remote migration +
provision the R2 bucket on deploy.
