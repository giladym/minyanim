import { describe, it, expect } from "vitest";
import { toPublicStayDTO, type OwnerStayDTO } from "@minyanim/shared";

const owner: OwnerStayDTO = {
  id: "stay_1",
  city: "לונדון",
  country: "בריטניה",
  lat: 51.5074,
  lng: -0.1278,
  addressPrivate: "12 Secret St",
  arrivalDate: Date.UTC(2027, 0, 10),
  departureDate: Date.UTC(2027, 0, 12),
  numMen: 3,
  status: "active",
  isPast: false,
  coversShabbat: false,
  contactName: "Test",
  contactPhone: "+972500000000",
  contactEmail: "t@example.com",
  groupMembers: null,
  notes: null,
  folderId: null,
  historyTag: null,
  createdAt: Date.UTC(2026, 0, 1),
  updatedAt: Date.UTC(2026, 0, 1),
};

describe("PublicStayDTO (private-field non-exposure, FR-007/D8)", () => {
  it("omits addressPrivate / contactPhone / contactEmail keys entirely", () => {
    const pub = toPublicStayDTO(owner);
    const keys = Object.keys(pub);
    expect(keys).not.toContain("addressPrivate");
    expect(keys).not.toContain("contactPhone");
    expect(keys).not.toContain("contactEmail");
    // Non-private fields survive.
    expect(keys).toContain("city");
    expect(keys).toContain("contactName");
  });

  it("omits the owner-only historyTag from the public projection (004 D11)", () => {
    expect(Object.keys(toPublicStayDTO(owner))).not.toContain("historyTag");
  });
});
