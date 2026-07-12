import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const navigate = vi.fn();
const requestMutate = vi.fn();
const changeMutate = vi.fn();
const cancelMutate = vi.fn();
const approveMutate = vi.fn();
const declineMutate = vi.fn();
let session: { user: { id: string } } | null = { user: { id: "viewer" } };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("../../lib/auth-client", () => ({ authClient: { useSession: () => ({ data: session }) } }));
vi.mock("../../lib/events", () => ({
  useRequestSeat: () => ({ mutateAsync: requestMutate, isPending: false }),
  useChangePartySize: () => ({ mutateAsync: changeMutate, isPending: false }),
  useCancelAttendance: () => ({ mutateAsync: cancelMutate, isPending: false }),
  useApproveRequest: () => ({ mutate: approveMutate, isPending: false }),
  useDeclineRequest: () => ({ mutate: declineMutate, isPending: false }),
}));
vi.mock("../media/Avatar", () => ({ Avatar: ({ name }: { name: string }) => <span>{name}</span> }));
vi.mock("../media/Gallery", () => ({ Gallery: () => <div /> }));
vi.mock("../media/ImageUploader", () => ({ ImageUploader: () => <div data-testid="uploader" /> }));
vi.mock("../../lib/media", () => ({ deleteImage: vi.fn() }));
// T046: the Shabbat-zmanim panel uses React Query hooks (no provider in this test) — mock them.
vi.mock("../../lib/zmanim", () => ({ useMinyanZmanim: () => ({ data: undefined, isLoading: false, isError: false }) }));
vi.mock("../../lib/profile", () => ({ useProfile: () => ({ data: { havdalahOpinion: "geonim" } }) }));

import { GatheringDetail } from "./GatheringDetail";
import "../../i18n";

const baseG = {
  id: "e1", type: "gathering", category: "hosting", occasion: "shabbat", title: "סעודת שבת",
  city: "וינה", country: "אוסטריה", lat: 48.2, lng: 16.3, eventDate: Date.UTC(2099, 0, 3),
  startTime: "18:00", endTime: null, rsvpCutoff: null, rsvpMode: "approval", visibility: "public",
  capacity: 4, seatsRemaining: 3, rsvpState: "open", notes: null, hostName: "דוד", hostImage: null,
  images: null, createdAt: 0, updatedAt: 0, status: "forming", confirmedCount: 0,
  attrs: { mealType: "shabbat_dinner", kashrut: "kosher", dietary: [], offering: null, bringItems: null, alcohol: false, accessibility: null },
} as const;

const roster = { ...baseG, hostContact: { name: "דוד", phone: null, email: null }, attendees: null, myStatus: null };

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: "viewer" } };
});

describe("GatheringDetail — seats meter + RSVP band + RequestsPanel (T028/T029/T032)", () => {
  it("seats meter announces remaining seats via aria-live", () => {
    render(<GatheringDetail id="e1" g={roster as never} />);
    const meter = screen.getByText("3 מקומות ליד השולחן");
    expect(meter).toBeInTheDocument();
    expect(meter).toHaveAttribute("aria-live", "polite");
  });

  it("approval mode with a free seat shows 'request a seat' and submits the request", async () => {
    const user = userEvent.setup();
    render(<GatheringDetail id="e1" g={roster as never} />);
    await user.click(screen.getByRole("button", { name: "בקשת מקום" }));
    await waitFor(() => expect(requestMutate).toHaveBeenCalledWith({ partySize: 1 }));
  });

  it("pending status shows the expectation-setting copy + cancel", () => {
    render(<GatheringDetail id="e1" g={{ ...roster, myStatus: "pending" } as never} />);
    expect(screen.getByText(/המארח קיבל התראה/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ביטול הבקשה" })).toBeInTheDocument();
  });

  it("confirmed guest sees the 'you're in' band + exact address", () => {
    const confirmed = {
      ...roster, myStatus: "confirmed", addressPrivate: "רחוב הרצל 5", addressNotes: null,
      attendees: [{ userId: "h", name: "דוד", numMen: 2, phone: null, email: null, image: null, isHost: true }],
    };
    render(<GatheringDetail id="e1" g={confirmed as never} />);
    expect(screen.getByText(/אתם בפנים/)).toBeInTheDocument();
    expect(screen.getByText(/רחוב הרצל 5/)).toBeInTheDocument();
  });

  it("host RequestsPanel approves a fitting request and disables one that won't fit", async () => {
    const owner = {
      ...roster, isHost: true, addressPrivate: "רחוב הרצל 5", addressNotes: null,
      attendees: [{ userId: "h", name: "דוד", numMen: 0, phone: null, email: null, image: null, isHost: true }],
      seatsRemaining: 2,
      pendingRequests: [
        { attendanceId: "a1", userId: "u1", name: "רות", image: null, phone: null, partySize: 2, requestedAt: 0, status: "pending" },
        { attendanceId: "a2", userId: "u2", name: "יוסי", image: null, phone: null, partySize: 6, requestedAt: 0, status: "pending" },
      ],
    };
    const user = userEvent.setup();
    render(<GatheringDetail id="e1" g={owner as never} />);
    const approveFits = screen.getByRole("button", { name: "אישור — רות" });
    const approveTooBig = screen.getByRole("button", { name: "אישור — יוסי" });
    expect(approveFits).toBeEnabled();
    expect(approveTooBig).toBeDisabled();
    await user.click(approveFits);
    expect(approveMutate).toHaveBeenCalledWith("a1");
    await user.click(screen.getByRole("button", { name: "דחייה — רות" }));
    expect(declineMutate).toHaveBeenCalledWith("a1");
  });

  it("signed-out visitor is prompted to sign in to request a seat", () => {
    session = null;
    render(<GatheringDetail id="e1" g={baseG as never} />);
    expect(screen.getByText("התחברו כדי לבקש מקום")).toBeInTheDocument();
  });
});
