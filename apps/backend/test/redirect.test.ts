import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "../src/lib/redirect";

describe("safeRedirectPath (open-redirect guard)", () => {
  it("allows a relative same-origin path", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });
  it("rejects an absolute URL", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/");
  });
  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/");
  });
  it("falls back when empty", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
  });
});
