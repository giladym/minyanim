import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerStayDTO } from "@minyanim/shared";

const fetchNextPage = vi.fn();
let infinite: {
  data: { pages: { stays: OwnerStayDTO[]; nextCursor: string | null }[] };
  isLoading: boolean;
  isError: boolean;
  fetchNextPage: typeof fetchNextPage;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock("../../lib/stays", () => ({
  useStaysInfinite: () => infinite,
}));

import { HistoryPage } from "./HistoryPage";
import "../../i18n";

const stay = (id: string, departure: number, tag: "attended" | "cancelled"): OwnerStayDTO => ({
  id,
  city: "רומא",
  country: "איטליה",
  lat: null,
  lng: null,
  addressPrivate: null,
  arrivalDate: departure - 2 * 86400000,
  departureDate: departure,
  numMen: 2,
  bringsSeferTorah: false,
  prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
  status: tag === "cancelled" ? "cancelled" : "active",
  isPast: tag === "attended",
  coversShabbat: false,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  groupMembers: null,
  notes: null,
  folderId: null,
  historyTag: tag,
  createdAt: 0,
  updatedAt: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  infinite = {
    data: {
      pages: [
        {
          stays: [
            stay("s1", Date.UTC(2026, 4, 3), "attended"),
            stay("s2", Date.UTC(2025, 10, 3), "cancelled"),
          ],
          nextCursor: "c1",
        },
      ],
    },
    isLoading: false,
    isError: false,
    fetchNextPage,
    hasNextPage: true,
    isFetchingNextPage: false,
  };
});

describe("HistoryPage (US2 — display, tags, year groups, infinite scroll)", () => {
  it("groups by year and tags attended vs cancelled", () => {
    render(<HistoryPage />);
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("2025")).toBeInTheDocument();
    expect(screen.getByText("התקיימה")).toBeInTheDocument(); // attended
    expect(screen.getByText("בוטלה")).toBeInTheDocument(); // cancelled
    expect(screen.getAllByTestId("history-card")).toHaveLength(2);
  });

  it("loads the next page on demand when a cursor remains", async () => {
    const user = userEvent.setup();
    render(<HistoryPage />);
    await user.click(screen.getByRole("button", { name: "טען עוד" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state and no load-more when there is no history", () => {
    infinite.data = { pages: [{ stays: [], nextCursor: null }] };
    infinite.hasNextPage = false;
    render(<HistoryPage />);
    expect(screen.getByText("אין עדיין שהיות בהיסטוריה.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "טען עוד" })).not.toBeInTheDocument();
  });
});
