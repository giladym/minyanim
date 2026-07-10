import { describe, it, expect } from "vitest";
import { sniffType, stripMetadata } from "../src/lib/imageMeta";

describe("imageMeta (012)", () => {
  it("sniffs supported types by magic bytes and rejects others", () => {
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    webp.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
    expect(sniffType(webp)).toBe("image/webp");
    expect(sniffType(new TextEncoder().encode("not an image"))).toBeNull();
  });

  it("strips the JPEG APP1/EXIF (GPS) segment while keeping the scan data", () => {
    // SOI + APP1(EXIF w/ fake GPS marker) + SOS + one data byte + EOI.
    const gps = new TextEncoder().encode("Exif\0\0GPSLatitude");
    const app1Len = gps.length + 2; // length field includes its own 2 bytes
    const jpeg = Uint8Array.from([
      0xff, 0xd8, // SOI
      0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff, ...gps, // APP1
      0xff, 0xda, 0x00, 0x03, 0x42, // SOS (len 3) + 1 scan byte (0x42)
      0xff, 0xd9, // EOI
    ]);
    const out = stripMetadata(jpeg, "image/jpeg");
    const outStr = new TextDecoder("latin1").decode(out);
    expect(outStr.includes("GPSLatitude")).toBe(false); // GPS gone
    expect(Array.from(out.subarray(0, 2))).toEqual([0xff, 0xd8]); // still a JPEG
    expect(out.includes(0x42)).toBe(true); // scan data preserved
    expect(out.length).toBeLessThan(jpeg.length); // segment removed
  });

  it("returns bytes unchanged for a JPEG with no metadata segment", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x03, 0x42, 0xff, 0xd9]);
    expect(Array.from(stripMetadata(jpeg, "image/jpeg"))).toEqual(Array.from(jpeg));
  });
});
