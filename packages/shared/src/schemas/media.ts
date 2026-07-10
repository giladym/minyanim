/**
 * Shared media contracts (012). Image bytes live in R2; a renderable **ref** string is stored on the
 * parent row (`user.image`, `stay.images`, `event.images`, `place.images`). One pipeline serves avatars,
 * Stay/Minyan galleries, and place photos.
 */

/** The upload target — drives the R2 key prefix + which parent the ref attaches to. */
export type ImageKind = "avatar" | "stay" | "event" | "place";
export const IMAGE_KINDS: readonly ImageKind[] = ["avatar", "stay", "event", "place"];

/** Accepted upload types (sniffed by magic bytes server-side — never trust the client MIME). */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** File-extension per accepted type (used to build the stored key). */
export const IMAGE_EXT: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Enforced identically server-side (authoritative) and client-side (hints). */
export const IMAGE_LIMITS = {
  /** Max bytes per image (5 MB). */
  maxBytes: 5_242_880,
  /** Max photos in a place / stay / minyan gallery. */
  galleryMax: 6,
  /** Avatars are replace-one. */
  avatarMax: 1,
} as const;

/** Response from a successful upload — the ref to append to (or set on) the parent. */
export interface UploadResponse {
  /** App-relative renderable ref, e.g. "/api/media/stay/<id>/<uuid>.jpg". */
  ref: string;
}
