import { formatNumber } from "../utils";

export const fileSizeUnits = {
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3
} as const;

export const bandwidthUnits = {
  bps: 1,
  Kbps: 1000,
  Mbps: 1000 ** 2,
  Gbps: 1000 ** 3,
  Tbps: 1000 ** 4,
  "B/s": 8,
  "KB/s": 8 * 1000,
  "MB/s": 8 * 1000 ** 2,
  "GB/s": 8 * 1000 ** 3,
  "KiB/s": 8 * 1024,
  "MiB/s": 8 * 1024 ** 2,
  "GiB/s": 8 * 1024 ** 3
} as const;

export type FileSizeUnit = keyof typeof fileSizeUnits;
export type BandwidthUnit = keyof typeof bandwidthUnits;

export interface BandwidthInput {
  fileSize: number;
  fileUnit: FileSizeUnit;
  bandwidth: number;
  bandUnit: BandwidthUnit;
  efficiency: number;
  parallel: number;
}

export interface BandwidthResult {
  seconds: number;
  duration: string;
  perSecond: string;
  fiveMinutes: string;
  throughputBytes: number;
}

function formatTransfer(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function calculateBandwidth(input: BandwidthInput): BandwidthResult {
  const bytes = input.fileSize * fileSizeUnits[input.fileUnit];
  const bytesPerSecond =
    (input.bandwidth * bandwidthUnits[input.bandUnit] * (input.efficiency / 100) * Math.max(input.parallel, 0)) / 8;
  const seconds = bytesPerSecond > 0 ? bytes / bytesPerSecond : 0;
  const duration =
    seconds > 3600 ? `${(seconds / 3600).toFixed(2)} h` : seconds > 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds.toFixed(1)} s`;
  return {
    seconds,
    duration,
    perSecond: `${formatTransfer(bytesPerSecond)}/s`,
    fiveMinutes: formatTransfer(bytesPerSecond * 300),
    throughputBytes: bytesPerSecond
  };
}

export function convertBandwidth(value: number, from: BandwidthUnit) {
  const bitsPerSecond = value * bandwidthUnits[from];
  return {
    bitsPerSecond,
    bytesPerSecond: bitsPerSecond / 8,
    note: `${value || 0} ${from} = ${formatNumber(bitsPerSecond)} bps = ${formatNumber(bitsPerSecond / 8)} B/s`,
    values: Object.entries(bandwidthUnits).map(([unit, bits]) => ({
      unit: unit as BandwidthUnit,
      value: bitsPerSecond / bits,
      formatted: formatNumber(bitsPerSecond / bits)
    }))
  };
}
