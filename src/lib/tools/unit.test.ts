import { describe, expect, it } from "vitest";
import { convertUnits, createUnitHistoryEntry, formatUnitHistoryLabel, parseRadixValue, pushUnitHistory } from "./unit";

describe("unit tools", () => {
  it("converts storage units", () => {
    const result = convertUnits("storage", "1", "GB");
    expect(result.ok).toBe(true);
    expect(result.results.find((item) => item.unit === "MB")?.value).toBe("1,000");
  });

  it("parses radix values", () => {
    expect(parseRadixValue("0xFF", 16)?.toString()).toBe("255");
  });

  it("reports invalid radix input", () => {
    const result = convertUnits("radix", "102", "2进制");
    expect(result.ok).toBe(false);
    expect(result.baseMetric).toBe("Invalid");
  });

  it("keeps newest unit history entries first", () => {
    const first = createUnitHistoryEntry({
      categoryKey: "storage",
      value: "1",
      fromUnit: "GB",
      baseMetric: "1,000,000,000 base",
      ok: true,
      createdAt: "2026-06-15T00:00:00.000Z"
    });
    const second = createUnitHistoryEntry({
      categoryKey: "length",
      value: "2",
      fromUnit: "km",
      baseMetric: "2,000 base",
      ok: true,
      createdAt: "2026-06-15T00:00:01.000Z"
    });

    expect(pushUnitHistory([first], second)).toEqual([second, first]);
  });

  it("formats a readable unit history label", () => {
    const entry = createUnitHistoryEntry({
      categoryKey: "time",
      value: "90",
      fromUnit: "分钟",
      baseMetric: "5,400 base",
      ok: true,
      createdAt: "2026-06-15T00:00:00.000Z"
    });

    expect(formatUnitHistoryLabel(entry)).toBe("时间 · 90 分钟");
  });
});
