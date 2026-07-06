import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const { listApplications } = vi.hoisted(() => ({
  listApplications: vi.fn(async () => [
    {
      id: "/System/Applications/Calendar.app",
      name: "日历",
      localizedName: "日历",
      path: "/System/Applications/Calendar.app",
      displayPath: "/System/Applications/Calendar.app",
      source: "filesystem" as const,
      aliases: ["Calendar"]
    }
  ])
}));

vi.mock("../lib/desktop", () => ({
  getApplicationIconDataUrl: vi.fn(async () => null),
  listApplications
}));

describe("CommandPalette", () => {
  it("focuses the search input when opened", async () => {
    render(<CommandPalette open onClose={vi.fn()} onPickTool={vi.fn()} />);

    await waitFor(() => expect(screen.getByPlaceholderText("搜索工具、命令或应用...")).toHaveFocus());
  });

  it("refocuses the search input when a focus request arrives while already open", async () => {
    const { rerender } = render(
      <CommandPalette open focusRequest={0} onClose={vi.fn()} onPickTool={vi.fn()} />
    );
    const input = screen.getByPlaceholderText("搜索工具、命令或应用...");

    await waitFor(() => expect(input).toHaveFocus());
    input.blur();
    expect(input).not.toHaveFocus();

    rerender(<CommandPalette open focusRequest={1} onClose={vi.fn()} onPickTool={vi.fn()} />);

    await waitFor(() => expect(input).toHaveFocus());
  });

  it("waits for application selection before closing", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveSelection: (() => void) | undefined;
    const onPickApplication = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSelection = resolve;
        })
    );

    render(
      <CommandPalette
        open
        onClose={onClose}
        onPickApplication={onPickApplication}
        onPickTool={vi.fn()}
      />
    );

    await screen.findByText("日历");
    await user.click(screen.getByRole("button", { name: /日历/ }));

    expect(onPickApplication).toHaveBeenCalledWith(expect.objectContaining({ path: "/System/Applications/Calendar.app" }));
    expect(onClose).not.toHaveBeenCalled();

    resolveSelection?.();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
