import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const navigate = vi.fn();
const mutateAsync = vi.fn();
const search = vi.fn(() => ({}) as Record<string, unknown>);
const getStayMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, useSearch: () => search() }));
vi.mock("../../lib/events", () => ({ useHostMinyan: () => ({ mutateAsync, isPending: false }) }));
vi.mock("../../lib/stays", () => ({ getStay: (id: string) => getStayMock(id) }));
// Stub the heavy LocationPicker (map + geo) with a button that sets a valid coord location.
vi.mock("../stays/LocationPicker", () => ({
  LocationPicker: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95 })}>set-location</button>
  ),
}));

import { HostMinyanForm } from "./HostMinyanForm";
import "../../i18n";

beforeEach(() => {
  vi.clearAllMocks();
  search.mockReturnValue({}); // default: no ?fromStay prefill
});

describe("HostMinyanForm", () => {
  it("hosts a minyan with a services array and navigates to its detail page", async () => {
    mutateAsync.mockResolvedValue({ id: "evt_1" });
    const user = userEvent.setup();
    render(<HostMinyanForm />);

    await user.click(screen.getByRole("button", { name: "set-location" }));
    await user.type(screen.getByLabelText("תאריך"), "2030-01-05");
    // Add a second tefilla so we exercise the services editor.
    await user.click(screen.getByRole("button", { name: /הוספת תפילה/ }));
    await user.click(screen.getByRole("button", { name: "אירוח המניין" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0]![0];
    expect(payload.city).toBe("זקופנה");
    expect(payload.lat).toBe(49.3);
    expect(payload.minyan.services.length).toBe(2);
    expect(payload.minyan.services[0].tefilla).toBe("shacharit");
    expect(navigate).toHaveBeenCalledWith({ to: "/minyan/$id", params: { id: "evt_1" } });
  });

  it("blocks submit until a location with coordinates is chosen", async () => {
    const user = userEvent.setup();
    render(<HostMinyanForm />);
    await user.type(screen.getByLabelText("תאריך"), "2030-01-05");
    await user.click(screen.getByRole("button", { name: "אירוח המניין" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("יש להזין עיר ומדינה.")).toBeInTheDocument();
  });

  it("prefills location + date and shows the nearby-notify notice from discovery params", async () => {
    search.mockReturnValue({ lat: 48.2082, lng: 16.3738, city: "וינה", country: "אוסטריה", date: "2030-01-05", nearby: 11 });
    render(<HostMinyanForm />);
    await waitFor(() => expect(screen.getByLabelText("תאריך")).toHaveValue("2030-01-05"));
    expect(screen.getByText(/11 אנשים עם מיקום באזור/)).toBeInTheDocument();
    expect(getStayMock).not.toHaveBeenCalled(); // discovery path doesn't fetch a stay
  });

  it("pre-fills the date with the stay's first Shabbat when arrived via ?fromStay (#4)", async () => {
    // 14–16 Jul 2026: the covered Saturday is 18 Jul? No — 11 Jul is Sat; range 14–16 has no Sat.
    // Use 13–19 Jul 2026 which covers Sat 18 Jul 2026.
    search.mockReturnValue({ fromStay: "stay_1" });
    getStayMock.mockResolvedValue({
      city: "קרקוב", country: "פולין", lat: 50.06, lng: 19.94,
      arrivalDate: Date.UTC(2026, 6, 13), departureDate: Date.UTC(2026, 6, 19),
      bringsSeferTorah: true,
    });
    render(<HostMinyanForm />);
    await waitFor(() => expect(getStayMock).toHaveBeenCalledWith("stay_1"));
    // First Saturday in the range (18 Jul 2026) seeds the date input.
    await waitFor(() => expect(screen.getByLabelText("תאריך")).toHaveValue("2026-07-18"));
  });
});
