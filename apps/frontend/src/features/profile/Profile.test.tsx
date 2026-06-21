import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const patchProfile = vi.fn();
let profile: Record<string, unknown>;

vi.mock("../../lib/profile", () => ({
  getProfile: () => Promise.resolve(profile),
  patchProfile: (input: unknown) => patchProfile(input),
  addPhone: vi.fn(),
  deletePhone: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("../../theme/ThemeProvider", () => ({ useTheme: () => ({ setTheme: vi.fn() }) }));
vi.mock("../../lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

import { ProfilePage } from "./Profile";
import "../../i18n";

beforeEach(() => {
  vi.clearAllMocks();
  profile = {
    id: "u1", name: "דוד", email: "d@example.com", language: "he", theme: "system",
    havdalahOpinion: "geonim", phones: [],
  };
});

describe("Profile — Havdalah preference (005 US3)", () => {
  it("renders the current preference and updates it on change", async () => {
    patchProfile.mockResolvedValue({ ...profile, havdalahOpinion: "rabbeinu_tam" });
    const user = userEvent.setup();
    render(<ProfilePage />);

    const select = await screen.findByLabelText("זמן צאת השבת המוצג");
    expect(select).toHaveValue("geonim");

    await user.selectOptions(select, "rabbeinu_tam");
    await waitFor(() => expect(patchProfile).toHaveBeenCalledWith({ havdalahOpinion: "rabbeinu_tam" }));
  });
});
