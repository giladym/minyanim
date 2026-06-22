import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

// Stub the geo proxy (city search) and the discovery query hook so the test never hits the network.
vi.mock("../../lib/geo", () => ({
  searchPlaces: vi.fn(() =>
    Promise.resolve({ results: [{ city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95, label: "Zakopane, Poland" }], attribution: "© MapTiler" }),
  ),
}));

const useDiscovery = vi.fn();
vi.mock("../../lib/discovery", () => ({ useDiscovery: (p: unknown) => useDiscovery(p) }));
// DiscoveryMap reads the runtime tile key; stub it so the optional map stays hidden in tests.
vi.mock("../../lib/config", () => ({ useMaptilerTileKey: () => undefined }));
// No pre-fill seed in these tests (the search params come from the FR-019 link in real use).
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { DiscoveryPage } from "./DiscoveryPage";
import "../../i18n";

const RESULT = {
  potential: [{ shabbat: "2027-08-07", menCount: 11, seferTorahCount: 2 }],
  minyanim: [
    {
      id: "evt_1", type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
      eventDate: Date.UTC(2027, 7, 7), nusach: "ashkenaz", seferTorah: true,
      services: [{ tefilla: "shacharit", time: "08:30" }], notes: null, hostName: "דוד",
      committedMen: 8, status: "forming", isShabbatShacharit: true,
      missingForReady: { menShort: 2, seferTorah: false, baalKorei: true },
      rolesFilled: { baalTefila: false, baalKorei: false }, createdAt: 0, updatedAt: 0,
    },
  ],
  beitChabad: [], attribution: "© MapTiler © OpenStreetMap contributors",
};

describe("DiscoveryPage", () => {
  it("searches a city, applies dates, and renders potential + hosted minyanim", async () => {
    useDiscovery.mockReturnValue({ data: RESULT, isFetching: false });
    const user = userEvent.setup();
    render(<DiscoveryPage />);

    await user.type(screen.getByLabelText("חיפוש עיר"), "Zako");
    const pick = await screen.findByRole("button", { name: "Zakopane, Poland" });
    await user.click(pick);
    await user.type(screen.getByLabelText("מתאריך"), "2027-08-01");
    await user.type(screen.getByLabelText("עד תאריך"), "2027-08-31");

    // Minyan in the area bucket + hosted minyan render.
    expect(await screen.findByText("2027-08-07")).toBeInTheDocument();
    expect(screen.getByText(/11 גברים/)).toBeInTheDocument();
    expect(screen.getByText("זקופנה, פולין")).toBeInTheDocument();
    expect(screen.getByText(/8\/10 נרשמו/)).toBeInTheDocument();
    // Missing Ba'al Korei surfaced (FR-006).
    await waitFor(() => expect(screen.getByText(/בעל קורא/)).toBeInTheDocument());
  });

  it("shows nothing until a center and dates are chosen", () => {
    useDiscovery.mockReturnValue({ data: undefined, isFetching: false });
    render(<DiscoveryPage />);
    expect(screen.queryByText("מניינים באזור")).not.toBeInTheDocument();
  });

  it("prompts to pick dates once a city is chosen but dates are missing (#3 clarity)", async () => {
    useDiscovery.mockReturnValue({ data: undefined, isFetching: false });
    const user = userEvent.setup();
    render(<DiscoveryPage />);
    await user.type(screen.getByLabelText("חיפוש עיר"), "Zako");
    await user.click(await screen.findByRole("button", { name: "Zakopane, Poland" }));
    // City picked, no dates yet → an explicit hint explains why nothing is searched.
    expect(await screen.findByText(/בחרו תאריך הגעה ועזיבה/)).toBeInTheDocument();
  });
});
