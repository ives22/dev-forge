import { describe, expect, it } from "vitest";
import { defaultPasswordOptions, generateCredentials, nanoAlphabet } from "./password";

function sequenceRandom() {
  let value = 0;
  return (max: number) => {
    const next = value % max;
    value += 1;
    return next;
  };
}

describe("credential generator", () => {
  it("generates passwords with one character from every selected group", () => {
    const result = generateCredentials({
      ...defaultPasswordOptions,
      count: 4,
      length: 24,
      mode: "password",
      randomInt: sequenceRandom()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toHaveLength(4);
    expect(result.values.every((item) => item.length === 24)).toBe(true);
    expect(result.values.every((item) => /[a-z]/.test(item.value))).toBe(true);
    expect(result.values.every((item) => /[A-Z]/.test(item.value))).toBe(true);
    expect(result.values.every((item) => /\d/.test(item.value))).toBe(true);
    expect(result.values.every((item) => /[!@#$%^&*()[\]{};:,.<>/?_=+-]/.test(item.value))).toBe(true);
  });

  it("removes excluded characters from every password", () => {
    const result = generateCredentials({
      ...defaultPasswordOptions,
      count: 8,
      length: 12,
      lower: true,
      upper: false,
      numbers: false,
      symbols: "",
      exclude: "abcxyz",
      mode: "password",
      randomInt: sequenceRandom()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.map((item) => item.value).join("")).not.toMatch(/[abcxyz]/);
  });

  it("reports an error when a selected group is fully excluded", () => {
    const result = generateCredentials({
      ...defaultPasswordOptions,
      lower: false,
      upper: false,
      numbers: true,
      symbols: "",
      exclude: "0123456789",
      mode: "password",
      randomInt: sequenceRandom()
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("数字已被排除完");
  });

  it("lifts password length to the selected group count", () => {
    const result = generateCredentials({
      ...defaultPasswordOptions,
      count: 1,
      length: 4,
      mode: "password",
      randomInt: sequenceRandom()
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.length).toBe(4);
    expect(result.values[0].value).toHaveLength(4);
  });

  it("generates UUID v4 values and NanoID values", () => {
    const uuid = generateCredentials({
      ...defaultPasswordOptions,
      count: 2,
      mode: "uuid",
      uuidFactory: () => "123e4567-e89b-42d3-a456-426614174000"
    });
    expect(uuid.ok).toBe(true);
    if (!uuid.ok) return;
    expect(uuid.values).toHaveLength(2);
    expect(uuid.values[0].value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const nanoid = generateCredentials({
      ...defaultPasswordOptions,
      count: 1,
      length: 21,
      mode: "nanoid",
      randomInt: sequenceRandom()
    });
    expect(nanoid.ok).toBe(true);
    if (!nanoid.ok) return;
    expect(nanoid.values[0].value).toHaveLength(21);
    expect(Array.from(nanoid.values[0].value).every((char) => nanoAlphabet.includes(char))).toBe(true);
  });
});
