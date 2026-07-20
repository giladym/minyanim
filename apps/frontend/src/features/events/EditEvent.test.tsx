import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const navigate = vi.fn();
const useMinyan = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ id: "evt_1" }),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));
vi.mock("../../lib/events", () => ({
  useMinyan: () => useMinyan(),
  useUpdateEvent: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useHostEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHostMinyan: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../lib/stays", () => ({ getStay: vi.fn() }));
vi.mock("../../lib/discovery", () => ({ useDiscovery: () => ({ data: undefined }) }));
vi.mock("../stays/LocationPicker", () => ({ LocationPicker: () => <div>location-picker</div> }));

import { EditEventPage } from "./EditEventPage";
import "../../i18n";

const gathering = {
  id: "evt_1", type: "gathering", category: "hosting", isHost: true,
  title: "סעודת ליל שבת", city: "וינה", country: "אוסטריה", lat: 48.2, lng: 16.3,
  eventDate: Date.UTC(2099, 0, 2), startTime: "18:30", endTime: null,
  occasion: "shabbat", notes: "ברוכים הבאים", rsvpMode: "approval", visibility: "public",
  rsvpCutoff: null, capacity: 8, seatsRemaining: 8,
  addressPrivate: "רחוב הרצל 1", addressNotes: null,
  attrs: { mealType: "shabbat_lunch", kashrut: "glatt", dietary: [], offering: null, bringItems: null, alcohol: false, accessibility: null },
  hostName: "דוד", hostImage: null, images: null, status: "forming", confirmedCount: 0,
  pendingRequests: [], attendees: [], myStatus: null,
  hostContact: { name: "דוד", phone: null, email: null }, createdAt: 0, updatedAt: 0,
};

const minyan = {
  id: "evt_1", type: "minyan", category: null, isHost: true,
  city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, eventDate: Date.UTC(2030, 0, 5),
  nusach: "sefard", seferTorah: true, services: [{ tefilla: "shacharit", time: "08:30" }],
  notes: null, addressPrivate: "כתובת סודית", addressNotes: null, hostName: "דוד",
  committedMen: 1, status: "forming", isShabbatShacharit: true,
  missingForReady: { menShort: 9, seferTorah: false, baalKorei: true },
  rolesFilled: { baalTefila: false, baalKorei: false }, images: null, createdAt: 0, updatedAt: 0,
  hostContact: { name: "דוד", phone: null, email: null }, participants: [], myRoles: { baalTefila: false, baalKorei: false },
};

beforeEach(() => vi.clearAllMocks());

describe("EditEventPage — host edit (014)", () => {
  it("prefills a gathering and submits a PATCH, then navigates to the event detail", async () => {
    useMinyan.mockReturnValue({ data: gathering, isLoading: false });
    updateMutateAsync.mockResolvedValue({ id: "evt_1" });
    const user = userEvent.setup();
    render(<EditEventPage />);

    // Prefilled from the loaded event, and rendered in EDIT mode (save-changes button, locked location).
    expect(screen.getByLabelText("כותרת")).toHaveValue("סעודת ליל שבת");
    expect(screen.getByLabelText("סוג הסעודה")).toHaveValue("shabbat_lunch");
    expect(screen.getByText("עריכת אירוע")).toBeInTheDocument();
    expect(screen.getByText(/לא ניתן לשנות את המיקום/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "שמירת שינויים" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    const payload = updateMutateAsync.mock.calls[0]![0];
    expect(payload.title).toBe("סעודת ליל שבת");
    expect(payload.capacity).toBe(8);
    expect(payload.gathering.mealType).toBe("shabbat_lunch");
    expect(payload.occasion).toBe("shabbat");
    // The PATCH body carries no immutable fields (location/date are absent from UpdateEventInput).
    expect(payload.city).toBeUndefined();
    expect(payload.eventDate).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith({ to: "/event/$id", params: { id: "evt_1" }, search: {} });
  });

  it("prefills a minyan and submits a PATCH with the services array", async () => {
    useMinyan.mockReturnValue({ data: minyan, isLoading: false });
    updateMutateAsync.mockResolvedValue({ id: "evt_1" });
    const user = userEvent.setup();
    render(<EditEventPage />);

    expect(screen.getByLabelText("נוסח")).toHaveValue("sefard");
    expect(screen.getByText("עריכת מניין")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "שמירת שינויים" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    const payload = updateMutateAsync.mock.calls[0]![0];
    expect(payload.nusach).toBe("sefard");
    expect(payload.services).toEqual([{ tefilla: "shacharit", time: "08:30" }]);
    expect(payload.seferTorah).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ to: "/minyan/$id", params: { id: "evt_1" } });
  });

  it("redirects a non-host viewer to the public event detail (no edit form)", async () => {
    // A non-owner tier has no `isHost` flag.
    const { isHost: _omit, ...notOwner } = gathering;
    useMinyan.mockReturnValue({ data: notOwner, isLoading: false });
    render(<EditEventPage />);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/event/$id", params: { id: "evt_1" }, search: {} }),
    );
    expect(screen.queryByRole("button", { name: "שמירת שינויים" })).not.toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });
});
