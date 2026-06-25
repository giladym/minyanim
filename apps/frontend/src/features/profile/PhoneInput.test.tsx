import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { PhoneInput } from "./PhoneInput";
import "../../i18n";

describe("PhoneInput", () => {
  it("builds an E.164 from the country + a local number (drops the trunk 0)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PhoneInput onChange={onChange} />); // defaults to Israel (+972)
    await user.type(screen.getByLabelText("מספר טלפון"), "0541234567");
    expect(onChange).toHaveBeenLastCalledWith("+972541234567");
  });

  it("recomputes when the country changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PhoneInput onChange={onChange} />);
    await user.type(screen.getByLabelText("מספר טלפון"), "0541234567");
    await user.selectOptions(screen.getByLabelText("מדינה"), "US");
    expect(onChange).toHaveBeenLastCalledWith("+1541234567");
  });

  it("emits empty string when the number is blank", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PhoneInput onChange={onChange} />);
    await user.type(screen.getByLabelText("מספר טלפון"), "0");
    expect(onChange).toHaveBeenLastCalledWith(""); // "0" → no national digits
  });
});
