import { describe, expect, it } from "vitest";
import { generatePalette, hexToRgb, normalizeHexColor, randomPaletteHex } from "./palette";

describe("palette generator", () => {
  it("normalizes hex colors", () => {
    expect(normalizeHexColor("#0af")).toBe("#00AAFF");
    expect(normalizeHexColor("2563eb")).toBe("#2563EB");
    expect(normalizeHexColor("not-a-color")).toBeNull();
  });

  it("converts hex to RGB", () => {
    expect(hexToRgb("#2563EB")).toEqual({ r: 37, g: 99, b: 235 });
  });

  it("generates a clamped color palette with readable metadata", () => {
    const result = generatePalette({ baseHex: "#2563EB", mode: "triadic", count: 20 });

    expect(result.colors).toHaveLength(9);
    expect(result.modeLabel).toBe("三角色");
    expect(result.colors[0].hex).toBe("#2563EB");
    expect(result.colors.every((color) => /^#[0-9A-F]{6}$/.test(color.hex))).toBe(true);
    expect(result.colors.every((color) => color.contrast >= 1)).toBe(true);
    expect(result.cssVariables).toContain("--color-1: #2563EB;");
    expect(result.hexList.split("\n")).toHaveLength(9);
  });

  it("falls back to the default color when input is invalid", () => {
    const result = generatePalette({ baseHex: "blue-ish", mode: "analogous", count: 6 });

    expect(result.validBase).toBe(false);
    expect(result.baseHex).toBe("#2563EB");
  });

  it("creates deterministic random hex when a random function is provided", () => {
    expect(randomPaletteHex(() => 0)).toBe("#181818");
    expect(randomPaletteHex(() => 0.999)).toBe("#E7E7E7");
  });
});
