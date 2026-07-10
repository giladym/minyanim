# Implementation Plan: Image Uploads (Shared Media Pipeline)

**Branch**: `012-media-uploads` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-media-uploads/spec.md`

## Summary

One shared, auth'd media pipeline backed by Cloudflare **R2**: a layered `mediaService` +
`storageRepository` (over an `IMAGES` R2 binding) exposes upload / delete / serve, and three consumers
wire onto it — **avatars** (`user.image`), **listing galleries** (new `stay.images` + `event.images`
json arrays), and **place galleries** (existing `place.images`, admin-filled). Images are stored under a
parent-scoped key (`{kind}/{parentId}/{uuid}.{ext}`) so authorization + orphan cleanup derive from the
key prefix. Uploads are validated by magic-byte sniff + size cap, GPS/EXIF is stripped server-side, and
images are **served through a Worker route** (`GET /api/media/*`) that enforces the parent's existing
visibility (hidden/removed parent ⇒ 404; committed-tier listing photos follow the 003/008 rules).
Best-effort throughout: no core flow blocks on an image.

## Technical Context

**Language/Version**: TypeScript (strict); Cloudflare Workers runtime (`nodejs_compat`).

**Primary Dependencies**: Hono, Drizzle + D1, Cloudflare **R2** (new binding), TanStack Query + React,
Zod (shared contracts), i18next, better-auth (owns `user.image`), the 006 moderation `hidden` flag, the
native `RATE_LIMITER` binding. EXIF/GPS stripping via a **zero-dependency JS marker stripper** (drop
JPEG `APPn`/EXIF + WebP `EXIF`/`XMP` chunks — no full decode, no new runtime dependency); the client
additionally re-encodes via `<canvas>` to downscale (UX + defense in depth). No paid image service.

**Storage**: D1 (image references live on the parent rows — `user.image`, `stay.images`,
`event.images`, `place.images`) + **R2 bucket `IMAGES`** for the bytes. New migration adds
`stay.images` + `event.images` (json text, nullable). No separate media table — the parent arrays are
the SoT; cleanup lists R2 by the parent key-prefix.

**Testing**: vitest-pool-workers with a **miniflare R2 bucket** binding (simulated), Vitest + Testing
Library (upload UI), Playwright + axe (WCAG AA). i18n he/en parity.

**Target Platform**: Cloudflare Workers (backend Worker + frontend Static Assets), mobile-first web.

**Performance Goals**: Upload validated + stored + first render < ~30 s on mobile (SC-001). Public-safe
images (avatar/place/public-tier listing) return long-lived cache headers; gated images return private.

**Constraints**: Secrets/bindings via env only (`IMAGES` R2 binding in `wrangler.jsonc` + `Env`). Per-image
≤ 5 MB; ≤ 6 photos per place/stay/minyan; 1 avatar/user; types JPEG/PNG/WebP (server-sniffed). No
server-side thumbnails in v1 (deferred). Pre-launch → destructive dev migration OK.

**Scale/Scope**: Hundreds of users/listings; small galleries. Worker-proxied serving is correct-first at
this scale; a public bucket / CDN split can come later without changing the stored refs.

**NEEDS CLARIFICATION**: none — the spec locked the decisions; numeric limits fixed above for planning.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hebrew-First & RTL** — Upload controls + galleries are RTL, strings i18n-externalized (he/en),
  logical properties only. PASS.
- **II. Accessibility (NON-NEGOTIABLE)** — Every image gets a text alternative (alt defaulting from the
  item name, editable where meaningful, FR-012); upload control is a labeled, keyboard-operable
  `<input type=file>` with visible progress/error; token colors ≥ 4.5:1; covered by the axe e2e gate.
  PASS.
- **III. Mobile-First** — Capture/upload works on 375 px; touch targets ≥ 44 px; client downscale keeps
  uploads feasible on 3G. PASS.
- **Architecture & Engineering Standards** — Layered: `routes/media.ts` → `mediaService` →
  `storageRepository` (R2) + parent repositories; shared Zod/TS contracts (upload response, limits,
  image-ref shape) as SoT; service-binding/first-party (no CORS); tokens-only; i18n-only; structured
  logging; secrets via env; KISS (no new runtime dep, no media table). PASS.
- **Contract-first** — New `POST /api/media`, `DELETE /api/media`, `GET /api/media/*` + the stay/event
  image fields are defined in `packages/shared` first; consumers compile against them. PASS.
- **Privacy/Security** — GPS/EXIF stripped server-side (FR-005); magic-byte sniff (not client MIME);
  owner/admin-only writes (FR-006); visibility-parity serving (FR-007); upload rate-limited. PASS.

**Result**: PASS — no violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/012-media-uploads/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/
│   └── media.md          # upload / delete / serve API + image-ref shape + limits
└── tasks.md              # (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
apps/backend/
├── wrangler.jsonc                         # + r2_buckets binding IMAGES
├── src/env.ts                             # + IMAGES: R2Bucket
├── migrations/0013_*.sql                  # + stay.images, event.images (json text, nullable)
├── src/db/schema.ts                       # stay.images, event.images
├── packages? no — shared below
├── src/lib/imageMeta.ts                   # zero-dep EXIF/GPS strip + magic-byte sniff + upright
├── src/repositories/storageRepository.ts  # R2 put/get/delete/list-by-prefix
├── src/services/mediaService.ts           # validate → strip → store; authz by parent; delete; cleanup
├── src/routes/media.ts                    # POST /api/media, DELETE /api/media, GET /api/media/*
├── src/services/{stayService,eventService,placesService,userService}.ts  # gallery/avatar wiring + delete cleanup
└── test/                                  # media upload/authz/visibility/cleanup + exif-strip unit

apps/frontend/
├── src/lib/media.ts                       # useUploadImage / useDeleteImage (+ client canvas downscale)
├── src/features/media/ImageUploader.tsx   # shared RTL/a11y upload control (progress/error, alt)
├── src/features/media/Gallery.tsx         # shared thumbnail gallery (view/remove/reorder)
├── src/features/{profile,stays,events,places}/…  # wire avatar + listing + place galleries
└── src/i18n/locales/{he,en}.ts            # media.* strings

packages/shared/
└── src/schemas/media.ts                   # ImageRef, upload response, IMAGE_LIMITS, allowed types; index export
```

**Structure Decision**: Existing monorepo web-app layout. A new `media` slice (backend service +
repository + route + shared contract + two reusable FE components) plus thin wiring into the four
consumers and one additive migration. R2 is a new binding but not a new architectural layer — the
`storageRepository` isolates it exactly like `DB` is isolated behind the Drizzle repositories.

## Complexity Tracking

> No constitution violations — section intentionally empty.
