# Feature Specification: Image Uploads (Shared Media Pipeline)

**Feature Branch**: `012-media-uploads`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Image uploads — a shared media pipeline letting users add photos across the app: admin place photos, Stay/Minyan photos, and user avatars, via one reusable upload mechanism."

## Overview

Add the ability to attach photos across the app through **one shared upload mechanism**: admins add
photos to **places**, a traveler/host adds photos to their own **Stay** or **Minyan** (the building,
entrance, or shul interior), and any user sets a profile **avatar**. Photos are best-effort — every core
flow works without them — but they add recognizability and trust: travelers see the actual place, and
users see who they are coordinating with. Uploaded images obey the app's existing visibility and
moderation rules, protect privacy (no leaked location metadata), and meet the Hebrew-first / RTL /
accessibility bar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A user sets a profile avatar (Priority: P1)

Any signed-in user uploads a profile photo from their phone or computer. It appears wherever they are
represented — the minyan roster, the organizer card, and message threads. They can replace or remove it.

**Why this priority**: Avatars are the simplest, self-contained use of the shared pipeline (one image,
one owner, clear authorization) and immediately improve trust in coordination surfaces. Proving the
pipeline end-to-end here de-risks the other two consumers.

**Independent Test**: Sign in, upload an avatar on the profile screen, confirm it renders on the roster /
organizer card / messages; replace it and confirm the new one shows; remove it and confirm a graceful
fallback (initials/placeholder).

**Acceptance Scenarios**:

1. **Given** a signed-in user with no avatar, **When** they upload a valid image, **Then** it is stored
   and shown as their avatar across the app, and the upload shows clear progress then success.
2. **Given** a user with an avatar, **When** they upload a new one, **Then** the new image replaces it and
   the previous stored image is removed (no orphan).
3. **Given** a user with an avatar, **When** they remove it, **Then** surfaces fall back to a placeholder
   with no broken image.
4. **Given** any upload, **When** the file is not an accepted image type or exceeds the size limit,
   **Then** it is rejected with a clear, localized message and nothing is stored.

---

### User Story 2 - A Stay owner / Minyan host adds photos to their listing (Priority: P1)

A traveler adds a few photos to their Stay (or a host to their Minyan) so others can recognize the
building/entrance. Photos appear on the listing subject to the same visibility the listing already has,
and can be reordered/removed by the owner. Only the owner (or an admin) can change them.

**Why this priority**: This is the feature's core product value (recognizability of the place). It
exercises authorization, per-item galleries, visibility tiers, and the moderation interaction.

**Independent Test**: As a Stay owner, add 2–3 photos; confirm they render on the listing for a viewer
who is allowed to see that listing; confirm a non-owner cannot add/remove them; confirm removing one
deletes its stored object.

**Acceptance Scenarios**:

1. **Given** a Stay owner (or Minyan host), **When** they upload up to the allowed number of photos,
   **Then** the photos are stored and shown on their listing, newest additions included.
2. **Given** a non-owner (not admin), **When** they attempt to add or remove photos on someone else's
   listing, **Then** the action is refused.
3. **Given** a listing that is auto-hidden or admin-removed by moderation, **When** any viewer loads it,
   **Then** its photos do not render publicly (they follow the listing's hidden state).
4. **Given** a listing photo taken on a phone with embedded GPS, **When** it is uploaded, **Then** the
   stored image carries no location metadata (privacy).
5. **Given** a listing whose photos are visible only after a viewer is committed (contact-visibility
   tier), **When** a not-yet-committed viewer loads it, **Then** they do not see the owner-private photos
   (photos follow the listing's existing visibility tier).

---

### User Story 3 - An admin curates place photos (Priority: P2)

An admin adds or removes photos on a place through the places manager, filling the place's photo gallery
shown to users on the places/discovery map. Imported places keep their required source attribution;
uploaded photos are the app's own.

**Why this priority**: Reuses the same pipeline for the third consumer; valuable but depends on the
pipeline proven by US1/US2, and admin-only so lower user reach.

**Independent Test**: As an admin, add a photo to a place via the places manager; confirm it renders on
the place's detail/popup; confirm a non-admin cannot; confirm imported places still show their
attribution.

**Acceptance Scenarios**:

1. **Given** an admin on the places manager, **When** they add a photo to a place, **Then** it is stored
   and appears in that place's gallery for users.
2. **Given** a non-admin, **When** they attempt to change a place's photos, **Then** the action is
   refused.
3. **Given** a place imported from an external source, **When** its photos are shown, **Then** the
   required source attribution still renders (uploaded photos do not remove or misattribute it).

---

### Edge Cases

- **Wrong type / oversize / corrupt file**: rejected with a localized message; nothing stored; the core
  flow (saving the Stay/Minyan/profile) still succeeds without the image.
- **Gallery full**: adding beyond the per-item max is refused with a clear message; existing photos are
  untouched.
- **Upload interrupted (flaky mobile network)**: no partial/broken image is persisted or shown; the user
  can retry.
- **Owner/content deleted**: deleting a Stay/Minyan/place/user (including a hard-deleted stay or a merged
  seed user) removes its stored images — no orphaned objects, no broken references.
- **Moderation**: an auto-hidden or admin-removed listing hides its images too; restoring the listing
  restores them.
- **Seed user with an avatar merged into a real user (feature 009)**: the surviving account's avatar is
  consistent and the discarded object is cleaned up.
- **EXIF/orientation**: images display upright; embedded GPS/location metadata is stripped.
- **Missing image at render time**: surfaces degrade to a placeholder, never a broken-image icon.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide one shared, authenticated way to upload an image, receive back a
  stable reference to the stored image, and later render that image — used by all three consumers
  (avatar, Stay/Minyan photos, place photos).
- **FR-002**: The system MUST provide a way to remove a stored image and to replace one (replacing removes
  the prior stored object).
- **FR-003**: The system MUST accept only real image files of the supported types (JPEG, PNG, WebP) and
  MUST reject anything else with a clear, localized error, storing nothing.
- **FR-004**: The system MUST enforce a maximum file size per image and a maximum number of images per
  item — a small gallery for a place/Stay/Minyan and exactly one avatar per user.
- **FR-005**: The system MUST strip location (GPS) metadata from uploaded images before they are stored or
  served.
- **FR-006**: Only the item's owner (the Stay owner, the Minyan host, or the user themselves) or an admin
  MUST be able to add, replace, or remove that item's images.
- **FR-007**: An image MUST be visible only when the item it belongs to is visible to that viewer — a
  moderation-hidden or admin-removed Stay/Minyan hides its images, and owner-private (contact-tier)
  listing photos follow the listing's existing visibility rules.
- **FR-008**: When an item is deleted (including a hard-deleted Stay, a deleted place/Minyan/user, or a
  merged/deleted seed user), the system MUST clean up that item's stored images (no orphans).
- **FR-009**: A user's avatar MUST render wherever the user is represented (roster, organizer card,
  messages), with a graceful placeholder when there is none.
- **FR-010**: Uploaded place photos MUST coexist with imported place data such that any required
  source attribution for imported places continues to render correctly.
- **FR-011**: Images MUST be best-effort — the absence, failure, or slowness of an image MUST NOT block or
  break the core flow (saving a Stay/Minyan/profile, browsing discovery, joining a minyan).
- **FR-012**: Upload controls MUST be Hebrew-first / RTL, mobile-first (usable on a 375 px screen), show
  visible progress and error states, use design tokens for color and localized strings only, and meet
  WCAG 2.1 AA — including a text alternative (alt) for every image, defaulting sensibly from the item's
  name and editable where it carries meaning.
- **FR-013**: The system MUST protect against abusive upload volume with sane per-user/per-item limits (a
  bounded number of images and total size), refusing excess with a clear message.

### Key Entities *(include if feature involves data)*

- **Stored image**: a persisted image object with a stable reference/key, an owner/parent item, content
  type, and creation time. Referenced by the parent item; not shown once its parent is hidden/removed.
- **Avatar** (on User): at most one image reference per user; replacing removes the prior object.
- **Listing gallery** (on Stay and on Minyan): an ordered, bounded set of image references owned by the
  listing owner/host; follows the listing's visibility + moderation state.
- **Place gallery** (on Place, from 010/011): a bounded set of image references (the existing place photo
  collection), now fillable by admin uploads alongside imported image references.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can add an avatar (or a listing/place photo) and see it rendered in under ~30 seconds
  end-to-end on a typical mobile connection, with visible progress throughout.
- **SC-002**: 100% of non-image or oversize uploads are rejected before storage, with a clear localized
  message, and the underlying record still saves.
- **SC-003**: 0 images from a hidden/removed listing render to any viewer; 0 owner-private photos render
  to a not-yet-permitted viewer.
- **SC-004**: 0 orphaned stored images remain after an item (Stay/Minyan/place/user, incl. hard-delete and
  seed merge) is deleted — verified by reconciling stored objects against referenced ones.
- **SC-005**: 0 uploaded images retain GPS/location metadata after storage.
- **SC-006**: Only owners/admins can modify an item's images — 100% of unauthorized attempts are refused.
- **SC-007**: All upload/gallery UI passes the automated accessibility gate (WCAG 2.1 AA) with RTL and
  keyboard operation, and every rendered image has a text alternative; he/en string parity holds.
- **SC-008**: Every core flow (save Stay/Minyan/profile, discovery, join) still completes when an image is
  absent or its upload fails.

## Assumptions

- **Storage & serving**: images live in the platform's object storage (Cloudflare R2, per the locked
  decision) and are served first-party; the exact public-vs-gated serving mechanism per consumer is a
  design decision for planning, constrained by FR-007 (visibility parity).
- **No server-side image processing in v1**: images are stored close to as-uploaded (after EXIF/GPS
  stripping + upright orientation); thumbnail/resize generation is deferred to a later iteration. The
  client may downscale before upload to respect the size limit. (Documented so v1 scope is bounded.)
- **Concrete limits** (tunable): supported types JPEG/PNG/WebP; a per-image max in the low-single-digit
  MB range; up to a handful of photos per place/Stay/Minyan; exactly one avatar per user. Exact numbers
  are set in planning; the requirement is that limits exist and are enforced (FR-004/FR-013).
- **Existing model fields**: the user already has an avatar field and places already have a photo
  collection (010); Stays and Minyanim gain a photo collection in this feature.
- **Moderation reuse**: hiding/removing is the existing 006 mechanism on the parent Stay/Minyan; this
  feature does not add a separate image-moderation queue — hidden parent ⇒ hidden images (FR-007).
- **Pre-launch / no real data**: destructive dev migrations for the new listing photo fields are
  acceptable per project policy.
- **Dependencies**: 002 (Stays), 003 (Minyanim/discovery), 006 (moderation), 008 (messaging avatars),
  009 (seed merge cleanup), 010/011 (place photo collection as SoT).
