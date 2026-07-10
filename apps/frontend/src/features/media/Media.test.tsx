import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

const uploadImage = vi.fn((_kind: string, _parentId: string, _file: File) => Promise.resolve("/api/media/avatar/u1/x.jpg"));
vi.mock("../../lib/media", () => ({
  uploadImage: (kind: string, parentId: string, file: File) => uploadImage(kind, parentId, file),
  deleteImage: vi.fn(),
}));

import { Avatar } from "./Avatar";
import { Gallery } from "./Gallery";
import { ImageUploader } from "./ImageUploader";
import "../../i18n";

describe("Avatar (012)", () => {
  it("renders the photo with alt text when present", () => {
    render(<Avatar src="/api/media/avatar/u1/x.jpg" name="דוד" />);
    expect(screen.getByRole("img", { name: /דוד/ })).toBeInTheDocument();
  });
  it("falls back to an initials placeholder when there is no photo", () => {
    render(<Avatar src={null} name="דוד" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("ד")).toBeInTheDocument();
  });
});

describe("Gallery (012)", () => {
  it("renders each image with alt text and a remove button when owned", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Gallery images={["/api/media/stay/s1/a.jpg"]} itemName="וינה" onRemove={onRemove} />);
    expect(screen.getByRole("img", { name: /וינה/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "הסרה" }));
    expect(onRemove).toHaveBeenCalledWith("/api/media/stay/s1/a.jpg");
  });
  it("renders nothing when empty", () => {
    const { container } = render(<Gallery images={[]} itemName="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ImageUploader (012)", () => {
  it("uploads the picked file and reports the ref", async () => {
    const onUploaded = vi.fn();
    const user = userEvent.setup();
    render(<ImageUploader kind="avatar" parentId="u1" onUploaded={onUploaded} />);
    const input = screen.getByLabelText("הוספת תמונה") as HTMLInputElement;
    await user.upload(input, new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(uploadImage).toHaveBeenCalledWith("avatar", "u1", expect.any(File));
    expect(onUploaded).toHaveBeenCalledWith("/api/media/avatar/u1/x.jpg");
  });
});
