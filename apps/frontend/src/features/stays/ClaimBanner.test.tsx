import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClaimableSeedDTO } from "@minyanim/shared";

let seeds: ClaimableSeedDTO[];
const mutate = vi.fn();

vi.mock("../../lib/claims", () => ({
  useClaimableSeeds: () => ({ data: { seeds } }),
  useClaimSeeds: () => ({ mutate, isPending: false, isError: false }),
}));

import { ClaimBanner } from "./ClaimBanner";
import "../../i18n";

beforeEach(() => {
  vi.clearAllMocks();
  seeds = [];
});

describe("ClaimBanner (F4)", () => {
  it("renders nothing when there are no matched seeds", () => {
    const { container } = render(<ClaimBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a claim and merges all matched seeds on confirm", async () => {
    seeds = [
      { seedUserId: "s1", name: "אבי", phone: "+972501112222", stays: 2, events: 1 },
      { seedUserId: "s2", name: "דן", phone: "+972501112222", stays: 1, events: 0 },
    ];
    const user = userEvent.setup();
    render(<ClaimBanner />);
    expect(screen.getByText("מצאנו נסיעות שקשורות אליכם")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "כן, צרפו אותם" }));
    expect(mutate).toHaveBeenCalledWith(["s1", "s2"]);
  });

  it("hides on dismiss", async () => {
    seeds = [{ seedUserId: "s1", name: "אבי", phone: "+972501112222", stays: 1, events: 0 }];
    const user = userEvent.setup();
    render(<ClaimBanner />);
    await user.click(screen.getByRole("button", { name: "לא עכשיו" }));
    expect(screen.queryByText("מצאנו נסיעות שקשורות אליכם")).not.toBeInTheDocument();
  });
});
