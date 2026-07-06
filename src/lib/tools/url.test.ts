import { describe, expect, it } from "vitest";
import { transformUrl } from "./url";

describe("URL transform", () => {
  it("encodes spaces as plus when requested", () => {
    const result = transformUrl("a b", { mode: "encode", spacePlus: true });
    expect(result.output).toBe("a+b");
  });

  it("reports decode errors", () => {
    const result = transformUrl("%E0%A4%A", { mode: "decode", spacePlus: false });
    expect(result.ok).toBe(false);
  });

  it("parses query params", () => {
    const result = transformUrl("https://devforge.app/search?q=tool&mode=fast", { mode: "encode", spacePlus: false });
    expect(result.params).toEqual([
      { key: "q", value: "tool" },
      { key: "mode", value: "fast" }
    ]);
  });
});
