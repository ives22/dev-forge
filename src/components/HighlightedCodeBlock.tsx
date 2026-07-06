import { forwardRef, useMemo } from "react";
import type { DataFormat } from "../lib/tools/jsonYaml";

export type HighlightFormat = DataFormat | "sql";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tokenSpan(className: string, token: string) {
  return `<span class="${className}">${escapeHtml(token)}</span>`;
}

function highlightJson(source: string) {
  const tokenPattern = /(?:"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g;
  let html = "";
  let cursor = 0;

  source.replace(tokenPattern, (...args) => {
    const token = args[0] as string;
    const offset = args[args.length - 2] as number;
    const fullSource = args[args.length - 1] as string;
    html += escapeHtml(fullSource.slice(cursor, offset));
    let className = "json-punctuation";
    if (/^"/.test(token)) className = /^\s*:/.test(fullSource.slice(offset + token.length)) ? "json-key" : "json-string";
    if (/^-?\d/.test(token)) className = "json-number";
    if (token === "true" || token === "false") className = "json-boolean";
    if (token === "null") className = "json-null";
    html += tokenSpan(className, token);
    cursor = offset + token.length;
    return token;
  });

  html += escapeHtml(source.slice(cursor));
  return html;
}

function highlightYaml(source: string) {
  return source
    .split("\n")
    .map((line) => {
      const keyMatch = line.match(/^(\s*)(-\s*)?([A-Za-z0-9_.-]+)(\s*:\s*)(.*)$/);
      if (keyMatch) {
        const [, indent, dash = "", key, separator, rest] = keyMatch;
        return [
          escapeHtml(indent),
          dash ? tokenSpan("json-punctuation", dash) : "",
          tokenSpan("json-key", key),
          tokenSpan("json-punctuation", separator),
          highlightYamlScalar(rest)
        ].join("");
      }

      const listMatch = line.match(/^(\s*-\s*)(.*)$/);
      if (listMatch) {
        const [, dash, rest] = listMatch;
        return `${tokenSpan("json-punctuation", dash)}${highlightYamlScalar(rest)}`;
      }

      return escapeHtml(line);
    })
    .join("\n");
}

function highlightYamlScalar(value: string) {
  if (!value) return "";
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const scalar = value.slice(leading.length);
  if (/^(true|false)$/i.test(scalar)) return `${escapeHtml(leading)}${tokenSpan("json-boolean", scalar)}`;
  if (/^(null|~)$/i.test(scalar)) return `${escapeHtml(leading)}${tokenSpan("json-null", scalar)}`;
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(scalar)) return `${escapeHtml(leading)}${tokenSpan("json-number", scalar)}`;
  if (/^(['"]).*\1$/.test(scalar)) return `${escapeHtml(leading)}${tokenSpan("json-string", scalar)}`;
  return `${escapeHtml(leading)}${tokenSpan("json-string", scalar)}`;
}

function highlightSql(source: string) {
  const tokenPattern =
    /(--.*$|'(?:''|\\.|[^'\\])*'|"(?:\\"|[^"])*"|`(?:``|[^`])*`|\b\d+(?:\.\d+)?\b|\b(?:select|from|where|and|or|group\s+by|having|order\s+by|desc|asc|as|with|limit|offset|insert|into|values|update|set|delete|left|right|inner|full|outer|cross|join|on|case|when|then|else|end|returning|distinct)\b|\b(?:count|sum|avg|min|max|row_number|coalesce)\b|\b(?:drop|truncate|alter)\b)/gim;
  let html = "";
  let cursor = 0;

  source.replace(tokenPattern, (...args) => {
    const token = args[0] as string;
    const offset = args[args.length - 2] as number;
    const fullSource = args[args.length - 1] as string;
    html += escapeHtml(fullSource.slice(cursor, offset));
    let className = "sql-keyword";
    if (token.startsWith("--")) className = "sql-comment";
    else if (/^['"`]/.test(token)) className = "sql-string";
    else if (/^\d/.test(token)) className = "sql-number";
    else if (/^(count|sum|avg|min|max|row_number|coalesce)$/i.test(token)) className = "sql-function";
    else if (/^(drop|truncate|alter)$/i.test(token)) className = "sql-danger";
    html += tokenSpan(className, token);
    cursor = offset + token.length;
    return token;
  });

  html += escapeHtml(source.slice(cursor));
  return html;
}

export const HighlightedCodeBlock = forwardRef<
  HTMLPreElement,
  {
    code: string;
    format: HighlightFormat;
    className?: string;
    ariaHidden?: boolean;
  }
>(function HighlightedCodeBlock({ code, format, className = "", ariaHidden = false }, ref) {
  const html = useMemo(() => {
    if (format === "sql") return highlightSql(code);
    return format === "json" ? highlightJson(code) : highlightYaml(code);
  }, [code, format]);

  return <pre ref={ref} className={`json-output-code ${className}`} aria-hidden={ariaHidden} dangerouslySetInnerHTML={{ __html: html }} />;
});
