import { describe, expect, it } from "vitest";
import { buildStructureTree, formatJsonYaml, stripJsonComments } from "./jsonYaml";

describe("JSON/YAML transform", () => {
  it("strips JSON comments outside strings", () => {
    const stripped = stripJsonComments('{ "url": "https://x.test", // comment\n "ok": true }');
    expect(stripped).not.toContain("comment");
    expect(JSON.parse(stripped).url).toBe("https://x.test");
  });

  it("formats JSON and reports stats", () => {
    const result = formatJsonYaml('{"a":1,"items":[{"b":2}]}', { format: "json", compact: false, indent: 2 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("\n  ");
    expect(result.stats.keys).toBe(3);
    expect(result.stats.arrays).toBe(1);
    expect(result.tree?.summary).toBe("Object · 2 keys");
  });

  it("builds a structure tree with collection summaries and primitive previews", () => {
    const tree = buildStructureTree({
      RecordLines: {
        RecordLine: [
          { LineCode: "default", active: true },
          { LineCode: "search", score: 7 }
        ]
      },
      empty: null
    });

    expect(tree).toMatchObject({
      id: "$",
      path: "$",
      label: "root",
      type: "Object",
      childCount: 2,
      summary: "Object · 2 keys"
    });

    const recordLines = tree.children[0];
    expect(recordLines).toMatchObject({
      path: "$.RecordLines",
      label: "RecordLines",
      type: "Object",
      childCount: 1,
      summary: "Object · 1 key"
    });

    const recordLine = recordLines.children[0];
    expect(recordLine).toMatchObject({
      path: "$.RecordLines.RecordLine",
      label: "RecordLine",
      type: "Array",
      childCount: 2,
      summary: "Array · 2 items"
    });

    expect(recordLine.children[0].children[0]).toMatchObject({
      path: "$.RecordLines.RecordLine[0].LineCode",
      label: "LineCode",
      type: "String",
      childCount: 0,
      valuePreview: '"default"'
    });
    expect(tree.children[1]).toMatchObject({
      label: "empty",
      type: "Null",
      valuePreview: "null"
    });
  });

  it("round trips YAML", () => {
    const result = formatJsonYaml("name: DevForge\nitems:\n  - one\n", { format: "yaml", compact: false, indent: 2 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("name: DevForge");
    expect(result.output).toContain("- one");
  });

  it("compacts YAML sequences into flow style", () => {
    const result = formatJsonYaml("tools:\n  - json\n  - yaml\n  - jwt\n", { format: "yaml", compact: true, indent: 2 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("tools: [json,yaml,jwt]");
  });
});
