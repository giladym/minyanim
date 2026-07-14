import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlacesResponse } from "@minyanim/shared";

let data: PlacesResponse;
vi.mock("../../lib/places", () => ({
  usePlaces: () => ({ data, isLoading: false }),
  usePlacesInBbox: () => ({ data: undefined, isFetching: false }),
}));
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
      { id: "p2", layerId: "l2", name: "פלאפל", description: null, lat: 51.51, lng: -0.11, address: null, phone: null, hours: null, images: [], kosherMeta: { dietary: "parve" }, attribution: "© OpenStreetMap contributors" },
    ],
  };
});

describe("PlacesView (010 US1)", () => {
  it("defaults to only the kosher food layers on (restaurants shown, synagogues hidden)", () => {
    render(<PlacesView />);
    // Restaurant place visible by default; the synagogue layer starts OFF.
    expect(screen.getByText("פלאפל")).toBeInTheDocument();
    expect(screen.queryByText("שול מרכזי")).not.toBeInTheDocument();
    // Toggle pressed-state mirrors the default: restaurants ON, synagogues OFF.
    expect(screen.getByRole("button", { name: "מסעדות", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "בתי כנסת", pressed: false })).toBeInTheDocument();
  });

  it("builds a Google Maps link (coords only, no name suffix) + renders attribution", () => {
    render(<PlacesView />);
    const g = screen.getAllByRole("link", { name: "Google Maps" })[0]!;
    // Coords-only link at the (visible) restaurant's point — no `(name)` suffix.
    expect(g).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=51.51,-0.11");
    expect(g.getAttribute("href")).not.toContain("(");
    // Attribution rendered where present.
    expect(screen.getByText("© OpenStreetMap contributors")).toBeInTheDocument();
    // Map is present (stubbed).
    expect(screen.getByTestId("places-map")).toBeInTheDocument();
  });

  it("toggling a hidden layer on reveals its places; toggling a shown one off hides them", async () => {
    const user = userEvent.setup();
    render(<PlacesView />);
    // Synagogue starts hidden — turning it on reveals its place.
    await user.click(screen.getByRole("button", { name: "בתי כנסת" }));
    expect(screen.getByText("שול מרכזי")).toBeInTheDocument();
    // Restaurants start on — turning them off hides the restaurant place.
    await user.click(screen.getByRole("button", { name: "מסעדות" }));
    expect(screen.queryByText("פלאפל")).not.toBeInTheDocument();
    expect(screen.getByText("שול מרכזי")).toBeInTheDocument();
  });
});
