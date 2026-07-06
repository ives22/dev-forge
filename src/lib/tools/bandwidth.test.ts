import { describe, expect, it } from "vitest";
import { calculateBandwidth, convertBandwidth } from "./bandwidth";

describe("bandwidth tools", () => {
  it("calculates transfer time", () => {
    const result = calculateBandwidth({
      fileSize: 1,
      fileUnit: "GB",
      bandwidth: 100,
      bandUnit: "Mbps",
      efficiency: 100,
      parallel: 1
    });
    expect(result.seconds).toBeGreaterThan(80);
    expect(result.perSecond).toContain("/s");
  });

  it("handles zero throughput", () => {
    const result = calculateBandwidth({
      fileSize: 1,
      fileUnit: "GB",
      bandwidth: 0,
      bandUnit: "Mbps",
      efficiency: 90,
      parallel: 1
    });
    expect(result.seconds).toBe(0);
    expect(result.perSecond).toBe("0 KB/s");
  });

  it("converts Mbps to bps", () => {
    const result = convertBandwidth(100, "Mbps");
    expect(result.bitsPerSecond).toBe(100_000_000);
  });
});
