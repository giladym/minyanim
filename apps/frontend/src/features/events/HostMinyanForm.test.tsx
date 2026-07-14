import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const navigate = vi.fn();
const mutateAsync = vi.fn();
const search = vi.fn(() => ({}) as Record<string, unknown>);
const getStayMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate, useSearch: () => search() }));
vi.mock("../../lib/events", () => ({
  useHostMinyan: () => ({ mutateAsync, isPending: false }),
  useUpdateEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../lib/stays", () => ({ getStay: (id: string) => getStayMock(id) }));
vi.mock("../../lib/discovery", () => ({ useDiscovery: () => ({ data: undefined }) }));
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

afterEach(() => {
  vi.useRealTimers(); // undo any per-test fake timers so later tests use the real clock
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
    expect(screen.getByText(/11 אנשים עם יעד באזור/)).toBeInTheDocument();
    expect(getStayMock).not.toHaveBeenCalled(); // discovery path doesn't fetch a stay
  });

  it("pre-fills date (first Shabbat), men count, and Sefer Torah when arrived via ?fromStay (#4)", async () => {
    // Freeze "today" before the stay so the past-floor doesn't shift the expected Shabbat.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
    // 13–19 Jul 2026 covers Sat 18 Jul 2026.
    search.mockReturnValue({ fromStay: "stay_1" });
    getStayMock.mockResolvedValue({
      city: "קרקוב", country: "פולין", lat: 50.06, lng: 19.94,
      arrivalDate: Date.UTC(2026, 6, 13), departureDate: Date.UTC(2026, 6, 19),
      numMen: 4, bringsSeferTorah: true,
    });
    render(<HostMinyanForm />);
    await waitFor(() => expect(getStayMock).toHaveBeenCalledWith("stay_1"));
    // First Saturday in the range (18 Jul 2026) seeds the date input.
    await waitFor(() => expect(screen.getByLabelText("תאריך")).toHaveValue("2026-07-18"));
    // Men count carries over from the stay (#1).
    expect(screen.getByLabelText(/כמה גברים מגיעים/)).toHaveValue(4);
  });

  it("skips a past Shabbat: prefills the next upcoming Shabbat when the stay has already started (#1)", async () => {
    // Today is 15 Jul 2026 (a Wednesday), mid-stay. Sat 11 Jul is already past; Sat 18 Jul is next.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T09:00:00.000Z"));
    search.mockReturnValue({ fromStay: "stay_2" });
    getStayMock.mockResolvedValue({
      city: "קרקוב", country: "פולין", lat: 50.06, lng: 19.94,
      arrivalDate: Date.UTC(2026, 6, 8), departureDate: Date.UTC(2026, 6, 20), // 8–20 Jul: covers Sat 11 & 18
      numMen: 2, bringsSeferTorah: false,
    });
    render(<HostMinyanForm />);
    await waitFor(() => expect(getStayMock).toHaveBeenCalledWith("stay_2"));
    await waitFor(() => expect(screen.getByLabelText("תאריך")).toHaveValue("2026-07-18"));
  });
});
