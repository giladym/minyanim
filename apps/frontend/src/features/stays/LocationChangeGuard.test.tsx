import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
const transferMutate = vi.fn();
const useMinyan = vi.fn(() => ({ data: undefined }));
vi.mock("../../lib/events", () => ({
  useMinyan: (id: string) => useMinyan(id),
  useTransferHost: () => ({ mutateAsync: transferMutate }),
}));

import { LocationChangeGuard } from "./LocationChangeGuard";
import "../../i18n";

const linked = [
  { eventId: "evt_h", city: "ורשה", country: "פולין", eventDate: 0, isHost: true },
  { eventId: "evt_p", city: "קרקוב", country: "פולין", eventDate: 0, isHost: false },
];

describe("LocationChangeGuard", () => {
  it("lists linked minyanim and routes each action correctly", async () => {
    const onCancel = vi.fn();
    const onProceed = vi.fn();
    const user = userEvent.setup();
    render(<LocationChangeGuard stayId="stay_1" linked={linked} onCancel={onCancel} onProceed={onProceed} />);

    // Both linked minyanim listed with role badges.
    expect(screen.getByText("ורשה")).toBeInTheDocument();
    expect(screen.getByText("אתם המארגנים")).toBeInTheDocument(); // host badge
    expect(screen.getByText("אתם רשומים")).toBeInTheDocument(); // participant badge

    // "Save anyway" → proceed without unlinking.
    await user.click(screen.getByRole("button", { name: "שמרו בכל זאת" }));
    expect(onProceed).toHaveBeenCalledWith({ unlink: false });

    // "Keep, unlink & save" → proceed with unlink.
    await user.click(screen.getByRole("button", { name: "נתקו את המניינים ושמרו" }));
    expect(onProceed).toHaveBeenCalledWith({ unlink: true });

    // Cancel → abort.
    await user.click(screen.getByRole("button", { name: "ביטול" }));
    expect(onCancel).toHaveBeenCalled();

    // Duplicate → navigate to the duplicate-stay flow (originals untouched).
    await user.click(screen.getByRole("button", { name: /שכפלו ליעד חדש/ }));
    expect(navigate).toHaveBeenCalledWith({ to: "/stays/new", search: { from: "stay_1" } });
  });

  it("offers reassign-host only when a minyan is hosted, and picks from its participants", async () => {
    useMinyan.mockReturnValue({
      data: { participants: [{ userId: "host", name: "מארח", isHost: true }, { userId: "u2", name: "דני", isHost: false }] },
    } as never);
    const user = userEvent.setup();
    render(<LocationChangeGuard stayId="stay_1" linked={linked} onCancel={vi.fn()} onProceed={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "העבירו אירוח ושמרו" }));
    // The hosted minyan's participant (excluding the host) is offered as a new-host option.
    expect(await screen.findByRole("option", { name: "דני" })).toBeInTheDocument();
  });
});
