import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function byteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return Number(value.toFixed(4)).toString();
  if (value === 0) return "0";
  return Number(value.toPrecision(4)).toString();
}

export function preview(value: string, limit = 96): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1)}…`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
