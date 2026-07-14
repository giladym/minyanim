import { describe, it, expect } from "vitest";
import { googleMapsUrl, wazeUrl } from "./navLinks";

describe("navLinks", () => {
  it("builds a Google Maps search URL from coords only (no name suffix)", () => {
    const url = googleMapsUrl(48.87, 2.35);
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=48.87,2.35");
    // A bare coord pair drops a pin at the exact point; a `(name)` suffix would break the search.
    expect(url).not.toContain("(");
  });

  it("builds a Waze navigate URL", () => {
    expect(wazeUrl(48.87, 2.35)).toBe("https://waze.com/ul?ll=48.87,2.35&navigate=yes");
  });
});
