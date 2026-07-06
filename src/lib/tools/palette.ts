export type PaletteMode = "analogous" | "complementary" | "triadic" | "monochrome";

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type HslColor = {
  h: number;
  s: number;
  l: number;
};

export type PaletteColor = {
  id: string;
  index: number;
  role: string;
  hex: string;
  rgb: RgbColor;
  rgbText: string;
  hsl: HslColor;
  hslText: string;
  textColor: "#0F172A" | "#FFFFFF";
  contrast: number;
};

export type PaletteResult = {
  colors: PaletteColor[];
  baseHex: string;
  requestedHex: string;
  validBase: boolean;
  mode: PaletteMode;
  modeLabel: string;
  cssVariables: string;
  hexList: string;
};

export type PaletteOptions = {
  baseHex: string;
  mode: PaletteMode;
  count: number;
};

export const paletteModes: Record<PaletteMode, { label: string; description: string }> = {
  analogous: { label: "邻近色", description: "围绕基准色向两侧展开，适合产品界面主视觉。" },
  complementary: { label: "互补色", description: "主色与对侧色相配对，适合强调行动和状态。" },
  triadic: { label: "三角色", description: "三等分色相环，适合需要更高区分度的方案。" },
  monochrome: { label: "单色阶", description: "同一色相下调整明度，适合克制的系统色板。" }
};

const fallbackHex = "#2563EB";
const roles = ["Primary", "Accent", "Support", "Surface", "Signal", "Muted", "Depth", "Edge", "Ink"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapHue(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

function toHexPart(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

export function normalizeHexColor(value: string): string | null {
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) return `#${normalized.toUpperCase()}`;
  return null;
}

export function hexToRgb(hex: string): RgbColor | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const value = normalized.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${toHexPart(r)}${toHexPart(g)}${toHexPart(b)}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(lightness * 100) };

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  if (max === green) hue = (blue - red) / delta + 2;
  if (max === blue) hue = (red - green) / delta + 4;

  return {
    h: wrapHue(hue * 60),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hue = wrapHue(h) / 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;

  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return { r: value, g: value, b: value };
  }

  const hueToRgb = (p: number, q: number, tValue: number) => {
    let t = tValue;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    r: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hue) * 255),
    b: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255)
  };
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(first: RgbColor, second: RgbColor): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function readableTextColor(rgb: RgbColor): { textColor: "#0F172A" | "#FFFFFF"; contrast: number } {
  const darkText: RgbColor = { r: 15, g: 23, b: 42 };
  const lightText: RgbColor = { r: 255, g: 255, b: 255 };
  const darkContrast = contrastRatio(rgb, darkText);
  const lightContrast = contrastRatio(rgb, lightText);
  return darkContrast >= lightContrast
    ? { textColor: "#0F172A", contrast: darkContrast }
    : { textColor: "#FFFFFF", contrast: lightContrast };
}

function modeOffsets(mode: PaletteMode): number[] {
  if (mode === "complementary") return [0, 180, 150, 210, 30, 330, 165, 195, 15];
  if (mode === "triadic") return [0, 120, 240, 150, 270, 90, 210, 330, 30];
  if (mode === "monochrome") return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return [0, 32, 328, 18, 342, 52, 308, 72, 288];
}

function lightnessDelta(mode: PaletteMode, index: number): number {
  if (mode === "monochrome") return [0, -18, 18, -30, 30, -8, 8, -40, 40][index] ?? 0;
  return [0, 0, 0, 10, -10, 14, -14, 22, -22][index] ?? 0;
}

function saturationDelta(mode: PaletteMode, index: number): number {
  if (mode === "monochrome") return [0, 4, -8, 10, -14, 0, -4, 14, -18][index] ?? 0;
  return [0, 0, 0, -8, 6, -10, 8, -16, 12][index] ?? 0;
}

export function clampPaletteCount(value: number): number {
  if (!Number.isFinite(value)) return 6;
  return clamp(Math.trunc(value), 3, 9);
}

export function generatePalette(options: PaletteOptions): PaletteResult {
  const requestedHex = options.baseHex;
  const normalized = normalizeHexColor(options.baseHex);
  const baseHex = normalized ?? fallbackHex;
  const baseRgb = hexToRgb(baseHex) ?? { r: 37, g: 99, b: 235 };
  const baseHsl = rgbToHsl(baseRgb);
  const count = clampPaletteCount(options.count);
  const offsets = modeOffsets(options.mode);
  const seen = new Set<string>();

  const colors = Array.from({ length: count }, (_, index) => {
    const hsl = {
      h: wrapHue(baseHsl.h + offsets[index]),
      s: clamp(baseHsl.s + saturationDelta(options.mode, index), 18, 92),
      l: clamp(baseHsl.l + lightnessDelta(options.mode, index), 16, 86)
    };
    let rgb = index === 0 ? baseRgb : hslToRgb(hsl);
    let hex = index === 0 ? baseHex : rgbToHex(rgb);
    if (seen.has(hex)) {
      const adjusted = { ...hsl, l: clamp(hsl.l + 6 + index * 2, 16, 88) };
      rgb = hslToRgb(adjusted);
      hex = rgbToHex(rgb);
      hsl.l = adjusted.l;
    }
    seen.add(hex);
    const text = readableTextColor(rgb);
    return {
      id: `${options.mode}-${index}-${hex}`,
      index: index + 1,
      role: roles[index] ?? `Color ${index + 1}`,
      hex,
      rgb,
      rgbText: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      hsl,
      hslText: `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`,
      textColor: text.textColor,
      contrast: Number(text.contrast.toFixed(2))
    };
  });

  return {
    colors,
    baseHex,
    requestedHex,
    validBase: Boolean(normalized),
    mode: options.mode,
    modeLabel: paletteModes[options.mode].label,
    cssVariables: colors.map((color) => `--color-${color.index}: ${color.hex};`).join("\n"),
    hexList: colors.map((color) => color.hex).join("\n")
  };
}

export function randomPaletteHex(random = Math.random): string {
  return rgbToHex({
    r: 24 + Math.floor(random() * 208),
    g: 24 + Math.floor(random() * 208),
    b: 24 + Math.floor(random() * 208)
  });
}
