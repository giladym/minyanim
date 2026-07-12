import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const navigate = vi.fn();
const mutateAsync = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));
vi.mock("../../lib/events", () => ({ useHostEvent: () => ({ mutateAsync, isPending: false }) }));
vi.mock("../../lib/stays", () => ({ getStay: vi.fn() }));
vi.mock("../stays/LocationPicker", () => ({
  LocationPicker: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ city: "וינה", country: "אוסטריה", lat: 48.2, lng: 16.3 })}>set-location</button>
  ),
}));

import { HostEventForm } from "./HostEventForm";
import "../../i18n";

beforeEach(() => vi.clearAllMocks());

describe("HostEventForm — hosting create flow (T027/T032)", () => {
  it("publishes a hosting gathering with capacity + attrs and navigates to /event/$id", async () => {
    mutateAsync.mockResolvedValue({ id: "evt_9" });
    const user = userEvent.setup();
    render(<HostEventForm kind="hosting" ctx={{}} />);

    await user.click(screen.getByRole("button", { name: "set-location" }));
    await user.type(screen.getByLabelText("תאריך"), "2099-01-02");

    await user.click(screen.getByRole("button", { name: "פרסום האירוע" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0]![0];
    expect(payload.type).toBe("gathering");
    expect(payload.category).toBe("hosting");
    expect(payload.capacity).toBe(6); // default guest seats
    expect(payload.gathering.mealType).toBe("shabbat_dinner");
    expect(payload.rsvpMode).toBe("approval"); // hosting default
    // A Shabbat meal-type derives occasion=Shabbat and seeds a start time (required for hosting).
    expect(payload.occasion).toBe("shabbat");
    expect(payload.startTime).toBe("18:00");
    expect(navigate).toHaveBeenCalledWith({ to: "/event/$id", params: { id: "evt_9" }, search: {} });
  });

  it("blocks publish until a location with coordinates is chosen", async () => {
    const user = userEvent.setup();
    render(<HostEventForm kind="hosting" ctx={{}} />);
    await user.type(screen.getByLabelText("תאריך"), "2099-01-02");
    await user.click(screen.getByRole("button", { name: "פרסום האירוע" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("יש להזין עיר ומדינה.")).toBeInTheDocument();
  });

  it("social branch defaults to open RSVP and sends the subcategory", async () => {
    mutateAsync.mockResolvedValue({ id: "evt_s" });
    const user = userEvent.setup();
    render(<HostEventForm kind="social" ctx={{}} />);
    await user.click(screen.getByRole("button", { name: "set-location" }));
    await user.type(screen.getByLabelText("תאריך"), "2099-01-02");
    await user.click(screen.getByRole("button", { name: "פרסום האירוע" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0]![0];
    expect(payload.category).toBe("social");
    expect(payload.rsvpMode).toBe("open");
    expect(payload.gathering.subcategory).toBe("kiddush");
  });
});
