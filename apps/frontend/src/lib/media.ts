import { useMutation } from "@tanstack/react-query";
import { IMAGE_LIMITS, type ImageKind, type UploadResponse } from "@minyanim/shared";
import { ApiError, api } from "./api";

const MAX_DIM = 1600; // downscale cap — keeps phone photos under the size limit + strips metadata

/**
 * Downscale + re-encode an image via canvas before upload. This keeps large phone photos under the
 * server size cap AND strips all metadata client-side (the server strip is still authoritative).
 * Falls back to the original file if the browser can't decode it (the server will validate/reject).
 */
async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Upload one image; returns its stored ref. Uses raw fetch (multipart — not the JSON `api` helper). */
export async function uploadImage(kind: ImageKind, parentId: string, file: File): Promise<string> {
  const body = await downscale(file);
  if (body.size > IMAGE_LIMITS.maxBytes) throw new ApiError(400, { errors: [{ field: "file", code: "image.too_large" }] });
  const form = new FormData();
  form.append("file", body, "upload.jpg");
  form.append("kind", kind);
  form.append("parentId", parentId);
  const res = await fetch("/api/media", { method: "POST", credentials: "include", body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data ?? { errors: [] });
  return (data as UploadResponse).ref;
}

export function useUploadImage(kind: ImageKind) {
  return useMutation({
    mutationFn: ({ parentId, file }: { parentId: string; file: File }) => uploadImage(kind, parentId, file),
  });
}

export const deleteImage = (ref: string) => api<{ ok: true }>("/media", { method: "DELETE", body: JSON.stringify({ ref }) });

export function useDeleteImage() {
  return useMutation({ mutationFn: (ref: string) => deleteImage(ref) });
}
