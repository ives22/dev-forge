import { formatNumber } from "../utils";

export type UnitCategoryKey = "storage" | "time" | "speed" | "length" | "area" | "radix";

export interface UnitCategory {
  label: string;
  note: string;
  sample: { value: string; unit: string };
  kind?: "radix";
  units: Record<string, number>;
}

export interface UnitHistoryEntry {
  id: string;
  categoryKey: UnitCategoryKey;
  value: string;
  fromUnit: string;
  baseMetric: string;
  ok: boolean;
  createdAt: string;
}

export const unitCategories: Record<UnitCategoryKey, UnitCategory> = {
  storage: {
    label: "存储",
    note: "存储单位以 Byte 为基准：KB/MB 使用 1000 进制，KiB/MiB 使用 1024 进制。",
    sample: { value: "1", unit: "GB" },
    units: {
      bit: 1 / 8,
      B: 1,
      KB: 1000,
      MB: 1000 ** 2,
      GB: 1000 ** 3,
      TB: 1000 ** 4,
      PB: 1000 ** 5,
      EB: 1000 ** 6,
      KiB: 1024,
      MiB: 1024 ** 2,
      GiB: 1024 ** 3,
      TiB: 1024 ** 4,
      PiB: 1024 ** 5,
      EiB: 1024 ** 6
    }
  },
  time: {
    label: "时间",
    note: "时间单位按固定秒数换算，月按 30 天、年按 365 天估算。",
    sample: { value: "90", unit: "分钟" },
    units: { 毫秒: 0.001, 秒: 1, 分钟: 60, 小时: 3600, 天: 86400, 周: 604800, 月: 2592000, 年: 31536000 }
  },
  speed: {
    label: "速度",
    note: "速度统一折算到 m/s，再转换为其他单位。",
    sample: { value: "100", unit: "km/h" },
    units: { "m/s": 1, "km/h": 1000 / 3600, mph: 1609.344 / 3600, "ft/s": 0.3048, knot: 1852 / 3600 }
  },
  length: {
    label: "长度",
    note: "长度统一折算到米。",
    sample: { value: "1", unit: "km" },
    units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.344 }
  },
  area: {
    label: "面积",
    note: "面积统一折算到平方米。",
    sample: { value: "1", unit: "m²" },
    units: { "mm²": 0.000001, "cm²": 0.0001, "m²": 1, "km²": 1000000, 公顷: 10000, 亩: 666.6666667, acre: 4046.8564224, "ft²": 0.09290304 }
  },
  radix: {
    label: "进制",
    note: "进制转换支持二进制、八进制、十进制、十六进制，可输入 A-F、0b/0o/0x 前缀和下划线分隔。",
    sample: { value: "FF", unit: "16进制" },
    kind: "radix",
    units: { "2进制": 2, "8进制": 8, "10进制": 10, "16进制": 16 }
  }
};

function normalizeRadixInput(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/_/g, "")
    .replace(/^[-+]?0b/i, (match) => (match[0] === "-" ? "-" : ""))
    .replace(/^[-+]?0o/i, (match) => (match[0] === "-" ? "-" : ""))
    .replace(/^[-+]?0x/i, (match) => (match[0] === "-" ? "-" : ""));
}

export function parseRadixValue(raw: string, base: number): bigint | null {
  const cleaned = normalizeRadixInput(raw);
  const sign = cleaned.startsWith("-") ? -1n : 1n;
  const digits = cleaned.replace(/^[+-]/, "").toLowerCase();
  const patterns: Record<number, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/ };
  if (!patterns[base]?.test(digits)) return null;
  let result = 0n;
  for (const char of digits) {
    const digit = Number.parseInt(char, 16);
    if (digit >= base) return null;
    result = result * BigInt(base) + BigInt(digit);
  }
  return result * sign;
}

export function convertUnits(categoryKey: UnitCategoryKey, rawValue: string, fromUnit: string) {
  const category = unitCategories[categoryKey];
  if (category.kind === "radix") {
    const parsed = parseRadixValue(rawValue, category.units[fromUnit]);
    if (parsed === null) {
      return {
        ok: false,
        baseMetric: "Invalid",
        results: Object.keys(category.units).map((unit) => ({ unit, value: "输入不匹配" }))
      };
    }
    return {
      ok: true,
      baseMetric: `${parsed.toString()} 10进制`,
      results: Object.entries(category.units).map(([unit, base]) => ({ unit, value: parsed.toString(base).toUpperCase() }))
    };
  }
  const value = Number.parseFloat(rawValue || "0");
  const baseValue = value * category.units[fromUnit];
  return {
    ok: Number.isFinite(baseValue),
    baseMetric: `${formatNumber(baseValue)} base`,
    results: Object.entries(category.units).map(([unit, factor]) => ({ unit, value: formatNumber(baseValue / factor) }))
  };
}

export function createUnitHistoryEntry(input: {
  categoryKey: UnitCategoryKey;
  value: string;
  fromUnit: string;
  baseMetric: string;
  ok: boolean;
  createdAt?: string;
}): UnitHistoryEntry {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    id: `${createdAt}:${input.categoryKey}:${input.value}:${input.fromUnit}`,
    categoryKey: input.categoryKey,
    value: input.value,
    fromUnit: input.fromUnit,
    baseMetric: input.baseMetric,
    ok: input.ok,
    createdAt
  };
}

export function pushUnitHistory(history: UnitHistoryEntry[], entry: UnitHistoryEntry, limit = 12): UnitHistoryEntry[] {
  const next = [entry, ...history.filter((item) => item.id !== entry.id)];
  return next.slice(0, limit);
}

export function formatUnitHistoryLabel(entry: UnitHistoryEntry): string {
  const category = unitCategories[entry.categoryKey];
  return `${category.label} · ${entry.value} ${entry.fromUnit}`;
}
