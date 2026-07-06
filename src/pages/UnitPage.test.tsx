import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PageChromeProvider } from "../hooks/usePageChrome";
import { UnitPage } from "./UnitPage";

describe("UnitPage", () => {
  it("records unit history and restores values when clicked", async () => {
    const recordUsage = vi.fn(async () => undefined);
    render(
      <PageChromeProvider>
        <UnitPage recordUsage={recordUsage} />
      </PageChromeProvider>
    );

    const valueInput = screen.getByLabelText("输入值");
    const fromSelect = screen.getByLabelText("源单位");

    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, "2");
    await userEvent.selectOptions(fromSelect, "TB");
    await userEvent.click(screen.getByRole("button", { name: "记录本次换算" }));

    expect(await screen.findByRole("button", { name: /存储 · 2 TB/i })).toBeInTheDocument();
    expect(recordUsage).toHaveBeenCalledTimes(1);

    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, "8");
    await userEvent.selectOptions(fromSelect, "GB");

    await userEvent.click(screen.getByRole("button", { name: /存储 · 2 TB/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("输入值")).toHaveValue("2");
      expect(screen.getByLabelText("源单位")).toHaveValue("TB");
    });
  });

  it("clears unit history", async () => {
    const recordUsage = vi.fn(async () => undefined);
    render(
      <PageChromeProvider>
        <UnitPage recordUsage={recordUsage} />
      </PageChromeProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "记录本次换算" }));
    expect(await screen.findByRole("button", { name: /存储 · 1 GB/i })).toBeInTheDocument();

    const clearButton = screen.getByRole("button", { name: "清空历史" });
    expect(clearButton).toBeEnabled();
    await userEvent.click(clearButton);

    expect(await screen.findByText("还没有历史记录，记录一次后可点击回填。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空历史" })).toBeDisabled();
  });
});
