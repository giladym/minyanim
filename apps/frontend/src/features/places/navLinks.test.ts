import { describe, it, expect } from "vitest";
import { googleMapsUrl, wazeUrl } from "./navLinks";

describe("navLinks", () => {
  it("builds a Google Maps search URL with coords + encoded name", () => {
    expect(googleMapsUrl(48.87, 2.35, "פיצה כשרה")).toBe(
      `https://www.google.com/maps/search/?api=1&query=48.87,2.35(${encodeURIComponent("פיצה כשרה")})`,
    );
    expect(googleMapsUrl(48.87, 2.35)).toBe("https://www.google.com/maps/search/?api=1&query=48.87,2.35");
  });

  it("builds a Waze navigate URL", () => {
    expect(wazeUrl(48.87, 2.35)).toBe("https://waze.com/ul?ll=48.87,2.35&navigate=yes");
  });
});
