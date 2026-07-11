import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Stub the nearby-places query (no QueryClient here) and the router Link.
const usePlaces = vi.fn();
vi.mock("../../lib/places", () => ({ usePlaces: (lat: number | null, lng: number | null) => usePlaces(lat, lng) }));
let lastSearch: unknown = null;
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search: unknown }) => {
    lastSearch = search;
    return <a data-testid="open-map">{children}</a>;
  },
}));

import { KosherPlacesCard } from "./KosherPlacesCard";
import "../../i18n";

const LAYERS = [
  { id: "lyr_osm_worship", name: "Synagogues", icon: null, displayOrder: 10, active: true },
  { id: "lyr_osm_restaurants", name: "Kosher restaurants", icon: null, displayOrder: 20, active: true },
  { id: "lyr_osm_mikvehs", name: "Mikvehs", icon: null, displayOrder: 30, active: true },
];
const place = (id: string, layerId: string) => ({
  id, layerId, name: id, description: null, lat: 52, lng: 21, address: null, phone: null, hours: null, images: [], kosherMeta: null, attribution: null,
});

describe("KosherPlacesCard", () => {
  it("lists only layers present nearby (with counts) + a prefilled link", () => {
    usePlaces.mockReturnValue({ data: { layers: LAYERS, places: [place("a", "lyr_osm_worship"), place("b", "lyr_osm_worship"), place("c", "lyr_osm_restaurants")] } });
    render(<KosherPlacesCard lat={52.2} lng={21.0} city="ורשה" country="פולין" />);
    // Present layers are localized (he) and show counts; the absent "Mikvehs" layer is NOT listed.
    expect(screen.getByText("בתי כנסת")).toBeInTheDocument();
    expect(screen.getByText("מסעדות כשרות")).toBeInTheDocument();
    expect(screen.queryByText("מקוואות")).not.toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 synagogues
    expect(lastSearch).toEqual({ lat: 52.2, lng: 21.0, city: "ורשה", country: "פולין" });
  });

  it("shows the hint (no chips) when nothing is nearby / coords absent", () => {
    usePlaces.mockReturnValue({ data: undefined });
    render(<KosherPlacesCard lat={null} lng={null} city="ורשה" country="פולין" />);
    expect(screen.getByTestId("open-map")).toBeInTheDocument();
    expect(lastSearch).toEqual({ lat: undefined, lng: undefined, city: "ורשה", country: "פולין" });
  });

  it("renders nothing when there is no location to anchor to", () => {
    usePlaces.mockReturnValue({ data: undefined });
    const { container } = render(<KosherPlacesCard lat={null} lng={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
