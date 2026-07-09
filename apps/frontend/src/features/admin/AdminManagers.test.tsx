import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LayerDTO, PlaceDTO } from "@minyanim/shared";

const createLayer = vi.fn(() => Promise.resolve({}));
const createPlace = vi.fn(() => Promise.resolve({}));
let layers: LayerDTO[];
let places: PlaceDTO[];

vi.mock("../../lib/places", () => ({
  useAdminLayers: () => ({ data: { layers }, isLoading: false }),
  useAdminPlaces: () => ({ data: { places }, isLoading: false }),
  useCreateLayer: () => ({ mutateAsync: createLayer, isPending: false }),
  useUpdateLayer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLayer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePlace: () => ({ mutateAsync: createPlace, isPending: false }),
  useUpdatePlace: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePlace: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// Stub the map picker (its MapLibre/geo deps aren't needed to test the manager UI).
vi.mock("../stays/LocationPicker", () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));

import { AdminLayersManager } from "./AdminLayersManager";
import { AdminPlacesManager } from "./AdminPlacesManager";
import "../../i18n";

beforeEach(() => {
  vi.clearAllMocks();
  layers = [{ id: "l1", name: "מסעדות", icon: null, displayOrder: 0, active: true }];
  places = [{ id: "p1", layerId: "l1", name: "פיצה", description: null, lat: 48.87, lng: 2.35, address: null, phone: null, hours: null, images: [], kosherMeta: null, attribution: null }];
});

describe("AdminLayersManager", () => {
  it("lists layers and creates one via the form", async () => {
    const user = userEvent.setup();
    render(<AdminLayersManager />);
    expect(screen.getAllByDisplayValue("מסעדות").length).toBeGreaterThan(0); // the layer row's name input
    await user.type(screen.getByPlaceholderText("שם השכבה"), "בתי כנסת"); // the create-form input (row inputs have no placeholder)
    await user.click(screen.getByRole("button", { name: "הוספה" }));
    expect(createLayer).toHaveBeenCalledWith({ name: "בתי כנסת", icon: null });
  });
});

describe("AdminPlacesManager", () => {
  it("lists places grouped by layer name and shows the create form", () => {
    render(<AdminPlacesManager />);
    expect(screen.getByText("פיצה")).toBeInTheDocument();
    expect(screen.getByLabelText("שם המקום")).toBeInTheDocument();
    expect(screen.getByTestId("location-picker")).toBeInTheDocument();
  });

  it("blocks saving an incomplete place (no coords/layer)", async () => {
    const user = userEvent.setup();
    render(<AdminPlacesManager />);
    await user.type(screen.getByLabelText("שם המקום"), "מקום חדש");
    await user.click(screen.getByRole("button", { name: "הוספה" }));
    expect(createPlace).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("יש למלא שם, שכבה ומיקום על המפה.");
  });
});
