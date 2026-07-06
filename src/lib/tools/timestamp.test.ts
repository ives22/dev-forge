import { describe, expect, it } from "vitest";
import { calculateTimeDiff, convertTimestamp, detectTimeType } from "./timestamp";

describe("timestamp tools", () => {
  it("auto detects seconds and milliseconds", () => {
    expect(detectTimeType("1700000000")).toBe("s");
    expect(detectTimeType("1700000000000")).toBe("ms");
  });

  it("converts unix seconds", () => {
    const result = convertTimestamp("1700000000", "auto", "UTC", 1700000000000);
    expect(result.ok).toBe(true);
    expect(result.iso).toBe("2023-11-14T22:13:20.000Z");
  });

  it("calculates readable diff", () => {
    const result = calculateTimeDiff("1700000000", "1700086400");
    expect(result.seconds).toBe("86400");
    expect(result.human).toBe("1d");
  });
});
