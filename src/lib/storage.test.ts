import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addFavoriteTool,
  createAuthenticatorVault,
  deleteAuthenticatorAccount,
  getAuthenticatorVaultMeta,
  getUsageSummary,
  listAuthenticatorAccounts,
  listFavoriteTools,
  recordUsage,
  removeFavoriteTool,
  resetAuthenticatorVault,
  resetStorageFallbacksForTests,
  saveAuthenticatorAccount,
  unlockAuthenticatorVault
} from "./storage";

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn()
  }
}));

afterEach(() => {
  resetStorageFallbacksForTests();
  window.localStorage.clear();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-18T10:00:00.000Z"));
});

describe("favorite tool storage fallback", () => {
  it("starts with an empty favorite list", async () => {
    await expect(listFavoriteTools()).resolves.toEqual([]);
  });

  it("adds favorites once and keeps insertion order", async () => {
    await addFavoriteTool("json-yaml");
    await addFavoriteTool("base64");
    await addFavoriteTool("json-yaml");

    await expect(listFavoriteTools()).resolves.toEqual(["json-yaml", "base64"]);
  });

  it("removes a favorite tool", async () => {
    await addFavoriteTool("json-yaml");
    await addFavoriteTool("base64");
    await removeFavoriteTool("json-yaml");

    await expect(listFavoriteTools()).resolves.toEqual(["base64"]);
  });
});

describe("usage summary fallback", () => {
  it("summarizes usage totals, clipboard actions, statuses and tool counts", async () => {
    await recordUsage({ toolId: "base64", action: "copy", input: "dev", output: "ZGV2", status: "ok" });
    await recordUsage({ toolId: "base64", action: "run", input: "dev", output: "ZGV2", status: "warn" });
    await recordUsage({ toolId: "regex", action: "copy-result", input: "hello", output: "hello", status: "error" });

    await expect(getUsageSummary()).resolves.toMatchObject({
      totalUsage: 3,
      todayUsage: 3,
      clipboardActions: 2,
      toolCountTrendPercent: 0,
      todayUsageTrendPercent: 100,
      clipboardTrendPercent: 100,
      okCount: 1,
      warnCount: 1,
      errorCount: 1,
      backend: "fallback",
      recentToolCounts: [
        { tool_id: "base64", count: 2 },
        { tool_id: "regex", count: 1 }
      ],
      toolCounts: [
        { tool_id: "base64", count: 2 },
        { tool_id: "regex", count: 1 }
      ]
    });
  });

  it("keeps total tool counts but limits recent tool counts to the last 7 days", async () => {
    await recordUsage({ toolId: "base64", action: "run", input: "dev", output: "ZGV2", status: "ok" });

    vi.setSystemTime(new Date("2026-06-10T09:00:00.000Z"));
    await recordUsage({ toolId: "regex", action: "run", input: "hello", output: "hello", status: "ok" });

    vi.setSystemTime(new Date("2026-06-18T10:00:00.000Z"));

    await expect(getUsageSummary()).resolves.toMatchObject({
      toolCounts: [
        { tool_id: "base64", count: 1 },
        { tool_id: "regex", count: 1 }
      ],
      recentToolCounts: [{ tool_id: "base64", count: 1 }]
    });
  });

  it("orders recent tool counts by latest usage when counts are tied", async () => {
    await recordUsage({ toolId: "base64", action: "run", input: "first", output: "a", status: "ok" });

    vi.setSystemTime(new Date("2026-06-18T10:05:00.000Z"));
    await recordUsage({ toolId: "regex", action: "run", input: "second", output: "b", status: "ok" });

    const summary = await getUsageSummary();

    expect(summary.recentToolCounts).toMatchObject([
      { tool_id: "regex", count: 1 },
      { tool_id: "base64", count: 1 }
    ]);
  });

  it("returns an empty recent tool count list when there is no usage in the last 7 days", async () => {
    vi.setSystemTime(new Date("2026-06-10T09:00:00.000Z"));
    await recordUsage({ toolId: "base64", action: "run", input: "dev", output: "ZGV2", status: "ok" });

    vi.setSystemTime(new Date("2026-06-18T10:00:00.000Z"));

    const summary = await getUsageSummary();
    expect(summary.recentToolCounts).toEqual([]);
  });
});

describe("authenticator vault fallback", () => {
  it("creates and unlocks a password-protected vault", async () => {
    await expect(getAuthenticatorVaultMeta()).resolves.toBeNull();

    const vaultKey = await createAuthenticatorVault("correct horse battery staple");
    expect(vaultKey).toBeInstanceOf(CryptoKey);
    await expect(getAuthenticatorVaultMeta()).resolves.toMatchObject({
      version: 1,
      kdf: "PBKDF2-HMAC-SHA-256",
      iterations: 600000
    });

    await expect(unlockAuthenticatorVault("correct horse battery staple")).resolves.toBeInstanceOf(CryptoKey);
    await expect(unlockAuthenticatorVault("wrong password")).rejects.toThrow("主密码不正确");
  });

  it("encrypts account payloads without storing readable secrets", async () => {
    const vaultKey = await createAuthenticatorVault("vault password");
    const record = await saveAuthenticatorAccount(vaultKey, {
      issuer: "GitHub",
      accountName: "dev@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA-1",
      digits: 6,
      period: 30
    });

    expect(record.payloadCiphertext).not.toContain("GitHub");
    expect(record.payloadCiphertext).not.toContain("dev@example.com");
    expect(record.payloadCiphertext).not.toContain("JBSWY3DPEHPK3PXP");
    await expect(listAuthenticatorAccounts(vaultKey)).resolves.toMatchObject([
      {
        id: record.id,
        payload: {
          issuer: "GitHub",
          accountName: "dev@example.com",
          secret: "JBSWY3DPEHPK3PXP",
          algorithm: "SHA-1",
          digits: 6,
          period: 30
        }
      }
    ]);
  });

  it("deletes accounts and can reset the vault", async () => {
    const vaultKey = await createAuthenticatorVault("vault password");
    const record = await saveAuthenticatorAccount(vaultKey, {
      issuer: "GitHub",
      accountName: "dev@example.com",
      secret: "JBSWY3DPEHPK3PXP",
      algorithm: "SHA-1",
      digits: 6,
      period: 30
    });

    await deleteAuthenticatorAccount(record.id);
    await expect(listAuthenticatorAccounts(vaultKey)).resolves.toEqual([]);

    await resetAuthenticatorVault();
    await expect(getAuthenticatorVaultMeta()).resolves.toBeNull();
    await expect(unlockAuthenticatorVault("vault password")).rejects.toThrow("尚未创建 2FA 保险库");
  });
});
