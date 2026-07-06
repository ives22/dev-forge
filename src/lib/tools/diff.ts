export type DiffMode = "text" | "json";

export interface DiffOptions {
  mode: DiffMode;
  ignoreSpace: boolean;
  ignoreCase: boolean;
  foldSame: boolean;
  sortJson: boolean;
}

export type DiffOpType = "same" | "add" | "remove" | "change-add" | "change-remove" | "fold";

export interface DiffOp {
  type: DiffOpType;
  left?: string;
  right?: string;
  leftNo?: number;
  rightNo?: number;
  count?: number;
}

export interface DiffStats {
  same: number;
  added: number;
  removed: number;
  changed: number;
  blocks: number;
  leftLines: number;
  rightLines: number;
}

export interface DiffResult {
  ok: boolean;
  ops: DiffOp[];
  rows: DiffOp[];
  stats: DiffStats;
  leftPrepared: string;
  rightPrepared: string;
  plain: string;
  error?: string;
}

export function splitLines(value: string): string[] {
  return value.length ? value.replace(/\r\n?/g, "\n").split("\n") : [];
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortObject((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

function normalizeJson(raw: string, sideLabel: string, sortJson: boolean): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(sortJson ? sortObject(parsed) : parsed, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析错误";
    throw new Error(`${sideLabel} JSON 无法解析：${message}`);
  }
}

function normalizeForCompare(line: string, options: DiffOptions): string {
  let next = line;
  if (options.ignoreSpace) next = next.replace(/\s+/g, " ").trim();
  if (options.ignoreCase) next = next.toLocaleLowerCase();
  return next;
}

function prepareInputs(left: string, right: string, options: DiffOptions) {
  if (options.mode === "json") {
    return {
      left: normalizeJson(left, "左侧", options.sortJson),
      right: normalizeJson(right, "右侧", options.sortJson)
    };
  }
  return { left, right };
}

export function buildDiff(leftLines: string[], rightLines: string[], options: DiffOptions): DiffOp[] {
  const leftKeys = leftLines.map((line) => normalizeForCompare(line, options));
  const rightKeys = rightLines.map((line) => normalizeForCompare(line, options));
  const rows = Array.from({ length: leftLines.length + 1 }, () => Array<number>(rightLines.length + 1).fill(0));

  for (let i = leftLines.length - 1; i >= 0; i -= 1) {
    for (let j = rightLines.length - 1; j >= 0; j -= 1) {
      rows[i][j] = leftKeys[i] === rightKeys[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < leftLines.length || j < rightLines.length) {
    if (i < leftLines.length && j < rightLines.length && leftKeys[i] === rightKeys[j]) {
      ops.push({ type: "same", left: leftLines[i], right: rightLines[j], leftNo: i + 1, rightNo: j + 1 });
      i += 1;
      j += 1;
    } else if (j < rightLines.length && (i === leftLines.length || rows[i][j + 1] >= rows[i + 1][j])) {
      ops.push({ type: "add", right: rightLines[j], rightNo: j + 1 });
      j += 1;
    } else {
      ops.push({ type: "remove", left: leftLines[i], leftNo: i + 1 });
      i += 1;
    }
  }

  return markChanges(ops);
}

function markChanges(ops: DiffOp[]): DiffOp[] {
  const result: DiffOp[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].type === "same") {
      result.push(ops[i]);
      continue;
    }

    const chunk: DiffOp[] = [];
    while (i < ops.length && ops[i].type !== "same") {
      chunk.push(ops[i]);
      i += 1;
    }
    i -= 1;

    const removed = chunk.filter((op) => op.type === "remove");
    const added = chunk.filter((op) => op.type === "add");
    const pairCount = Math.min(removed.length, added.length);

    for (let pair = 0; pair < pairCount; pair += 1) {
      result.push({ ...removed[pair], type: "change-remove" });
      result.push({ ...added[pair], type: "change-add" });
    }
    removed.slice(pairCount).forEach((op) => result.push(op));
    added.slice(pairCount).forEach((op) => result.push(op));
  }
  return result;
}

function foldRows(ops: DiffOp[], options: DiffOptions): DiffOp[] {
  if (!options.foldSame) return ops;

  const rows: DiffOp[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].type !== "same") {
      rows.push(ops[i]);
      continue;
    }
    let count = 0;
    while (i < ops.length && ops[i].type === "same") {
      count += 1;
      i += 1;
    }
    i -= 1;
    rows.push({ type: "fold", count });
  }
  return rows;
}

function statsFor(ops: DiffOp[], leftLines: number, rightLines: number): DiffStats {
  const stats = ops.reduce(
    (acc, op) => {
      if (op.type === "same") acc.same += 1;
      if (op.type === "add") acc.added += 1;
      if (op.type === "remove") acc.removed += 1;
      if (op.type === "change-add") acc.changed += 1;
      return acc;
    },
    { same: 0, added: 0, removed: 0, changed: 0, blocks: 0, leftLines, rightLines }
  );

  let inBlock = false;
  ops.forEach((op) => {
    const changed = op.type !== "same";
    if (changed && !inBlock) stats.blocks += 1;
    inBlock = changed;
    if (!changed) inBlock = false;
  });

  return stats;
}

function buildPlainDiff(ops: DiffOp[]): string {
  return ops
    .map((op) => {
      if (op.type === "same") return `  ${op.left ?? ""}`;
      if (op.type === "add") return `+ ${op.right ?? ""}`;
      if (op.type === "remove") return `- ${op.left ?? ""}`;
      if (op.type === "change-add") return `~ ${op.right ?? ""}`;
      return `~ ${op.left ?? ""}`;
    })
    .join("\n");
}

export function compareDiff(left: string, right: string, options: DiffOptions): DiffResult {
  try {
    const prepared = prepareInputs(left, right, options);
    const leftLines = splitLines(prepared.left);
    const rightLines = splitLines(prepared.right);
    const ops = buildDiff(leftLines, rightLines, options);
    return {
      ok: true,
      ops,
      rows: foldRows(ops, options),
      stats: statsFor(ops, leftLines.length, rightLines.length),
      leftPrepared: prepared.left,
      rightPrepared: prepared.right,
      plain: buildPlainDiff(ops)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "对比失败";
    return {
      ok: false,
      ops: [],
      rows: [],
      stats: { same: 0, added: 0, removed: 0, changed: 0, blocks: 0, leftLines: splitLines(left).length, rightLines: splitLines(right).length },
      leftPrepared: left,
      rightPrepared: right,
      plain: "",
      error: message
    };
  }
}
