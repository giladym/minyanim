import type { AllowedImageType } from "@minyanim/shared";

/**
 * Image sniffing + metadata stripping (012), pure and zero-dependency so it runs in the Workers
 * runtime with no WASM codec. We never trust the client-declared MIME — the type is decided by magic
 * bytes — and we strip location/EXIF metadata before storing (FR-005) by dropping the metadata
 * segments/chunks WITHOUT decoding the pixel data (fast, lossless).
 */

/** Decide the image type from magic bytes, or null if it isn't a supported image. */
export function sniffType(b: Uint8Array): AllowedImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  // RIFF....WEBP
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/** Strip GPS/EXIF (and other metadata) segments. Unknown/malformed input is returned unchanged. */
export function stripMetadata(b: Uint8Array, type: AllowedImageType): Uint8Array {
  try {
    if (type === "image/jpeg") return stripJpeg(b);
    if (type === "image/webp") return stripWebp(b);
    if (type === "image/png") return stripPng(b);
  } catch {
    /* fall through — never fail an upload on a strip hiccup; the client also re-encodes via canvas */
  }
  return b;
}

/** JPEG: drop APP1 (EXIF/XMP) + COM (comment) segments; copy everything else, incl. compressed data. */
function stripJpeg(b: Uint8Array): Uint8Array {
  const g = (n: number): number => b[n] ?? 0;
  if (g(0) !== 0xff || g(1) !== 0xd8) return b; // not SOI
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 1 < b.length) {
    if (g(i) !== 0xff) break; // desync → stop
    const marker = g(i + 1);
    // Standalone markers (no length): SOI/EOI/TEM and RSTn.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      // Start of Scan → the rest is entropy-coded image data; copy verbatim to the end.
      for (let k = i; k < b.length; k++) out.push(g(k));
      return Uint8Array.from(out);
    }
    const segLen = (g(i + 2) << 8) | g(i + 3); // includes the 2 length bytes
    const total = 2 + segLen;
    const drop = marker === 0xe1 || marker === 0xfe; // APP1 (EXIF/XMP) or COM
    if (!drop) for (let k = i; k < i + total && k < b.length; k++) out.push(g(k));
    i += total;
  }
  return Uint8Array.from(out);
}

/** WebP (RIFF): drop the EXIF and XMP chunks; fix the RIFF file-size field. */
function stripWebp(b: Uint8Array): Uint8Array {
  const g = (n: number): number => b[n] ?? 0;
  const out: number[] = [];
  for (let k = 0; k < 12; k++) out.push(g(k)); // "RIFF" + size(placeholder) + "WEBP"
  let i = 12;
  const td = new TextDecoder("ascii");
  while (i + 8 <= b.length) {
    const fourcc = td.decode(b.subarray(i, i + 4));
    const size = g(i + 4) | (g(i + 5) << 8) | (g(i + 6) << 16) | (g(i + 7) << 24);
    const padded = size + (size & 1); // chunks are padded to an even length
    const chunkTotal = 8 + padded;
    const drop = fourcc === "EXIF" || fourcc === "XMP ";
    if (!drop) for (let k = i; k < i + chunkTotal && k < b.length; k++) out.push(g(k));
    i += chunkTotal;
  }
  // Rewrite RIFF size = total bytes after the first 8 (fileSize field itself excluded).
  const riffSize = out.length - 8;
  out[4] = riffSize & 0xff;
  out[5] = (riffSize >> 8) & 0xff;
  out[6] = (riffSize >> 16) & 0xff;
  out[7] = (riffSize >> 24) & 0xff;
  return Uint8Array.from(out);
}

/** PNG: drop metadata chunks (eXIf, tEXt, iTXt, zTXt); keep structural + pixel chunks. */
function stripPng(b: Uint8Array): Uint8Array {
  const g = (n: number): number => b[n] ?? 0;
  const out: number[] = [];
  for (let k = 0; k < 8; k++) out.push(g(k)); // 8-byte PNG signature
  let i = 8;
  const td = new TextDecoder("ascii");
  const DROP = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);
  while (i + 12 <= b.length) {
    const len = (g(i) << 24) | (g(i + 1) << 16) | (g(i + 2) << 8) | g(i + 3);
    const type = td.decode(b.subarray(i + 4, i + 8));
    const chunkTotal = 12 + len; // length(4) + type(4) + data(len) + CRC(4)
    if (!DROP.has(type)) for (let k = i; k < i + chunkTotal && k < b.length; k++) out.push(g(k));
    i += chunkTotal;
    if (type === "IEND") break;
  }
  return Uint8Array.from(out);
}
