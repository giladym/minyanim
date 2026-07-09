import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlacesResponse } from "@minyanim/shared";

let data: PlacesResponse;
vi.mock("../../lib/places", () => ({ usePlaces: () => ({ data, isLoading: false }) }));
vi.mock("./PlacesMap", () => ({ PlacesMap: () => <div data-testid="places-map" /> }));
vi.mock("../stays/LocationPicker", () => ({ LocationPicker: () => <div data-testid="location-picker" /> }));

import { PlacesView } from "./PlacesView";
import "../../i18n";

beforeEach(() => {
  window.history.replaceState({}, "", "/places?lat=51.5&lng=-0.12");
  data = {
    layers: [
      { id: "l1", name: "בתי כנסת", icon: null, displayOrder: 0, active: true },
      { id: "l2", name: "מסעדות", icon: null, displayOrder: 1, active: true },
    ],
    places: [
      { id: "p1", layerId: "l1", name: "שול מרכזי", description: null, lat: 51.5, lng: -0.12, address: "1 Rd", phone: null, hours: null, images: [], kosherMeta: null, attribution: "© OpenStreetMap contributors" },
      { id: "p2", layerId: "l2", name: "פלאפל", description: null, lat: 51.51, lng: -0.11, address: null, phone: null, hours: null, images: [], kosherMeta: { dietary: "parve" }, attribution: null },
    ],
  };
});

describe("PlacesView (010 US1)", () => {
  it("lists nearby places with navigation links + attribution, and layer toggles", () => {
    render(<PlacesView />);
    expect(screen.getByText("שול מרכזי")).toBeInTheDocument();
    expect(screen.getByText("פלאפל")).toBeInTheDocument();
    // Google Maps link points at the place coords.
    const g = screen.getAllByRole("link", { name: "Google Maps" })[0]!;
    expect(g).toHaveAttribute("href", expect.stringContaining("query=51.5,-0.12"));
    // Attribution rendered where present.
    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();
    // Map is present (stubbed).
    expect(screen.getByTestId("places-map")).toBeInTheDocument();
  });

  it("toggling a layer off hides its places (map + list)", async () => {
    const user = userEvent.setup();
    render(<PlacesView />);
    await user.click(screen.getByRole("button", { name: "מסעדות" })); // toggle restaurants off
    expect(screen.queryByText("פלאפל")).not.toBeInTheDocument();
    expect(screen.getByText("שול מרכזי")).toBeInTheDocument(); // synagogue still shown
  });
});
