import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const useNotifications = vi.fn();
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("../../lib/notifications", () => ({
  useNotifications: () => useNotifications(),
  useMarkAllRead: () => ({ mutate: vi.fn() }),
  useMarkRead: () => ({ mutate: vi.fn() }),
}));

import { NotificationsInbox } from "./NotificationsInbox";
import "../../i18n";

describe("NotificationsInbox", () => {
  it("renders notifications with localized kind labels", () => {
    useNotifications.mockReturnValue({
      data: { unread: 1, notifications: [{ id: "n1", eventId: "evt_1", kind: "quorum_reached", city: "זקופנה", country: "פולין", eventDate: 0, read: false, createdAt: 0 }] },
      isLoading: false,
    });
    render(<NotificationsInbox />);
    expect(screen.getByText(/יש מניין/)).toBeInTheDocument();
    expect(screen.getByText("זקופנה, פולין")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "סימון הכל כנקרא" })).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    useNotifications.mockReturnValue({ data: { unread: 0, notifications: [] }, isLoading: false });
    render(<NotificationsInbox />);
    expect(screen.getByText("אין עדיין התראות.")).toBeInTheDocument();
  });
});
