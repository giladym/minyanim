import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { MyEventRow } from "@minyanim/shared";

// Link stub exposing target + params for assertions.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, search, children }: { to: string; params?: { id?: string }; search?: unknown; children: React.ReactNode }) => (
    <a data-to={to} data-id={params?.id} data-search={JSON.stringify(search ?? {})}>{children}</a>
  ),
}));

// The hook is stubbed per-test via this mutable holder.
const stayEventsData: { current: MyEventRow[] } = { current: [] };
vi.mock("../../lib/stays", () => ({ useStayEvents: () => ({ data: stayEventsData.current }) }));

import { StayEventsSection, StayEventsChip } from "./StayEvents";
import "../../i18n";

const minyanRow: MyEventRow = {
  id: "evt_min", type: "minyan", category: null, title: null, city: "וינה", country: "אוסטריה",
  eventDate: Date.UTC(2027, 5, 4), status: "forming", myStatus: null,
};
const hostingRow: MyEventRow = {
  id: "evt_host", type: "gathering", category: "hosting", title: "סעודת שבת", city: "וינה", country: "אוסטריה",
  eventDate: Date.UTC(2027, 5, 5), status: "forming", myStatus: null,
};

describe("StayEventsSection (015)", () => {
  it("renders the empty state when the location has no events", () => {
    stayEventsData.current = [];
    render(<StayEventsSection stayId="stay_1" />);
    expect(screen.getByText("האירועים שלי כאן")).toBeInTheDocument();
    expect(screen.getByText(/עדיין אין אירועים במיקום הזה/)).toBeInTheDocument();
  });

  it("routes '＋ הוסף אירוע' into the event flow with fromStay prefill", () => {
    stayEventsData.current = [];
    render(<StayEventsSection stayId="stay_42" />);
    const add = screen.getByText("＋ הוסף אירוע").closest("a")!;
    expect(add).toHaveAttribute("data-to", "/event/new");
    expect(add.getAttribute("data-search")).toContain("stay_42");
  });

  it("lists events, linking a minyan to /minyan/$id and a gathering to /event/$id", () => {
    stayEventsData.current = [minyanRow, hostingRow];
    render(<StayEventsSection stayId="stay_1" />);
    const minyan = screen.getByText("וינה, אוסטריה").closest("a")!;
    expect(minyan).toHaveAttribute("data-to", "/minyan/$id");
    expect(minyan).toHaveAttribute("data-id", "evt_min");
    const gathering = screen.getByText("סעודת שבת").closest("a")!;
    expect(gathering).toHaveAttribute("data-to", "/event/$id");
    expect(gathering).toHaveAttribute("data-id", "evt_host");
    expect(screen.queryByText(/עדיין אין אירועים/)).not.toBeInTheDocument();
  });
});

describe("StayEventsChip (015)", () => {
  it("renders nothing when there are no events", () => {
    stayEventsData.current = [];
    const { container } = render(<StayEventsChip stayId="stay_1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a count when the location has events", () => {
    stayEventsData.current = [minyanRow, hostingRow];
    render(<StayEventsChip stayId="stay_1" />);
    expect(screen.getByText("שני אירועים")).toBeInTheDocument();
  });
});
