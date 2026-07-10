# Quickstart — Image Uploads (Shared Media Pipeline)

Validates the media pipeline end-to-end. Assumes the monorepo dev setup and migrations 0001–0012 applied.

## Prerequisites

```bash
pnpm install
# R2 binding is added to wrangler.jsonc during implementation; local dev uses miniflare's R2 sim.
pnpm --filter @minyanim/backend db:migrate:local   # includes 0013 (stay.images, event.images)
pnpm dev
```

## Scenario 1 — Avatar upload / replace / remove (US1, SC-001/002)

1. Sign in; open Profile.
2. Upload a JPEG avatar → progress shows, then the avatar renders; reload the roster/organizer card/
   messages → the avatar appears there too.
3. Upload a different image → the new avatar replaces it; the old object is gone (see Scenario 6).
4. Remove the avatar → surfaces fall back to an initials/placeholder (no broken image).
5. Try a `.txt` renamed to `.jpg` and a > 5 MB image → both rejected with a localized message; profile
   still saves.

## Scenario 2 — Stay / Minyan gallery (US2, SC-003/006)

1. As a Stay owner, add 2–3 photos to your Stay → they render on the listing.
2. Sign in as a **different** user and attempt `POST /api/media {kind:"stay", parentId:<not yours>}` →
   `403 auth.forbidden`.
3. Flag the Stay from 3 accounts (006 auto-hide) → open it as a non-owner → `404`, and
   `GET /api/media/stay/<id>/<file>` also `404`s (hidden parent hides images, SC-003).
4. For a contact-tier listing, a not-yet-committed viewer does not receive the owner-private image refs.

## Scenario 3 — Place photos (US3)

1. As an admin (`/admin/places`), add a photo to a place → it renders in the place's gallery on the
   places/discovery map.
2. As a non-admin, `POST /api/media {kind:"place"}` → `403`.
3. Open a place imported from OSM → its source attribution still renders alongside any uploaded photo.

## Scenario 4 — EXIF / GPS stripping (SC-005)

```bash
# Upload a JPEG known to contain GPS EXIF, then fetch the stored object and confirm no GPS remains.
# (The exif-strip unit test asserts this directly against a fixture buffer.)
```
Expected: the served image contains no GPS/location metadata.

## Scenario 5 — Best-effort (SC-008)

1. With the network throttled so an upload fails, confirm the Stay/Minyan/profile still saves and the
   page works; the failed image simply isn't added and an error is shown.

## Scenario 6 — Orphan cleanup (SC-004)

1. Add photos to a Stay, then permanently delete the Stay (004 hard-delete).
2. Confirm `list` of the `stay/<id>/` R2 prefix is empty (no orphaned objects). Same for deleting a place,
   a user, and merging a seed user (009) that had an avatar.

## Automated gates

```bash
pnpm --filter @minyanim/shared typecheck
pnpm --filter @minyanim/backend typecheck && pnpm --filter @minyanim/backend test   # media upload/authz/visibility/cleanup + exif-strip unit
pnpm --filter frontend typecheck && pnpm --filter frontend test                     # ImageUploader/Gallery + i18n parity
pnpm --filter frontend test:e2e -- profile stays admin                              # Playwright + axe (WCAG AA), SC-007
```

**Expected**: all green; upload controls + galleries pass axe (WCAG 2.1 AA), RTL, keyboard-operable,
every image has alt text; he/en parity holds.
