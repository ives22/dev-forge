import { describe, expect, it } from "vitest";
import { evaluateRegex } from "./regex";

describe("evaluateRegex", () => {
  it("matches text with named capture groups", () => {
    const result = evaluateRegex({
      pattern: String.raw`(?<name>[\w.-]+)@(?<domain>[\w.-]+\.[A-Za-z]{2,})`,
      flags: ["g", "i"],
      text: "Contact devforge@app.local and ops@example.org",
      replacement: "$<name> at $<domain>"
    });

    expect(result.ok).toBe(true);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].groups).toEqual(
      expect.arrayContaining([
        { label: "name", value: "devforge", type: "named" },
        { label: "domain", value: "app.local", type: "named" }
      ])
    );
    expect(result.groupCount).toBeGreaterThanOrEqual(2);
    expect(result.replaceOutput).toContain("devforge at app.local");
  });

  it("reports invalid patterns without throwing", () => {
    const result = evaluateRegex({
      pattern: "(",
      flags: ["g"],
      text: "DevForge"
    });

    expect(result.ok).toBe(false);
    expect(result.state).toBe("Error");
    expect(result.matches).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });

  it("matches only the first occurrence when global flag is off", () => {
    const result = evaluateRegex({
      pattern: String.raw`\w+@example\.org`,
      flags: [],
      text: "one@example.org two@example.org"
    });

    expect(result.flags).toBe("");
    expect(result.matches).toHaveLength(1);
    expect(result.replaceOutput).toBe(" two@example.org");
  });

  it("handles zero length matches", () => {
    const result = evaluateRegex({
      pattern: String.raw`\b`,
      flags: ["g"],
      text: "ab cd"
    });

    expect(result.ok).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
  });
});
