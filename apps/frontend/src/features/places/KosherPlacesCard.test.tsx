import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Stub the layers query (no QueryClient in this unit test) and the router Link.
const useLayers = vi.fn();
vi.mock("../../lib/places", () => ({ useLayers: () => useLayers() }));
let lastSearch: unknown = null;
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search: unknown }) => {
    lastSearch = search;
    return <a data-testid="open-map">{children}</a>;
  },
}));

import { KosherPlacesCard } from "./KosherPlacesCard";
import "../../i18n";

describe("KosherPlacesCard", () => {
  it("renders the layer chips and a link prefilled with the anchor location", () => {
    useLayers.mockReturnValue({ data: { layers: [
      { id: "l1", name: "בתי כנסת", icon: null, displayOrder: 10, active: true },
      { id: "l2", name: "מסעדות כשרות", icon: null, displayOrder: 20, active: true },
    ] } });
    render(<KosherPlacesCard lat={52.2} lng={21.0} city="ורשה" country="פולין" />);
    expect(screen.getByText("בתי כנסת")).toBeInTheDocument();
    expect(screen.getByText("מסעדות כשרות")).toBeInTheDocument();
    expect(screen.getByTestId("open-map")).toBeInTheDocument();
    expect(lastSearch).toEqual({ lat: 52.2, lng: 21.0, city: "ורשה", country: "פולין" });
  });

  it("passes only the city when coordinates are absent (city-only Stay → geocoded later)", () => {
    useLayers.mockReturnValue({ data: { layers: [] } });
    render(<KosherPlacesCard lat={null} lng={null} city="ורשה" country="פולין" />);
    expect(lastSearch).toEqual({ lat: undefined, lng: undefined, city: "ורשה", country: "פולין" });
  });

  it("renders nothing when there is no location to anchor to", () => {
    useLayers.mockReturnValue({ data: { layers: [] } });
    const { container } = render(<KosherPlacesCard lat={null} lng={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
