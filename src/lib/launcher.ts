import type { ToolDefinition } from "./toolRegistry";

export const launcherAccelerator = "Option+Space";
export const launcherShortcutLabel = "⌥ Space";
export const launcherResultLimit = 50;

export interface ApplicationEntry {
  id: string;
  name: string;
  localizedName?: string;
  path: string;
  displayPath: string;
  source: "spotlight" | "filesystem";
  aliases?: string[];
  iconPath?: string;
}

export type LauncherResult =
  | {
      type: "tool";
      id: string;
      title: string;
      subtitle: string;
      shortcut?: string;
      score: number;
      tool: ToolDefinition;
    }
  | {
      type: "application";
      id: string;
      title: string;
      subtitle: string;
      score: number;
      application: ApplicationEntry;
    };

export function buildLauncherResults({
  applications,
  query,
  tools
}: {
  applications: ApplicationEntry[];
  query: string;
  tools: ToolDefinition[];
}): LauncherResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const toolResults: LauncherResult[] = [];
  tools.forEach((tool, index) => {
    const score = scoreSearchCandidate(normalizedQuery, [tool.title, tool.shortTitle, tool.description, tool.id, ...(tool.searchAliases ?? [])]);
    if (score < 0) return;
    toolResults.push({
      type: "tool",
      id: `tool:${tool.id}`,
      title: tool.title,
      subtitle: tool.description,
      shortcut: tool.shortcut,
      score: score + Math.max(0, tools.length - index) / 100,
      tool
    });
  });

  const applicationResults: LauncherResult[] = [];
  applications.forEach((application) => {
    const title = application.localizedName || application.name;
    const score = scoreSearchCandidate(normalizedQuery, [title, application.name, application.path, application.displayPath, ...(application.aliases ?? [])]);
    if (score < 0) return;
    applicationResults.push({
      type: "application",
      id: `application:${application.id}`,
      title,
      subtitle: application.displayPath,
      score,
      application
    });
  });

  return [...toolResults, ...applicationResults]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.type !== right.type) return left.type === "tool" ? -1 : 1;
      return left.title.localeCompare(right.title, "zh-Hans-CN");
    })
    .slice(0, launcherResultLimit);
}

export function groupLauncherResults(results: LauncherResult[]) {
  return {
    tools: results.filter((item): item is Extract<LauncherResult, { type: "tool" }> => item.type === "tool"),
    applications: results.filter((item): item is Extract<LauncherResult, { type: "application" }> => item.type === "application")
  };
}

function scoreSearchCandidate(normalizedQuery: string, values: string[]): number {
  if (!normalizedQuery) return 1;

  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  let bestScore = -1;
  for (const value of normalizedValues) {
    if (value === normalizedQuery) bestScore = Math.max(bestScore, 100);
    else if (value.startsWith(normalizedQuery)) bestScore = Math.max(bestScore, 80);
    else if (value.includes(normalizedQuery)) bestScore = Math.max(bestScore, 60);
    else if (isSubsequence(normalizedQuery, value)) bestScore = Math.max(bestScore, 30);
  }
  return bestScore;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("zh-Hans-CN").replace(/\s+/g, " ");
}

function isSubsequence(query: string, value: string): boolean {
  let valueIndex = 0;
  for (const character of query) {
    valueIndex = value.indexOf(character, valueIndex);
    if (valueIndex === -1) return false;
    valueIndex += character.length;
  }
  return true;
}
