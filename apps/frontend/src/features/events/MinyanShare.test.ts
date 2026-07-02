import { describe, it, expect } from "vitest";
import { buildShareText, whatsAppHref } from "./MinyanDetail";
import type { PublicMinyanDTO } from "@minyanim/shared";

// A participant-shaped object (carries a private address) to prove the share builder NEVER reads it.
const m = {
  id: "evt_1",
  type: "minyan",
  city: "זקופנה",
  country: "פולין",
  services: [{ tefilla: "shacharit", time: "08:30" }, { tefilla: "mincha", time: null }],
  committedMen: 8,
  addressPrivate: "12 Secret St, apt 4",
  addressNotes: "ring twice, code 1234",
} as unknown as PublicMinyanDTO;

const JOIN = "https://minyanim.app/minyan/evt_1";

describe("WhatsApp share builder (FR-012 / SC-005)", () => {
  it("includes public details + the join link", () => {
    const text = buildShareText(m, JOIN, (tf) => tf);
    expect(text).toContain("זקופנה");
    expect(text).toContain("פולין");
    expect(text).toContain("8/10");
    expect(text).toContain("shacharit 08:30");
    expect(text).toContain(JOIN);
  });

  it("NEVER includes the private address or access notes (SC-005)", () => {
    const text = buildShareText(m, JOIN, (tf) => tf);
    expect(text).not.toContain("Secret");
    expect(text).not.toContain("12 Secret St, apt 4");
    expect(text).not.toContain("1234");
  });

  it("wraps into a wa.me URL with encoded text", () => {
    const href = whatsAppHref(buildShareText(m, JOIN, (tf) => tf));
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain(JOIN);
    expect(decodeURIComponent(href)).not.toContain("Secret");
  });
});
