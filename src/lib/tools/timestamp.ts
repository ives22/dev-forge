export type TimeInputType = "auto" | "s" | "ms" | "iso";

export function detectTimeType(value: string): Exclude<TimeInputType, "auto"> {
  const text = String(value).trim();
  if (/^-?\d{13}$/.test(text)) return "ms";
  if (/^-?\d{10}$/.test(text)) return "s";
  if (/^-?\d+$/.test(text)) return Math.abs(Number(text)) > 99_999_999_999 ? "ms" : "s";
  return "iso";
}

export function parseTimeValue(value: string, mode: TimeInputType = "auto") {
  const type = mode === "auto" ? detectTimeType(value) : mode;
  const text = String(value).trim();
  let date: Date;
  if (type === "s") date = new Date(Number(text) * 1000);
  else if (type === "ms") date = new Date(Number(text));
  else date = new Date(text);
  return { date, type };
}

export function isInvalidDate(date: Date): boolean {
  return Number.isNaN(date.getTime());
}

export function formatInZone(date: Date, zone: string, withSeconds = true): string {
  if (isInvalidDate(date)) return "Invalid";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false
  }).format(date);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  const abs = Math.abs(Math.round(ms / 1000));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || !parts.length) parts.push(`${seconds}s`);
  return `${ms < 0 ? "-" : ""}${parts.join(" ")}`;
}

export function convertTimestamp(value: string, mode: TimeInputType, zone: string, now = Date.now()) {
  const parsed = parseTimeValue(value, mode);
  const date = parsed.date;
  if (isInvalidDate(date)) {
    return { ok: false, type: parsed.type, zoneTime: "Invalid", iso: "Invalid", relative: "-", date };
  }
  const diff = (date.getTime() - now) / 1000;
  return {
    ok: true,
    type: parsed.type,
    zoneTime: formatInZone(date, zone),
    iso: date.toISOString(),
    relative: `${diff >= 0 ? "+" : ""}${Math.round(diff)}s`,
    date
  };
}

export function calculateTimeDiff(startValue: string, endValue: string) {
  const start = parseTimeValue(startValue).date;
  const end = parseTimeValue(endValue).date;
  if (isInvalidDate(start) || isInvalidDate(end)) {
    return { ok: false, seconds: "Invalid", minutes: "Invalid", hours: "Invalid", human: "Invalid" };
  }
  const diffMs = end.getTime() - start.getTime();
  const diffSeconds = Math.round(diffMs / 1000);
  return {
    ok: true,
    seconds: String(diffSeconds),
    minutes: (diffMs / 60000).toFixed(2),
    hours: (diffMs / 3600000).toFixed(2),
    human: formatDuration(diffMs)
  };
}
