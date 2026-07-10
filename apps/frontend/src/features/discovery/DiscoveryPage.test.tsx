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
// KosherPlacesCard (day-to-day entry) fetches active layers via useLayers — stub it (no QueryClient).
vi.mock("../../lib/places", () => ({ useLayers: () => ({ data: { layers: [] } }) }));
// No pre-fill seed in these tests (the search params come from the FR-019 link in real use).
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { DiscoveryPage } from "./DiscoveryPage";
import "../../i18n";

const RESULT = {
  potential: [{
    shabbat: "2027-08-07", menCount: 11, seferTorahCount: 2,
    travelers: [
      { name: "יוסי", phone: "+972501112233", numMen: 2 },
      { name: "אורח פרטי", phone: null, numMen: 1 },
    ],
  }],
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
  places: [
    { id: "place_c1", layerId: "layer_chabad_houses", name: "בית חב״ד זקופנה", description: null,
      lat: 49.3, lng: 19.95, address: "רחוב 1", phone: "+48180000000", hours: null, images: [], kosherMeta: null, attribution: null },
  ],
  layers: [{ id: "layer_chabad_houses", name: "בתי חב״ד", icon: "chabad", displayOrder: 0, active: true }],
  attribution: "© MapTiler © OpenStreetMap contributors",
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
    // The joinable minyan row shows a clear join affordance; the potential section offers hosting.
    expect(screen.getByText(/להצטרפות/)).toBeInTheDocument();
    expect(screen.getByText("ארגון מניין כאן")).toBeInTheDocument();
    // Travelers in the area are listed with contact for those who share a phone (Excel-enabler).
    expect(screen.getByText(/יוסי/)).toBeInTheDocument();
    const waLink = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "https://wa.me/972501112233");
    expect(waLink).toBeTruthy();
    expect(screen.getByText(/אורח פרטי/)).toBeInTheDocument();
  });

  it("badges the viewer's own minyan and swaps the CTA to 'manage' (#2)", async () => {
    const own = {
      ...RESULT,
      minyanim: [{ ...RESULT.minyanim[0], id: "evt_own", viewerIsHost: true }],
    };
    useDiscovery.mockReturnValue({ data: own, isFetching: false });
    const user = userEvent.setup();
    render(<DiscoveryPage />);

    await user.type(screen.getByLabelText("חיפוש עיר"), "Zako");
    await user.click(await screen.findByRole("button", { name: "Zakopane, Poland" }));
    await user.type(screen.getByLabelText("מתאריך"), "2027-08-01");
    await user.type(screen.getByLabelText("עד תאריך"), "2027-08-31");

    expect(await screen.findByText("המניין שלך")).toBeInTheDocument();
    expect(screen.getByText(/לניהול המניין/)).toBeInTheDocument();
    expect(screen.queryByText(/להצטרפות/)).not.toBeInTheDocument();
  });

  it("renders a place-layer toggle (Chabad houses) that flips its pressed state (011)", async () => {
    useDiscovery.mockReturnValue({ data: RESULT, isFetching: false });
    const user = userEvent.setup();
    render(<DiscoveryPage />);
    await user.type(screen.getByLabelText("חיפוש עיר"), "Zako");
    await user.click(await screen.findByRole("button", { name: "Zakopane, Poland" }));
    await user.type(screen.getByLabelText("מתאריך"), "2027-08-01");
    await user.type(screen.getByLabelText("עד תאריך"), "2027-08-31");

    const toggle = await screen.findByRole("button", { name: "בתי חב״ד", pressed: true });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "בתי חב״ד", pressed: false })).toBeInTheDocument();
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
