import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { OwnerStayDTO } from "@minyanim/shared";

// Link stub that exposes its target + search as data-attributes for assertions.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: { to: string; search?: unknown; children: React.ReactNode }) => (
    <a data-to={to} data-search={JSON.stringify(search ?? {})}>{children}</a>
  ),
}));
vi.mock("../../lib/profile", () => ({ useProfile: () => ({ data: { havdalahOpinion: "geonim" } }) }));
vi.mock("../../lib/zmanim", () => ({ useStayZmanim: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock("../../lib/config", () => ({ useMaptilerTileKey: () => undefined, staticMapUrl: () => null }));

import { StayCard } from "./StayCard";
import "../../i18n";

const stay: OwnerStayDTO = {
  id: "stay_1", city: "קרקוב", country: "פולין", lat: 50.06, lng: 19.94, addressPrivate: null,
  arrivalDate: Date.UTC(2026, 6, 14), departureDate: Date.UTC(2026, 6, 16), numMen: 2,
  bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
  status: "active", isPast: false, coversShabbat: false, contactName: null, contactPhone: null,
  contactEmail: null, groupMembers: null, notes: null, folderId: null, historyTag: null, images: null,
  createdAt: 0, updatedAt: 0,
};

describe("StayCard — post-save 'add a minyan' promotion (#4)", () => {
  it("shows the promotion only when justSaved, with host (prefilled) + find CTAs", () => {
    render(<StayCard stay={stay} highlighted justSaved onCancel={vi.fn()} />);
    expect(screen.getByText("רוצים מניין כאן?")).toBeInTheDocument();

    const host = screen.getByText("הוספת מניין").closest("a")!;
    expect(host).toHaveAttribute("data-to", "/minyan/new");
    expect(host.getAttribute("data-search")).toContain("stay_1"); // fromStay prefill

    const find = screen.getByText("חיפוש מניינים באזור").closest("a")!;
    expect(find).toHaveAttribute("data-to", "/discovery");
  });

  it("hides the promotion when not justSaved", () => {
    render(<StayCard stay={stay} highlighted={false} onCancel={vi.fn()} />);
    expect(screen.queryByText("רוצים מניין כאן?")).not.toBeInTheDocument();
  });

  it("makes the header tappable into the location (edit) for an active stay", () => {
    render(<StayCard stay={stay} highlighted={false} onCancel={vi.fn()} />);
    // The header wraps the city name in a link into this specific location's edit view.
    expect(screen.getByText("קרקוב").closest("a")).toHaveAttribute("data-to", "/stays/$id/edit");
  });

  it("dismisses the promotion", async () => {
    const user = userEvent.setup();
    render(<StayCard stay={stay} highlighted justSaved onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "סגירה" }));
    expect(screen.queryByText("רוצים מניין כאן?")).not.toBeInTheDocument();
  });
});
