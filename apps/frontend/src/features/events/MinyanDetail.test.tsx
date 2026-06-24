import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ id: "evt_1" }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
// Signed-in viewer (so the public-but-authed path shows the Join form, not the sign-in CTA).
vi.mock("../../lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "viewer" } } }) } }));

const useMinyan = vi.fn();
const commitMutateAsync = vi.fn();
const withdrawMutate = vi.fn();
const noop = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("../../lib/events", () => ({
  useMinyan: () => useMinyan(),
  useCancelMinyan: () => noop,
  useUpdateMinyan: () => noop,
  useCommit: () => ({ mutateAsync: commitMutateAsync, isPending: false }),
  useChangeCommitment: () => noop,
  useWithdraw: () => ({ mutate: withdrawMutate, isPending: false }),
  useClaimRole: () => noop,
  useReleaseRole: () => noop,
  useFlagMinyan: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}));
vi.mock("../../lib/zmanim", () => ({
  useMinyanZmanim: () => ({
    data: { coversShabbat: false, hasCoordinates: true, candleLightingOffsetMinutes: 18, shabbatot: [] },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("../../lib/profile", () => ({ useProfile: () => ({ data: { havdalahOpinion: "geonim" } }) }));

import { MinyanDetail } from "./MinyanDetail";
import "../../i18n";

const base = {
  id: "evt_1", type: "minyan", city: "זקופנה", country: "פולין", lat: 49.3, lng: 19.95,
  eventDate: Date.UTC(2030, 0, 5), nusach: "ashkenaz", seferTorah: true,
  services: [{ tefilla: "shacharit", time: "08:30" }], notes: null, hostName: "דוד",
  committedMen: 8, status: "forming", isShabbatShacharit: true,
  missingForReady: { menShort: 2, seferTorah: false, baalKorei: true },
  rolesFilled: { baalTefila: false, baalKorei: false }, createdAt: 0, updatedAt: 0,
};

beforeEach(() => vi.clearAllMocks());

describe("MinyanDetail — commit UI", () => {
  it("public viewer can join", async () => {
    useMinyan.mockReturnValue({ data: base, isLoading: false });
    commitMutateAsync.mockResolvedValue({ minyan: {}, conflict: false });
    const user = userEvent.setup();
    render(<MinyanDetail />);
    expect(screen.getByText("הצטרפות למניין")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "הצטרפות" }));
    await waitFor(() => expect(commitMutateAsync).toHaveBeenCalledTimes(1));
  });

  it("committed participant sees address + withdraw, not a join button", async () => {
    useMinyan.mockReturnValue({
      data: { ...base, addressPrivate: "Secret 1", hostContact: { name: "דוד", phone: null, email: "d@x.com" }, participants: [{ userId: "u", name: "דוד", numMen: 8, phone: null, email: "d@x.com" }], myRoles: { baalTefila: false, baalKorei: false } },
      isLoading: false,
    });
    render(<MinyanDetail />);
    expect(screen.getByText("Secret 1", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("אתם רשומים")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "הצטרפות" })).not.toBeInTheDocument();
  });

  it("shows the contact roster: WhatsApp/email per member, organizer badge, no buttons for self", () => {
    useMinyan.mockReturnValue({
      data: {
        ...base, addressPrivate: "Secret 1",
        hostContact: { name: "אבי", phone: "+972501112222", email: "avi@x.com" },
        participants: [
          { userId: "host1", name: "אבי", numMen: 9, phone: "+972501112222", email: "avi@x.com", isHost: true },
          { userId: "viewer", name: "אני", numMen: 2, phone: "+972503334444", email: null },
        ],
        myRoles: { baalTefila: false, baalKorei: false },
      },
      isLoading: false,
    });
    render(<MinyanDetail />);
    expect(screen.getByText("מי מגיע")).toBeInTheDocument();
    expect(screen.getByText("מארגן")).toBeInTheDocument(); // host badge
    // Host (not the viewer) gets an actionable WhatsApp deep link.
    const wa = screen.getByRole("link", { name: /וואטסאפ — אבי/ });
    expect(wa).toHaveAttribute("href", "https://wa.me/972501112222");
    // The viewer's own row exposes no contact buttons.
    expect(screen.queryByRole("link", { name: /וואטסאפ — אני/ })).not.toBeInTheDocument();
  });

  it("host sees host controls and no join/commit UI", () => {
    useMinyan.mockReturnValue({
      data: { ...base, addressPrivate: "Secret 1", hostContact: { name: "דוד", phone: null, email: "d@x.com" }, participants: [], myRoles: { baalTefila: false, baalKorei: false }, isHost: true },
      isLoading: false,
    });
    render(<MinyanDetail />);
    expect(screen.getByText("ניהול המארח")).toBeInTheDocument();
    expect(screen.queryByText("הצטרפות למניין")).not.toBeInTheDocument();
    expect(screen.queryByText("אתם רשומים")).not.toBeInTheDocument();
  });
});
