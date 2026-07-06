export type RegexMode = "test" | "replace";
export type RegexFlag = "g" | "i" | "m" | "s" | "u" | "x" | "y";

export interface RegexOptions {
  pattern: string;
  flags: RegexFlag[];
  text: string;
  replacement?: string;
}

export interface RegexHighlightPart {
  text: string;
  match: boolean;
  matchIndex?: number;
}

export interface RegexGroup {
  label: string;
  value: string;
  type: "named" | "indexed" | "meta";
}

export interface RegexMatch {
  index: number;
  end: number;
  text: string;
  groups: RegexGroup[];
}

export interface RegexResult {
  ok: boolean;
  flags: string;
  expression: string;
  matches: RegexMatch[];
  highlights: RegexHighlightPart[];
  groupCount: number;
  replaceOutput: string;
  state: "Valid" | "Error";
  error?: string;
  engine: string;
}

const orderedFlags: RegexFlag[] = ["g", "i", "m", "s", "u", "x", "y"];

export const defaultRegexFlags: RegexFlag[] = [];

export function normalizeRegexFlags(flags: RegexFlag[], forceGlobal = false): string {
  const unique = new Set(flags);
  if (forceGlobal) unique.add("g");
  return orderedFlags.filter((flag) => unique.has(flag)).join("");
}

function buildExpression(pattern: string, flags: string) {
  return `/${pattern}/${flags}`;
}

function emptyResult(pattern: string, flags: string, text: string): RegexResult {
  return {
    ok: true,
    flags,
    expression: buildExpression(pattern, flags),
    matches: [],
    highlights: text ? [{ text, match: false }] : [],
    groupCount: 0,
    replaceOutput: text,
    state: "Valid",
    engine: "JavaScript"
  };
}

function groupsFor(match: RegExpExecArray): RegexGroup[] {
  const indexed = match.slice(1).map((value, index) => ({
    label: `$${index + 1}`,
    value: value ?? "",
    type: "indexed" as const
  }));
  const named = match.groups
    ? Object.entries(match.groups).map(([label, value]) => ({
        label,
        value: value ?? "",
        type: "named" as const
      }))
    : [];

  return [...named, ...indexed];
}

function pushPlainPart(parts: RegexHighlightPart[], text: string) {
  if (!text) return;
  const previous = parts[parts.length - 1];
  if (previous && !previous.match) {
    previous.text += text;
    return;
  }
  parts.push({ text, match: false });
}

export function evaluateRegex({ pattern, flags, text, replacement = "" }: RegexOptions): RegexResult {
  const normalizedFlags = normalizeRegexFlags(flags);
  const jsFlags = normalizedFlags.replace(/x/g, "");
  const expression = buildExpression(pattern, normalizedFlags);

  if (!pattern) {
    return emptyResult(pattern, normalizedFlags, text);
  }

  try {
    const matcher = new RegExp(pattern, jsFlags);
    const replaceMatcher = new RegExp(pattern, jsFlags);
    const matchGlobally = normalizedFlags.includes("g");
    const matches: RegexMatch[] = [];
    const highlights: RegexHighlightPart[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(text)) !== null) {
      const start = match.index;
      const value = match[0];
      const end = start + value.length;
      pushPlainPart(highlights, text.slice(cursor, start));
      highlights.push({ text: value || "\u200B", match: true, matchIndex: matches.length });
      matches.push({
        index: start,
        end,
        text: value,
        groups: groupsFor(match)
      });
      cursor = end;

      if (value.length === 0) {
        matcher.lastIndex += 1;
      }
      if (!matchGlobally) break;
    }

    pushPlainPart(highlights, text.slice(cursor));
    const groupCount = matches[0]?.groups.length ?? 0;

    return {
      ok: true,
      flags: normalizedFlags,
      expression,
      matches,
      highlights,
      groupCount,
      replaceOutput: text.replace(replaceMatcher, replacement),
      state: "Valid",
      engine: "JavaScript"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "正则表达式无效";
    return {
      ok: false,
      flags: normalizedFlags,
      expression,
      matches: [],
      highlights: [{ text: message, match: false }],
      groupCount: 0,
      replaceOutput: "",
      state: "Error",
      error: message,
      engine: "JavaScript"
    };
  }
}

export function regexMatchesToText(matches: RegexMatch[]): string {
  if (!matches.length) return "无匹配";
  return matches
    .map((match, index) => {
      const groups = match.groups.length ? ` ${match.groups.map((group) => `${group.label}=${group.value}`).join(" ")}` : "";
      return `#${index + 1} [${match.index}, ${match.end}) ${match.text}${groups}`;
    })
    .join("\n");
}
