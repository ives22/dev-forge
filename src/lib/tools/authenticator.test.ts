import { describe, expect, it } from "vitest";
import {
  base32ToBytes,
  extractOtpAuthUrisFromText,
  formatTotpCode,
  generateTotpCode,
  parseOtpAuthUri,
  remainingTotpSeconds,
  totpPayloadToOtpAuthUri
} from "./authenticator";

const asciiSecret = "12345678901234567890";
const sha256Secret = "12345678901234567890123456789012";
const sha512Secret = "1234567890123456789012345678901234567890123456789012345678901234";

function asciiToBase32(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = new TextEncoder().encode(value);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

describe("authenticator TOTP utilities", () => {
  it("decodes Base32 secrets with spaces and padding", () => {
    expect(Array.from(base32ToBytes("JBSW Y3DP===="))).toEqual(Array.from(new TextEncoder().encode("Hello")));
  });

  it("rejects invalid Base32 secrets", () => {
    expect(() => base32ToBytes("ABC1")).toThrow("密钥包含非法 Base32 字符");
  });

  it("matches RFC 6238 Appendix B vectors", async () => {
    const samples = [
      { time: 59, sha1: "94287082", sha256: "46119246", sha512: "90693936" },
      { time: 1111111109, sha1: "07081804", sha256: "68084774", sha512: "25091201" },
      { time: 1111111111, sha1: "14050471", sha256: "67062674", sha512: "99943326" },
      { time: 1234567890, sha1: "89005924", sha256: "91819424", sha512: "93441116" },
      { time: 2000000000, sha1: "69279037", sha256: "90698825", sha512: "38618901" },
      { time: 20000000000, sha1: "65353130", sha256: "77737706", sha512: "47863826" }
    ];

    for (const sample of samples) {
      await expect(generateTotpCode({ secret: asciiToBase32(asciiSecret), algorithm: "SHA-1", digits: 8, period: 30 }, sample.time * 1000)).resolves.toBe(sample.sha1);
      await expect(generateTotpCode({ secret: asciiToBase32(sha256Secret), algorithm: "SHA-256", digits: 8, period: 30 }, sample.time * 1000)).resolves.toBe(sample.sha256);
      await expect(generateTotpCode({ secret: asciiToBase32(sha512Secret), algorithm: "SHA-512", digits: 8, period: 30 }, sample.time * 1000)).resolves.toBe(sample.sha512);
    }
  });

  it("parses otpauth TOTP URIs with defaults and decoded label", () => {
    expect(parseOtpAuthUri("otpauth://totp/GitHub:dev%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub")).toEqual({
      issuer: "GitHub",
      accountName: "dev@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA-1",
      digits: 6,
      period: 30
    });
  });

  it("parses supported TOTP variants", () => {
    expect(parseOtpAuthUri("otpauth://totp/Work:ops?secret=abcd2345&algorithm=SHA512&digits=8&period=60")).toMatchObject({
      issuer: "Work",
      accountName: "ops",
      secret: "ABCD2345",
      algorithm: "SHA-512",
      digits: 8,
      period: 60
    });
  });

  it("exports TOTP payloads as standard otpauth URLs", () => {
    const uri = totpPayloadToOtpAuthUri({
      issuer: "Git Hub",
      accountName: "dev+totp@example.com",
      secret: "jbsw y3dp ehpk3pxp",
      algorithm: "SHA-256",
      digits: 8,
      period: 60
    });

    expect(uri).toBe(
      "otpauth://totp/Git%20Hub%3Adev%2Btotp%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Git+Hub&algorithm=SHA256&digits=8&period=60"
    );
    expect(parseOtpAuthUri(uri)).toEqual({
      issuer: "Git Hub",
      accountName: "dev+totp@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA-256",
      digits: 8,
      period: 60
    });
  });

  it("extracts otpauth URLs from text backup files", () => {
    expect(
      extractOtpAuthUrisFromText(`

otpauth://totp/GitHub:dev?secret=JBSWY3DP
   otpauth://totp/Work:ops?secret=ABCD2345&period=60
not-a-url
      `)
    ).toEqual(["otpauth://totp/GitHub:dev?secret=JBSWY3DP", "otpauth://totp/Work:ops?secret=ABCD2345&period=60", "not-a-url"]);
  });

  it("rejects unsupported OTP types and invalid parameters", () => {
    expect(() => parseOtpAuthUri("otpauth://hotp/GitHub:dev?secret=JBSWY3DP")).toThrow("暂不支持 HOTP");
    expect(() => parseOtpAuthUri("steam://totp/GitHub:dev?secret=JBSWY3DP")).toThrow("只支持 otpauth:// 协议");
    expect(() => parseOtpAuthUri("otpauth://totp/GitHub:dev")).toThrow("缺少 TOTP secret");
    expect(() => parseOtpAuthUri("otpauth://totp/GitHub:dev?secret=JBSWY3DP&digits=7")).toThrow("验证码位数仅支持 6 或 8");
    expect(() => parseOtpAuthUri("otpauth://totp/GitHub:dev?secret=JBSWY3DP&period=45")).toThrow("刷新周期仅支持 15、30 或 60 秒");
  });

  it("formats and calculates remaining seconds", () => {
    expect(formatTotpCode("123456")).toBe("123 456");
    expect(formatTotpCode("12345678")).toBe("1234 5678");
    expect(remainingTotpSeconds(30, 59_000)).toBe(1);
    expect(remainingTotpSeconds(30, 60_000)).toBe(30);
  });
});
