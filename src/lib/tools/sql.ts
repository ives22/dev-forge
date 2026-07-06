export type SqlDialect = "mysql" | "postgres" | "sqlite" | "sqlserver";
export type SqlMode = "format" | "compact" | "validate";

export interface SqlFormatOptions {
  dialect: SqlDialect;
  compact: boolean;
  indent: 2 | 4;
  uppercaseKeywords: boolean;
  fieldLineBreaks: boolean;
  joinLineBreaks: boolean;
}

export interface SqlIssue {
  level: "ok" | "warn" | "error";
  title: string;
  body: string;
}

export interface SqlTableRef {
  name: string;
  source: "FROM" | "JOIN";
}

export interface SqlStructure {
  tables: SqlTableRef[];
  fieldCount: number;
  joinCount: number;
  conditionCount: number;
  parameterCount: number;
}

export interface SqlResult {
  ok: boolean;
  output: string;
  issues: SqlIssue[];
  structure: SqlStructure;
  lineCount: number;
  charCount: number;
  state: "Valid" | "Warning" | "Error";
}

const clauseKeywords = [
  "select",
  "from",
  "left join",
  "right join",
  "inner join",
  "full join",
  "cross join",
  "join",
  "where",
  "and",
  "or",
  "group by",
  "having",
  "order by",
  "limit",
  "offset",
  "returning",
  "values",
  "set"
];

const keywordPattern =
  /\b(select|from|where|and|or|group\s+by|having|order\s+by|desc|asc|as|with|limit|offset|insert|into|values|update|set|delete|left|right|inner|full|outer|cross|join|on|case|when|then|else|end|returning|count|sum|avg|min|max|row_number|coalesce|distinct)\b/gi;

export const sqlSample = `select u.id,u.email,o.total, count(oi.id) as item_count
from users u
left join orders o on o.user_id = u.id
left join order_items oi on oi.order_id = o.id
where u.status = 'active'
and o.created_at >= '2026-01-01'
group by u.id,u.email,o.total
having count(oi.id) > 2
order by o.total desc;`;

export const defaultSqlOptions: SqlFormatOptions = {
  dialect: "mysql",
  compact: false,
  indent: 2,
  uppercaseKeywords: true,
  fieldLineBreaks: true,
  joinLineBreaks: true
};

function normalizeWhitespace(source: string) {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*;\s*$/g, ";")
    .trim();
}

function keywordCase(keyword: string, uppercase: boolean) {
  const normalized = keyword.replace(/\s+/g, " ");
  return uppercase ? normalized.toUpperCase() : normalized.toLowerCase();
}

function replaceKeywords(source: string, uppercase: boolean) {
  return source.replace(keywordPattern, (match) => keywordCase(match, uppercase));
}

function splitTopLevelCommaList(source: string): string[] {
  const items: string[] = [];
  let cursor = 0;
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      items.push(source.slice(cursor, index).trim());
      cursor = index + 1;
    }
  }
  const tail = source.slice(cursor).trim();
  if (tail) items.push(tail);
  return items;
}

function findMatchingParen(source: string, openIndex: number) {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function formatCreateTable(source: string, indent: string) {
  const compacted = normalizeWhitespace(source);
  if (!/^create\s+table\b/i.test(compacted)) return null;

  const openIndex = compacted.indexOf("(");
  if (openIndex === -1) return null;
  const closeIndex = findMatchingParen(compacted, openIndex);
  if (closeIndex === -1) return null;

  const head = compacted.slice(0, openIndex).trim();
  const body = compacted.slice(openIndex + 1, closeIndex).trim();
  const suffixSource = compacted.slice(closeIndex + 1).trim();
  const suffix = suffixSource === ";" ? ";" : suffixSource ? ` ${suffixSource}` : "";

  if (!body) return `${head} ()${suffix}`;

  const definitions = splitTopLevelCommaList(body);
  return `${head} (\n${indent}${definitions.join(`,\n${indent}`)}\n)${suffix}`;
}

function clauseRegex(keywords = clauseKeywords) {
  const escaped = keywords.map((item) => item.replace(/\s+/g, "\\s+")).join("|");
  return new RegExp(`\\b(${escaped})\\b`, "gi");
}

function newlineClauses(source: string) {
  const compacted = normalizeWhitespace(source);
  return compacted
    .replace(clauseRegex(), (match, _keyword, offset) => (offset === 0 ? match : `\n${match}`))
    .replace(/\n(and|or)\b/gi, "\n  $1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function formatSelectFields(source: string, indent: string) {
  const match = source.match(/^(select)\s+([\s\S]*?)(\nfrom\b[\s\S]*)$/i);
  if (!match) return source;
  const [, selectKeyword, fieldsSource, rest] = match;
  const fields = splitTopLevelCommaList(fieldsSource);
  if (fields.length <= 1) return source;
  return `${selectKeyword}\n${indent}${fields.join(`,\n${indent}`)}${rest}`;
}

function indentLines(source: string, indent: string, joinLineBreaks: boolean) {
  return source
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^\s+/.test(line)) return line;
      if (/^(select|from|where|group by|having|order by|limit|offset|returning|values|set)\b/i.test(trimmed)) return trimmed;
      if (/^(left|right|inner|full|cross)?\s*join\b/i.test(trimmed)) return joinLineBreaks ? trimmed : `${indent}${trimmed}`;
      if (/^(and|or|on|when|then|else)\b/i.test(trimmed)) return `${indent}${trimmed}`;
      return trimmed.startsWith(",") ? `${indent}${trimmed}` : trimmed;
    })
    .join("\n");
}

function compactSql(source: string, uppercaseKeywords: boolean) {
  return replaceKeywords(normalizeWhitespace(source).replace(/\s*\n\s*/g, " "), uppercaseKeywords);
}

export function formatSql(source: string, options: SqlFormatOptions = defaultSqlOptions): string {
  if (!source.trim()) return "";
  if (options.compact) return compactSql(source, options.uppercaseKeywords);

  const indent = " ".repeat(options.indent);
  const createTable = formatCreateTable(source, indent);
  if (createTable) return replaceKeywords(createTable, options.uppercaseKeywords);

  let next = newlineClauses(source);
  if (options.fieldLineBreaks) next = formatSelectFields(next, indent);
  next = indentLines(next, indent, options.joinLineBreaks);
  if (!options.joinLineBreaks) {
    next = next.replace(/\n((?:left|right|inner|full|cross)?\s*join\b)/gi, " $1");
  }
  return replaceKeywords(next, options.uppercaseKeywords);
}

export function tableNames(source: string): SqlTableRef[] {
  const refs: SqlTableRef[] = [];
  const seen = new Set<string>();
  const regex = /\b(from|join)\s+([`"[]?[a-zA-Z_][\w.$-]*[`"\]]?)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const name = match[2].replace(/^[`"[]|[`"\]]$/g, "");
    const key = `${match[1].toLowerCase()}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ name, source: match[1].toLowerCase() === "from" ? "FROM" : "JOIN" });
  }
  return refs;
}

function countFields(source: string) {
  const match = source.match(/\bselect\b([\s\S]*?)\bfrom\b/i);
  if (!match) return 0;
  return splitTopLevelCommaList(match[1]).filter(Boolean).length;
}

function countConditions(source: string) {
  if (!/\bwhere\b/i.test(source)) return 0;
  const whereBody = source.split(/\bwhere\b/i)[1]?.split(/\b(group\s+by|having|order\s+by|limit|offset)\b/i)[0] ?? "";
  return Math.max(1, (whereBody.match(/\b(and|or)\b/gi) ?? []).length + 1);
}

function countParameters(source: string) {
  return (source.match(/\$\d+|:[a-zA-Z_]\w*|\?/g) ?? []).length;
}

export function inspectSql(source: string): SqlStructure {
  return {
    tables: tableNames(source),
    fieldCount: countFields(source),
    joinCount: (source.match(/\bjoin\b/gi) ?? []).length,
    conditionCount: countConditions(source),
    parameterCount: countParameters(source)
  };
}

function hasBalancedQuotes(source: string) {
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (const char of source) {
    if (!quote) {
      if (char === "'" || char === '"' || char === "`") quote = char;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) quote = null;
  }
  return quote === null;
}

function hasBalancedParens(source: string) {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (const char of source) {
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function splitSqlStatements(source: string) {
  const statements: string[] = [];
  let cursor = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === ";") {
      const statement = source.slice(cursor, index).trim();
      if (statement) statements.push(statement);
      cursor = index + 1;
    }
  }

  const tail = source.slice(cursor).trim();
  if (tail) statements.push(tail);
  return statements;
}

function hasDangerousStatement(source: string) {
  const identifier = "(?:[`\"]?[a-zA-Z_][\\w.$-]*[`\"]?|\\[[^\\]]+\\])";
  const updatePattern = new RegExp(`^update\\s+${identifier}\\b`, "i");
  return splitSqlStatements(source).some(
    (statement) =>
      /^(drop|truncate|alter)\b/i.test(statement) ||
      /^delete\s+from\b/i.test(statement) ||
      updatePattern.test(statement)
  );
}

export function findSqlIssues(source: string): SqlIssue[] {
  const issues: SqlIssue[] = [];
  if (!source.trim()) {
    return [{ level: "warn", title: "等待输入", body: "输入 SQL 后会显示结构摘要与风险提示。" }];
  }
  if (!hasBalancedQuotes(source)) {
    issues.push({ level: "error", title: "字符串未闭合", body: "检测到引号未成对，请检查字符串或标识符。" });
  }
  if (!hasBalancedParens(source)) {
    issues.push({ level: "error", title: "括号不匹配", body: "检测到括号数量不平衡，请检查函数调用或子查询。" });
  }
  if (hasDangerousStatement(source)) {
    issues.push({ level: "warn", title: "危险语句", body: "包含 DROP / TRUNCATE / ALTER / UPDATE / DELETE，请确认执行环境。" });
  }
  if (/\bselect\s+\*/i.test(source)) {
    issues.push({ level: "warn", title: "宽字段查询", body: "SELECT * 可能带来不必要的数据读取，建议显式列出字段。" });
  }
  if (/\bcreated_at\s*[<>=]/i.test(source)) {
    issues.push({ level: "warn", title: "时间条件", body: "确认时区与数据库字段类型，避免跨时区筛选偏差。" });
  }
  if (!issues.length) {
    issues.push({ level: "ok", title: "未发现明显问题", body: "括号、字符串与基础关键字检查通过。" });
  }
  return issues;
}

export function evaluateSql(source: string, options: SqlFormatOptions = defaultSqlOptions): SqlResult {
  const output = formatSql(source, options);
  const issues = findSqlIssues(output || source);
  const hasError = issues.some((issue) => issue.level === "error");
  const hasWarn = issues.some((issue) => issue.level === "warn");
  const inspected = output || source;
  return {
    ok: !hasError,
    output,
    issues,
    structure: inspectSql(inspected),
    lineCount: inspected ? inspected.split(/\n/).length : 1,
    charCount: inspected.length,
    state: hasError ? "Error" : hasWarn ? "Warning" : "Valid"
  };
}
