import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks for the API / Query / router layer ────────────────────────────────
// The form pulls smart-default contact from the profile and runs its mutations through the
// stays hooks; we stub those so the unit test never touches the network or a real router.
const navigate = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();
const getStayMock = vi.fn();
const createFolderMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ id: "stay_1" }),
  useSearch: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
// KosherPlacesCard (shown on edit) fetches active layers via useLayers — stub it (no QueryClient).
vi.mock("../../lib/places", () => ({ useLayers: () => ({ data: { layers: [] } }) }));

vi.mock("../../lib/profile", () => ({
  getProfile: vi.fn(() =>
    Promise.resolve({ name: "דוד כהן", phones: [{ id: "p1", e164: "+972500000000", label: null }] }),
  ),
}));

vi.mock("../../lib/stays", () => ({
  useCreateStay: () => ({ isPending: false, mutateAsync: createMutate }),
  useUpdateStay: () => ({ isPending: false, mutateAsync: updateMutate }),
  getStay: (...args: unknown[]) => getStayMock(...args),
}));

vi.mock("../../lib/folders", () => ({
  useFolders: () => ({
    data: [
      { id: "fld_a", name: "אירופה 2026", stayCount: 2, pinned: true, createdAt: 0 },
      { id: "fld_b", name: "אסיה", stayCount: 0, pinned: true, createdAt: 1 },
    ],
  }),
  useCreateFolder: () => ({ isPending: false, mutateAsync: createFolderMock }),
}));
// LocationPicker reads the runtime tile key; stub it so the optional map stays hidden in tests.
vi.mock("../../lib/config", () => ({ useMaptilerTileKey: () => undefined }));

import { AddEditStayForm } from "./AddEditStayForm";
import "../../i18n";

/** Read the Hebrew error text rendered for a given shared error code. */
const HE = {
  "location.required": "יש להזין עיר ומדינה.",
  "date.range_invalid": "תאריך העזיבה חייב להיות בתאריך ההגעה או אחריו.",
  "num_men.too_low": "יש להזין לפחות גבר אחד.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddEditStayForm — validation (create)", () => {
  it("flags a missing location with location.required", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    // Fill dates + men so location is the only missing required field.
    await fillDates(user, "2099-01-10", "2099-01-12");
    await user.click(submitButton());
    // Both city and country are empty, so the location.required message renders for each.
    expect((await screen.findAllByText(HE["location.required"])).length).toBeGreaterThan(0);
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("surfaces an error summary and focuses the first invalid field on a failed submit", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    // Leave the location empty so submit fails on it.
    await fillDates(user, "2099-01-10", "2099-01-12");
    await user.click(submitButton());
    // A summary hint appears near the button (count of flagged fields interpolated).
    expect(await screen.findByText(/יש לתקן את השדות המסומנים/)).toBeInTheDocument();
    // Focus is driven to the first invalid field — the location search box (aria-invalid).
    const search = screen.getByLabelText("חיפוש עיר");
    expect(search).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(search).toHaveFocus());
  });

  it("constrains the date pickers (min/max) to prevent an out-of-order range at entry", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    const arrivalInput = screen.getByLabelText("תאריך הגעה");
    const departureInput = screen.getByLabelText("תאריך עזיבה");
    // With both empty, each picker floors at the soft past-floor (device yesterday, UTC-midnight).
    const floor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(arrivalInput).toHaveAttribute("min", floor);
    expect(departureInput).toHaveAttribute("min", floor);
    // Once a range is chosen, departure can't precede arrival and arrival can't follow departure.
    await fillDates(user, "2099-01-10", "2099-01-12");
    expect(departureInput).toHaveAttribute("min", "2099-01-10");
    expect(arrivalInput).toHaveAttribute("max", "2099-01-12");
  });

  it("rejects departure before arrival with date.range_invalid", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-12", "2099-01-10");
    await user.click(submitButton());
    expect(await screen.findByText(HE["date.range_invalid"])).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("clamps the man count to 1..1000 (no 0 / NaN / huge reaches the server)", () => {
    render(<AddEditStayForm />);
    const men = screen.getByLabelText("כמה גברים בקבוצה (כולל אותך)");
    fireEvent.change(men, { target: { value: "0" } });
    expect(men).toHaveValue(1); // floors at 1
    fireEvent.change(men, { target: { value: "9999" } });
    expect(men).toHaveValue(1000); // caps at 1000
  });

  it("submits a valid Stay and navigates to the dashboard highlighted", async () => {
    createMutate.mockResolvedValue({ id: "stay_new" });
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-10", "2099-01-12");
    await user.click(submitButton());
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ city: "לונדון", country: "בריטניה", numMen: 1 }),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/stays", search: { highlight: "stay_new", flash: "saved" } });
  });

  // M1 — the picked civil date must convert to UTC-midnight epoch (NOT local midnight), so a user
  // in a far-positive timezone picking "today" is not rejected as past by the server.
  it("converts the picked civil date to UTC-midnight epoch (M1)", async () => {
    createMutate.mockResolvedValue({ id: "stay_new" });
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-07-01", "2099-07-03");
    await user.click(submitButton());
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        arrivalDate: Date.UTC(2099, 6, 1),
        departureDate: Date.UTC(2099, 6, 3),
      }),
    );
  });
});

describe("AddEditStayForm — smart defaults & disclosure", () => {
  it("defaults numMen to 1", async () => {
    render(<AddEditStayForm />);
    expect(screen.getByLabelText("כמה גברים בקבוצה (כולל אותך)")).toHaveValue(1);
    // Let the async profile prefill settle so its state update isn't an unwrapped act() warning.
    await screen.findByRole("button", { name: "שמירת יעד" });
  });

  it("pre-fills contact name from the profile", async () => {
    render(<AddEditStayForm />);
    // Reveal optional fields where the contact lives, then assert the profile name is prefilled.
    await userEvent.setup().click(screen.getByRole("button", { name: "פרטים נוספים" }));
    await waitFor(() => expect(screen.getByLabelText("איש קשר")).toHaveValue("דוד כהן"));
  });

  it("hides optional fields until the disclosure is toggled", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    expect(screen.queryByLabelText("כתובת מדויקת")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "פרטים נוספים" }));
    expect(screen.getByLabelText("כתובת מדויקת")).toBeInTheDocument();
  });
});

describe("AddEditStayForm — folder assignment (004 US1 / R10)", () => {
  it("includes the selected folderId in the submitted payload", async () => {
    createMutate.mockResolvedValue({ id: "stay_new" });
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-10", "2099-01-12");
    await user.selectOptions(screen.getByLabelText("תיקייה"), "fld_a");
    await user.click(submitButton());
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ folderId: "fld_a" }));
  });

  it("defaults folderId to null (Unfiled) when none is chosen", async () => {
    createMutate.mockResolvedValue({ id: "stay_new" });
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-10", "2099-01-12");
    await user.click(submitButton());
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ folderId: null }));
  });

  it("assigns an inline-created folder when EDITING (the reported bug)", async () => {
    getStayMock.mockResolvedValue({
      id: "stay_1", city: "פריז", country: "צרפת", lat: null, lng: null,
      arrivalDate: Date.UTC(2099, 0, 10), departureDate: Date.UTC(2099, 0, 12), numMen: 3,
      bringsSeferTorah: false, prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
      status: "active", isPast: false, coversShabbat: false, contactName: null, contactPhone: null,
      contactEmail: null, groupMembers: null, notes: null, folderId: null, historyTag: null, createdAt: 0, updatedAt: 0,
    });
    createFolderMock.mockResolvedValue({ id: "fld_new", name: "טיול", stayCount: 0, pinned: true, createdAt: 9 });
    updateMutate.mockResolvedValue({ id: "stay_1" });
    const user = userEvent.setup();
    render(<AddEditStayForm stayId="stay_1" />);
    await waitFor(() => expect(screen.getByLabelText("תיקייה")).toHaveValue("")); // seeded: no folder
    await user.click(screen.getByRole("button", { name: "תיקייה חדשה" }));
    await user.type(screen.getByLabelText("תיקייה חדשה"), "טיול");
    await user.click(screen.getByRole("button", { name: "יצירה" }));
    await user.click(screen.getByRole("button", { name: "שמירת שינויים" }));
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate).toHaveBeenCalledWith({ id: "stay_1", input: expect.objectContaining({ folderId: "fld_new" }) });
  });

  it("seeds folderId from the loaded Stay on edit", async () => {
    getStayMock.mockResolvedValue({
      id: "stay_1",
      city: "פריז",
      country: "צרפת",
      lat: null,
      lng: null,
      arrivalDate: Date.UTC(2099, 0, 10),
      departureDate: Date.UTC(2099, 0, 12),
      numMen: 3,
      bringsSeferTorah: false,
      prayerNeeds: { weekday: { shacharit: false, mincha: false, maariv: false } },
      status: "active",
      isPast: false,
      coversShabbat: false,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      groupMembers: null,
      notes: null,
      folderId: "fld_b",
      historyTag: null,
      createdAt: 0,
      updatedAt: 0,
    });
    render(<AddEditStayForm stayId="stay_1" />);
    await waitFor(() => expect(screen.getByLabelText("תיקייה")).toHaveValue("fld_b"));
  });

  it("inline-creates a folder and assigns it to the new Stay", async () => {
    createMutate.mockResolvedValue({ id: "stay_new" });
    createFolderMock.mockResolvedValue({ id: "fld_new", name: "חדשה", stayCount: 0, pinned: true, createdAt: 2 });
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-10", "2099-01-12");
    await user.click(screen.getByRole("button", { name: "תיקייה חדשה" }));
    await user.type(screen.getByLabelText("תיקייה חדשה"), "חדשה");
    await user.click(screen.getByRole("button", { name: "יצירה" }));
    await waitFor(() => expect(createFolderMock).toHaveBeenCalledWith("חדשה"));
    await user.click(submitButton());
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ folderId: "fld_new" }));
  });
});

describe("AddEditStayForm — duplicate prefill (004 US3 / D9)", () => {
  const source = {
    id: "stay_src",
    city: "ברצלונה",
    country: "ספרד",
    lat: 41.39,
    lng: 2.16,
    arrivalDate: Date.UTC(2025, 0, 10),
    departureDate: Date.UTC(2025, 0, 12),
    numMen: 7,
    bringsSeferTorah: true,
    prayerNeeds: { weekday: { shacharit: true, mincha: false, maariv: false } },
    status: "active",
    isPast: true,
    coversShabbat: false,
    contactName: "מקור",
    contactPhone: null,
    contactEmail: null,
    groupMembers: null,
    notes: null,
    folderId: "fld_a",
    historyTag: "attended",
    createdAt: 0,
    updatedAt: 0,
  };

  it("prefills details + folder from the source with CLEARED dates, then saves a new Stay", async () => {
    getStayMock.mockResolvedValue(source);
    createMutate.mockResolvedValue({ id: "stay_dup" });
    const user = userEvent.setup();
    render(<AddEditStayForm duplicateFromId="stay_src" />);

    // Details copied; dates cleared (empty inputs).
    await waitFor(() => expect(screen.getByLabelText("כמה גברים בקבוצה (כולל אותך)")).toHaveValue(7));
    expect(screen.getByLabelText("תיקייה")).toHaveValue("fld_a");
    expect(screen.getByLabelText("תאריך הגעה")).toHaveValue("");
    expect(screen.getByLabelText("תאריך עזיבה")).toHaveValue("");

    // Set fresh future dates and save — a normal create with the copied content + new dates.
    await fillDates(user, "2099-03-01", "2099-03-05");
    await user.click(submitButton());
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "ברצלונה",
        numMen: 7,
        folderId: "fld_a",
        arrivalDate: Date.UTC(2099, 2, 1),
        departureDate: Date.UTC(2099, 2, 5),
      }),
    );
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────
function submitButton() {
  return screen.getByRole("button", { name: "שמירת יעד" });
}

async function fillDates(user: ReturnType<typeof userEvent.setup>, arrival: string, departure: string) {
  await user.type(screen.getByLabelText("תאריך הגעה"), arrival);
  await user.type(screen.getByLabelText("תאריך עזיבה"), departure);
}

async function fillLocationManually(
  user: ReturnType<typeof userEvent.setup>,
  city: string,
  country: string,
) {
  await user.click(screen.getByRole("button", { name: "הכנס עיר ידנית" }));
  await user.type(screen.getByLabelText("עיר"), city);
  await user.type(screen.getByLabelText("מדינה"), country);
}
