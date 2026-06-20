import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const navigate = vi.fn();
const mutateAsync = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../lib/events", () => ({ useHostMinyan: () => ({ mutateAsync, isPending: false }) }));
// Stub the heavy LocationPicker (map + geo) with a button that sets a valid coord location.
vi.mock("../stays/LocationPicker", () => ({
  LocationPicker: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95 })}>set-location</button>
  ),
}));

import { HostMinyanForm } from "./HostMinyanForm";
import "../../i18n";

beforeEach(() => vi.clearAllMocks());

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
});
