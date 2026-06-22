import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";

const createMutate = vi.fn();
const renameMutate = vi.fn();
const deleteMutate = vi.fn();
let folders: Array<{ id: string; name: string; stayCount: number; createdAt: number }> = [];

vi.mock("../../lib/folders", () => ({
  useFolders: () => ({ data: folders }),
  useCreateFolder: () => ({ isPending: false, mutateAsync: createMutate }),
  useRenameFolder: () => ({ isPending: false, mutateAsync: renameMutate }),
  useDeleteFolder: () => ({ isPending: false, mutate: deleteMutate }),
}));

import { FolderManager } from "./FolderManager";
import { FolderFilter } from "./FolderFilter";
import "../../i18n";

beforeEach(() => {
  vi.clearAllMocks();
  folders = [
    { id: "fld_a", name: "אירופה 2026", stayCount: 2, createdAt: 0 },
    { id: "fld_b", name: "אסיה", stayCount: 0, createdAt: 1 },
  ];
});

describe("FolderManager (US1 — create/rename/delete)", () => {
  it("lists folders with their active-stay counts", () => {
    render(<FolderManager onClose={vi.fn()} />);
    expect(screen.getByText("אירופה 2026")).toBeInTheDocument();
    expect(screen.getByText("2 מיקומים")).toBeInTheDocument();
  });

  it("creates a folder", async () => {
    createMutate.mockResolvedValue({ id: "fld_c", name: "חדשה", stayCount: 0, createdAt: 2 });
    const user = userEvent.setup();
    render(<FolderManager onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("תיקייה חדשה"), "חדשה");
    await user.click(screen.getByRole("button", { name: "יצירה" }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledWith("חדשה"));
  });

  it("surfaces folder.name_taken on a duplicate create", async () => {
    createMutate.mockRejectedValue(new ApiError(400, { errors: [{ field: "name", code: "folder.name_taken" }] }));
    const user = userEvent.setup();
    render(<FolderManager onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("תיקייה חדשה"), "אסיה");
    await user.click(screen.getByRole("button", { name: "יצירה" }));
    expect(await screen.findByText("כבר קיימת תיקייה בשם הזה.")).toBeInTheDocument();
  });

  it("warns with the reassign count before deleting a non-empty folder", async () => {
    const user = userEvent.setup();
    render(<FolderManager onClose={vi.fn()} />);
    // The first folder (2 stays) — open its delete confirm.
    await user.click(screen.getAllByRole("button", { name: "מחיקה" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "מחיקת תיקייה" });
    expect(within(dialog).getByText(/יועברו ל׳ללא תיקייה׳/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "מחיקה" }));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith("fld_a"));
  });

  it("renames a folder", async () => {
    renameMutate.mockResolvedValue({ id: "fld_b", name: "אסיה 2027", stayCount: 0, createdAt: 1 });
    const user = userEvent.setup();
    render(<FolderManager onClose={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "שינוי שם" })[1]!);
    const input = screen.getByLabelText("שם חדש");
    await user.clear(input);
    await user.type(input, "אסיה 2027");
    await user.click(screen.getByRole("button", { name: "שמירה" }));
    await waitFor(() => expect(renameMutate).toHaveBeenCalledWith({ id: "fld_b", name: "אסיה 2027" }));
  });
});

describe("FolderFilter (US1 — browse by folder incl. Unfiled)", () => {
  it("renders All / each folder / Unfiled and reports selection", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FolderFilter folders={folders} value="all" onChange={onChange} onManage={vi.fn()} />);
    expect(screen.getByRole("button", { name: "הכול" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "אירופה 2026" }));
    expect(onChange).toHaveBeenCalledWith("fld_a");
    await user.click(screen.getByRole("button", { name: "ללא תיקייה" }));
    expect(onChange).toHaveBeenCalledWith("unfiled");
  });
});
