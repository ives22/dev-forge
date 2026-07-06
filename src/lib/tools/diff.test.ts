import { describe, expect, it } from "vitest";
import { compareDiff } from "./diff";

const baseOptions = {
  mode: "text" as const,
  ignoreSpace: false,
  ignoreCase: false,
  foldSame: false,
  sortJson: true
};

describe("diff transform", () => {
  it("detects changed, added, and removed lines", () => {
    const result = compareDiff("a\nb\nc", "a\nx\nc\nd", baseOptions);
    expect(result.ok).toBe(true);
    expect(result.stats.same).toBe(2);
    expect(result.stats.changed).toBe(1);
    expect(result.stats.added).toBe(1);
    expect(result.stats.blocks).toBe(2);
    expect(result.plain).toContain("~ b");
    expect(result.plain).toContain("+ d");
  });

  it("can ignore whitespace and case", () => {
    const result = compareDiff("Name:   DevForge", "name: devforge", {
      ...baseOptions,
      ignoreSpace: true,
      ignoreCase: true
    });
    expect(result.stats.blocks).toBe(0);
    expect(result.stats.same).toBe(1);
  });

  it("normalizes JSON with sorted keys", () => {
    const result = compareDiff('{"b":2,"a":1}', '{"a":1,"b":3}', {
      ...baseOptions,
      mode: "json"
    });
    expect(result.ok).toBe(true);
    expect(result.leftPrepared).toContain('"a": 1');
    expect(result.leftPrepared.indexOf('"a"')).toBeLessThan(result.leftPrepared.indexOf('"b"'));
    expect(result.stats.changed).toBe(1);
  });

  it("reports JSON parse errors", () => {
    const result = compareDiff("{ nope", "{}", {
      ...baseOptions,
      mode: "json"
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("左侧 JSON 无法解析");
  });
});
