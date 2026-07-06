export type GeneratorMode = "password" | "uuid" | "nanoid";

export type PasswordStrengthKind = "strong" | "medium" | "weak";

export type GeneratorQuality = {
  kind: PasswordStrengthKind;
  text: string;
};

export type GeneratedCredential = {
  id: string;
  value: string;
  length: number;
  type: string;
  quality: GeneratorQuality;
};

export type PasswordOptions = {
  count: number;
  length: number;
  lower: boolean;
  upper: boolean;
  numbers: boolean;
  symbols: string;
  exclude: string;
};

export type GenerateOptions = PasswordOptions & {
  mode: GeneratorMode;
  randomInt?: (max: number) => number;
  uuidFactory?: () => string;
};

export type GenerateSuccess = {
  ok: true;
  mode: GeneratorMode;
  count: number;
  length: number;
  poolSize: number;
  rule: string;
  quality: GeneratorQuality;
  values: GeneratedCredential[];
};

export type GenerateFailure = {
  ok: false;
  mode: GeneratorMode;
  count: number;
  length: number;
  poolSize: number;
  rule: string;
  quality: GeneratorQuality;
  message: string;
};

export type GenerateResult = GenerateSuccess | GenerateFailure;

type PasswordGroup = {
  key: "lower" | "upper" | "numbers" | "symbols";
  label: string;
  rawChars: string;
};

const lowerChars = "abcdefghijklmnopqrstuvwxyz";
const upperChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const numberChars = "0123456789";
export const defaultSymbolChars = "!@#$%^&*()-_=+[]{};:,.<>/?";
export const nanoAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

export const defaultPasswordOptions: PasswordOptions = {
  count: 12,
  length: 24,
  lower: true,
  upper: true,
  numbers: true,
  symbols: defaultSymbolChars,
  exclude: ""
};

export function clampGeneratorNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function uniqueChars(value: string): string {
  return Array.from(new Set(Array.from(value))).join("");
}

function secureRandomInt(max: number): number {
  if (max <= 0) return 0;
  const limit = Math.floor(256 / max) * max;
  const bytes = new Uint8Array(1);
  do {
    globalThis.crypto.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return bytes[0] % max;
}

function randomChar(chars: string, randomInt: (max: number) => number): string {
  return chars[randomInt(chars.length)] ?? "";
}

function shuffleSecure(chars: string[], randomInt: (max: number) => number): string[] {
  const output = [...chars];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function passwordGroups(options: PasswordOptions): PasswordGroup[] {
  return [
    options.lower ? { key: "lower", label: "小写", rawChars: lowerChars } : null,
    options.upper ? { key: "upper", label: "大写", rawChars: upperChars } : null,
    options.numbers ? { key: "numbers", label: "数字", rawChars: numberChars } : null,
    options.symbols ? { key: "symbols", label: "符号", rawChars: options.symbols } : null
  ].filter(Boolean) as PasswordGroup[];
}

function passwordStrength(length: number, poolSize: number, groupCount: number): GeneratorQuality {
  const score = length * Math.log2(Math.max(poolSize, 1));
  if (score >= 96 && groupCount >= 3) return { kind: "strong", text: "强度高" };
  if (score >= 60 && groupCount >= 2) return { kind: "medium", text: "强度中" };
  return { kind: "weak", text: "强度低" };
}

function makePassword(length: number, groups: PasswordGroup[], pool: string, randomInt: (max: number) => number): string {
  const required = groups.map((group) => randomChar(group.rawChars, randomInt));
  const remaining = Math.max(0, length - required.length);
  const rest = Array.from({ length: remaining }, () => randomChar(pool, randomInt));
  return shuffleSecure([...required, ...rest], randomInt).join("");
}

function makeNanoid(length: number, randomInt: (max: number) => number): string {
  return Array.from({ length }, () => randomChar(nanoAlphabet, randomInt)).join("");
}

function fallbackUuid(randomInt: (max: number) => number): string {
  const bytes = Array.from({ length: 16 }, () => randomInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function uuidv4(randomInt: (max: number) => number = secureRandomInt, uuidFactory: (() => string) | undefined = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)): string {
  if (uuidFactory) return uuidFactory();
  return fallbackUuid(randomInt);
}

export function generateCredentials(options: GenerateOptions): GenerateResult {
  const randomInt = options.randomInt ?? secureRandomInt;
  const count = clampGeneratorNumber(options.count, 1, 100, defaultPasswordOptions.count);
  const baseLength = clampGeneratorNumber(options.length, 4, 128, defaultPasswordOptions.length);

  if (options.mode === "uuid") {
    const quality = { kind: "strong", text: "UUID v4" } as const;
    const values = Array.from({ length: count }, (_, index) => {
      const value = uuidv4(randomInt, options.uuidFactory);
      return { id: `uuid-${index}-${value}`, value, length: value.length, type: "UUID v4", quality };
    });
    return { ok: true, mode: options.mode, count, length: 36, poolSize: 16, rule: "固定格式", quality, values };
  }

  if (options.mode === "nanoid") {
    const quality = { kind: "strong", text: "NanoID" } as const;
    const values = Array.from({ length: count }, (_, index) => {
      const value = makeNanoid(baseLength, randomInt);
      return { id: `nanoid-${index}-${value}`, value, length: value.length, type: "NanoID", quality };
    });
    return { ok: true, mode: options.mode, count, length: baseLength, poolSize: nanoAlphabet.length, rule: "URL Safe", quality, values };
  }

  const excluded = new Set(Array.from(options.exclude));
  const groups = passwordGroups(options).map((group) => ({
    ...group,
    rawChars: uniqueChars(group.rawChars)
      .split("")
      .filter((char) => !excluded.has(char))
      .join("")
  }));
  const pool = uniqueChars(groups.map((group) => group.rawChars).join(""));
  const quality = passwordStrength(baseLength, pool.length, groups.length);

  if (!groups.length) {
    return { ok: false, mode: options.mode, count, length: baseLength, poolSize: 0, rule: "每类至少一个", quality: { kind: "weak", text: "无字符池" }, message: "请选择字符类型" };
  }

  const emptyGroup = groups.find((group) => !group.rawChars.length);
  if (emptyGroup) {
    return {
      ok: false,
      mode: options.mode,
      count,
      length: baseLength,
      poolSize: pool.length,
      rule: "每类至少一个",
      quality: { kind: "weak", text: "字符不足" },
      message: `${emptyGroup.label}已被排除完`
    };
  }

  if (!pool.length) {
    return { ok: false, mode: options.mode, count, length: baseLength, poolSize: 0, rule: "每类至少一个", quality: { kind: "weak", text: "字符不足" }, message: "字符池为空" };
  }

  const length = Math.max(baseLength, groups.length);
  const finalQuality = passwordStrength(length, pool.length, groups.length);
  const values = Array.from({ length: count }, (_, index) => {
    const value = makePassword(length, groups, pool, randomInt);
    return { id: `password-${index}-${value}`, value, length: value.length, type: finalQuality.text, quality: finalQuality };
  });

  return { ok: true, mode: options.mode, count, length, poolSize: pool.length, rule: "每类至少一个", quality: finalQuality, values };
}
