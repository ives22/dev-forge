import { describe, expect, it } from "vitest";
import { buildLauncherResults, groupLauncherResults, launcherAccelerator, launcherShortcutLabel, type ApplicationEntry } from "./launcher";
import { tools } from "./toolRegistry";

const applications: ApplicationEntry[] = [
  {
    id: "/Applications/Safari.app",
    name: "Safari",
    path: "/Applications/Safari.app",
    displayPath: "/Applications/Safari.app",
    source: "spotlight"
  },
  {
    id: "/System/Applications/Utilities/Terminal.app",
    name: "Terminal",
    path: "/System/Applications/Utilities/Terminal.app",
    displayPath: "/System/Applications/Utilities/Terminal.app",
    source: "filesystem"
  },
  {
    id: "/System/Applications/Calendar.app",
    name: "日历",
    localizedName: "日历",
    path: "/System/Applications/Calendar.app",
    displayPath: "/System/Applications/Calendar.app",
    source: "filesystem",
    aliases: ["Calendar"],
    iconPath: "/System/Applications/Calendar.app/Contents/Resources/AppIcon.icns"
  }
];

describe("launcher search", () => {
  it("keeps the planned global shortcut contract stable", () => {
    expect(launcherAccelerator).toBe("Option+Space");
    expect(launcherShortcutLabel).toBe("⌥ Space");
  });

  it("filters and groups DevForge tools with local applications", () => {
    const results = buildLauncherResults({ applications, query: "json", tools });
    const grouped = groupLauncherResults(results);

    expect(grouped.tools.map((item) => item.tool.id)).toContain("json-yaml");
    expect(grouped.applications).toHaveLength(0);
  });

  it("matches DevForge tools by pinyin search aliases", () => {
    const results = buildLauncherResults({ applications, query: "yanzheng", tools });

    expect(results[0].type).toBe("tool");
    expect(results[0].title).toBe("身份验证器");
  });

  it("returns matching applications without dropping tool results for an empty query", () => {
    const results = buildLauncherResults({ applications, query: "", tools });
    const grouped = groupLauncherResults(results);

    expect(grouped.tools.length).toBeGreaterThan(0);
    expect(grouped.applications.map((item) => item.application.name)).toContain("Safari");
  });

  it("prefers exact and prefix matches over fuzzy subsequence matches", () => {
    const results = buildLauncherResults({ applications, query: "term", tools });

    expect(results[0].type).toBe("application");
    expect(results[0].title).toBe("Terminal");
  });

  it("matches applications by localized aliases", () => {
    const results = buildLauncherResults({ applications, query: "日历", tools });

    expect(results[0].type).toBe("application");
    expect(results[0].title).toBe("日历");
  });

  it("uses localized application names as launcher titles", () => {
    const results = buildLauncherResults({ applications, query: "calendar", tools });
    const calendar = results.find((item) => item.type === "application" && item.application.path.endsWith("Calendar.app"));

    expect(calendar?.title).toBe("日历");
  });
});
