import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks for the API / Query / router layer ────────────────────────────────
// The form pulls smart-default contact from the profile and runs its mutations through the
// stays hooks; we stub those so the unit test never touches the network or a real router.
const navigate = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ id: "stay_1" }),
}));

vi.mock("../../lib/profile", () => ({
  getProfile: vi.fn(() =>
    Promise.resolve({ name: "דוד כהן", phones: [{ id: "p1", e164: "+972500000000", label: null }] }),
  ),
}));

vi.mock("../../lib/stays", () => ({
  useCreateStay: () => ({ isPending: false, mutateAsync: createMutate }),
  useUpdateStay: () => ({ isPending: false, mutateAsync: updateMutate }),
  getStay: vi.fn(),
}));

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

  it("rejects departure before arrival with date.range_invalid", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-12", "2099-01-10");
    await user.click(submitButton());
    expect(await screen.findByText(HE["date.range_invalid"])).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("rejects a man count below 1 with num_men.too_low", async () => {
    const user = userEvent.setup();
    render(<AddEditStayForm />);
    await fillLocationManually(user, "לונדון", "בריטניה");
    await fillDates(user, "2099-01-10", "2099-01-12");
    const men = screen.getByLabelText("כמה גברים בקבוצה (כולל אותך)");
    await user.clear(men);
    await user.type(men, "0");
    await user.click(submitButton());
    expect(await screen.findByText(HE["num_men.too_low"])).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
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
});

describe("AddEditStayForm — smart defaults & disclosure", () => {
  it("defaults numMen to 1", async () => {
    render(<AddEditStayForm />);
    expect(screen.getByLabelText("כמה גברים בקבוצה (כולל אותך)")).toHaveValue(1);
    // Let the async profile prefill settle so its state update isn't an unwrapped act() warning.
    await screen.findByRole("button", { name: "שמירת שהייה" });
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

// ── helpers ──────────────────────────────────────────────────────────────────
function submitButton() {
  return screen.getByRole("button", { name: "שמירת שהייה" });
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
  await user.click(screen.getByRole("button", { name: "הזנת עיר ומדינה ידנית" }));
  await user.type(screen.getByLabelText("עיר"), city);
  await user.type(screen.getByLabelText("מדינה"), country);
}
