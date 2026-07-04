import { describe, it, expect } from "vitest";
import { pickHeaderImage, HEADER_IMAGES, REGION_IMAGES } from "./headerImages";

describe("pickHeaderImage — region matching by coordinates", () => {
  const cases: [string, number, number, keyof typeof REGION_IMAGES][] = [
    ["Warsaw (Poland)", 52.23, 21.0, "europe"],
    ["New York (Americas)", 40.71, -74.0, "americas"],
    ["Tokyo (Far East)", 35.68, 139.7, "fareast"],
    ["Cape Town (Africa)", -33.92, 18.42, "africa"],
    ["Jerusalem (Mideast)", 31.77, 35.21, "mideast"],
  ];

  it.each(cases)("%s → an image from the matching region bucket", (name, lat, lng, region) => {
    expect(REGION_IMAGES[region]).toContain(pickHeaderImage("stay_" + name, lat, lng));
  });

  it("is deterministic for the same seed + coords", () => {
    expect(pickHeaderImage("stay_1krakow", 50.06, 19.94)).toBe(pickHeaderImage("stay_1krakow", 50.06, 19.94));
  });

  it("cities in the same region are coherent (Warsaw + Kraków both from europe)", () => {
    expect(REGION_IMAGES.europe).toContain(pickHeaderImage("warsaw", 52.23, 21.0));
    expect(REGION_IMAGES.europe).toContain(pickHeaderImage("krakow", 50.06, 19.94));
  });

  it("falls back to the full set when coords are missing (manual city)", () => {
    expect(HEADER_IMAGES).toContain(pickHeaderImage("manual-city", null, null));
  });
});
