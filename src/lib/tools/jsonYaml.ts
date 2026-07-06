import yaml from "js-yaml";
import { byteSize, formatBytes } from "../utils";

export type DataFormat = "json" | "yaml";

export interface JsonYamlOptions {
  format: DataFormat;
  compact: boolean;
  indent: 2 | 4;
}

export interface JsonYamlStats {
  keys: number;
  arrays: number;
  depth: number;
  rootType: string;
}

export type StructureNodeType = "Object" | "Array" | "String" | "Number" | "Boolean" | "Null" | "Undefined";

export interface StructureTreeNode {
  id: string;
  path: string;
  label: string;
  type: StructureNodeType;
  childCount: number;
  summary: string;
  children: StructureTreeNode[];
  valuePreview?: string;
}

export interface JsonYamlResult {
  ok: boolean;
  output: string;
  error?: string;
  stats: JsonYamlStats;
  size: string;
  parsed: unknown;
  tree?: StructureTreeNode;
}

export function stripJsonComments(source: string): string {
  let result = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      result += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      result += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    result += char;
  }
  return result;
}

export function inspectValue(value: unknown, depth = 1): JsonYamlStats {
  if (Array.isArray(value)) {
    const childStats = value.map((item) => inspectValue(item, depth + 1));
    return {
      keys: childStats.reduce((sum, item) => sum + item.keys, 0),
      arrays: 1 + childStats.reduce((sum, item) => sum + item.arrays, 0),
      depth: Math.max(depth, ...childStats.map((item) => item.depth)),
      rootType: "Array"
    };
  }
  if (value && typeof value === "object") {
    const childStats = Object.values(value).map((item) => inspectValue(item, depth + 1));
    return {
      keys: Object.keys(value).length + childStats.reduce((sum, item) => sum + item.keys, 0),
      arrays: childStats.reduce((sum, item) => sum + item.arrays, 0),
      depth: Math.max(depth, ...childStats.map((item) => item.depth)),
      rootType: "Object"
    };
  }
  return { keys: 0, arrays: 0, depth, rootType: value === null ? "Null" : typeof value };
}

function primitiveType(value: unknown): StructureNodeType {
  if (value === null) return "Null";
  if (value === undefined) return "Undefined";
  if (typeof value === "string") return "String";
  if (typeof value === "number") return "Number";
  if (typeof value === "boolean") return "Boolean";
  return "String";
}

function previewPrimitive(value: unknown): string {
  if (typeof value === "string") {
    const clipped = value.length > 48 ? `${value.slice(0, 45)}...` : value;
    return JSON.stringify(clipped);
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
}

function quotePathSegment(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function buildStructureTree(value: unknown, label = "root", path = "$"): StructureTreeNode {
  if (Array.isArray(value)) {
    const children = value.map((item, index) => buildStructureTree(item, `[${index}]`, `${path}[${index}]`));
    return {
      id: path,
      path,
      label,
      type: "Array",
      childCount: children.length,
      summary: `Array · ${plural(children.length, "item", "items")}`,
      children
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const children = entries.map(([key, child]) => buildStructureTree(child, key, `${path}${quotePathSegment(key)}`));
    return {
      id: path,
      path,
      label,
      type: "Object",
      childCount: children.length,
      summary: `Object · ${plural(children.length, "key", "keys")}`,
      children
    };
  }

  const type = primitiveType(value);
  return {
    id: path,
    path,
    label,
    type,
    childCount: 0,
    summary: type,
    children: [],
    valuePreview: previewPrimitive(value)
  };
}

export function formatJsonYaml(source: string, options: JsonYamlOptions): JsonYamlResult {
  try {
    const parsed = options.format === "yaml" ? yaml.load(source) : JSON.parse(source);
    const output =
      options.format === "yaml"
        ? yaml.dump(parsed, {
            indent: options.indent,
            lineWidth: -1,
            noRefs: true,
            ...(options.compact ? { flowLevel: 1, condenseFlow: true } : {})
          })
        : JSON.stringify(parsed, null, options.compact ? 0 : options.indent);
    const stats = inspectValue(parsed);
    return {
      ok: true,
      output,
      stats,
      size: formatBytes(byteSize(output)),
      parsed,
      tree: buildStructureTree(parsed)
    };
  } catch (error) {
    return {
      ok: false,
      output: source,
      error: error instanceof Error ? error.message : "解析错误",
      stats: { keys: 0, arrays: 0, depth: 0, rootType: "-" },
      size: formatBytes(byteSize(source)),
      parsed: null
    };
  }
}
