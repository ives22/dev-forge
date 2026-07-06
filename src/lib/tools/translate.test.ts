import { describe, expect, it, vi } from "vitest";
import {
  MAX_PUBLIC_TRANSLATE_CHARS,
  buildBaiduSignPayload,
  buildMyMemoryUrl,
  maskTranslateCredential,
  detectSourceLanguage,
  translateText,
  translateProviders,
  upsertTranslateCredential,
  type TranslateRequest
} from "./translate";

function okJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}

function publicRequest(overrides: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    text: "Hello DevForge",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    providerId: "mymemory",
    ...overrides
  };
}

const configuredCredentials = {
  baidu: { appId: "baidu-app", secretKey: "baidu-secret" },
  azure: { key: "azure-key", region: "eastasia" },
  deepl: { authKey: "deepl-key" },
  google: { apiKey: "google-key" }
};

describe("translate tool", () => {
  it("builds a MyMemory URL with encoded text and an explicit language pair", () => {
    const url = new URL(buildMyMemoryUrl("Hello DevForge", "en", "zh-CN"));

    expect(url.origin).toBe("https://api.mymemory.translated.net");
    expect(url.searchParams.get("q")).toBe("Hello DevForge");
    expect(url.searchParams.get("langpair")).toBe("en|zh-CN");
  });

  it("detects a practical source language for auto mode", () => {
    expect(detectSourceLanguage("需要一个快捷翻译工具", "en")).toBe("zh-CN");
    expect(detectSourceLanguage("Translate this quickly", "zh-CN")).toBe("en");
  });

  it("translates through the default public provider", async () => {
    const fetcher = vi.fn(async () =>
      okJson({
        responseStatus: 200,
        responseData: {
          translatedText: "你好 DevForge",
          match: 0.98
        }
      })
    ) as unknown as typeof fetch;

    const result = await translateText(publicRequest(), fetcher);

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("api.mymemory.translated.net/get"), { cache: "no-store" });
    expect(result.translatedText).toBe("你好 DevForge");
    expect(result.providerId).toBe("mymemory");
    expect(result.sourceLanguage).toBe("en");
    expect(result.targetLanguage).toBe("zh-CN");
    expect(result.characterCount).toBe("Hello DevForge".length);
  });

  it("uses local source detection when the source language is auto", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      okJson({
        responseStatus: 200,
        responseData: {
          translatedText: "A fast translation tool"
        }
      })
    );
    const fetcher = fetchMock as unknown as typeof fetch;

    const result = await translateText(publicRequest({ text: "快捷翻译工具", sourceLanguage: "auto", targetLanguage: "en" }), fetcher);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(url.searchParams.get("langpair")).toBe("zh-CN|en");
    expect(result.detectedSourceLanguage).toBe("zh-CN");
  });

  it("rejects empty and over-limit text before calling a public API", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(translateText(publicRequest({ text: "   " }), fetcher)).rejects.toThrow("请输入要翻译的文本");
    await expect(translateText(publicRequest({ text: "a".repeat(MAX_PUBLIC_TRANSLATE_CHARS + 1) }), fetcher)).rejects.toThrow(
      `${MAX_PUBLIC_TRANSLATE_CHARS} 字符`
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("turns public API error payloads into user-facing errors", async () => {
    const fetcher = vi.fn(async () =>
      okJson({
        responseStatus: 403,
        responseDetails: "INVALID LANGUAGE PAIR SPECIFIED"
      })
    ) as unknown as typeof fetch;

    await expect(translateText(publicRequest(), fetcher)).rejects.toThrow("INVALID LANGUAGE PAIR SPECIFIED");
  });

  it("marks API-key providers as configurable", async () => {
    const baidu = translateProviders.find((provider) => provider.id === "baidu");

    expect(baidu).toMatchObject({ mode: "user-key-api", status: "ready", requiresApiKey: true });
    await expect(translateText(publicRequest({ providerId: "baidu" }), vi.fn() as unknown as typeof fetch)).rejects.toThrow("需要配置 API Key");
  });

  it("masks credentials and updates one provider without dropping others", () => {
    const next = upsertTranslateCredential(configuredCredentials, "deepl", { authKey: "new-deepl-key" });

    expect(next.baidu).toEqual(configuredCredentials.baidu);
    expect(next.deepl).toEqual({ authKey: "new-deepl-key" });
    expect(maskTranslateCredential(next.deepl)).toBe("••••••••••ey");
  });

  it("builds a deterministic Baidu sign payload", async () => {
    const payload = await buildBaiduSignPayload("hello", "en", "zh-CN", configuredCredentials.baidu, "123");

    expect(payload).toEqual({
      q: "hello",
      from: "en",
      to: "zh",
      appid: "baidu-app",
      salt: "123",
      sign: "25bd351ebaa7833ef865432c13c783e3"
    });
  });

  it("translates with Baidu credentials", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("appid")).toBe("baidu-app");
      expect(body.get("from")).toBe("en");
      expect(body.get("to")).toBe("zh");
      expect(body.get("sign")).toMatch(/^[a-f0-9]{32}$/);
      return okJson({
        from: "en",
        to: "zh",
        trans_result: [{ src: "hello", dst: "你好" }]
      });
    });

    const result = await translateText(publicRequest({ providerId: "baidu", text: "hello" }), fetchMock as unknown as typeof fetch, {
      credentials: configuredCredentials,
      saltFactory: () => "123"
    });

    expect(result.translatedText).toBe("你好");
    expect(result.providerId).toBe("baidu");
  });

  it("translates with Azure credentials", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toContain("api.cognitive.microsofttranslator.com/translate");
      expect((init?.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe("azure-key");
      expect((init?.headers as Record<string, string>)["Ocp-Apim-Subscription-Region"]).toBe("eastasia");
      return okJson([{ detectedLanguage: { language: "en" }, translations: [{ text: "你好", to: "zh-Hans" }] }]);
    });

    const result = await translateText(publicRequest({ providerId: "azure", text: "hello" }), fetchMock as unknown as typeof fetch, {
      credentials: configuredCredentials
    });

    expect(result.translatedText).toBe("你好");
    expect(result.detectedSourceLanguage).toBe("en");
  });

  it("translates with DeepL credentials", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe("https://api-free.deepl.com/v2/translate");
      expect((init?.headers as Record<string, string>).Authorization).toBe("DeepL-Auth-Key deepl-key");
      return okJson({ translations: [{ detected_source_language: "EN", text: "你好" }] });
    });

    const result = await translateText(publicRequest({ providerId: "deepl", text: "hello" }), fetchMock as unknown as typeof fetch, {
      credentials: configuredCredentials
    });

    expect(result.translatedText).toBe("你好");
    expect(result.sourceLanguage).toBe("en");
  });

  it("translates with Google credentials", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toContain("translation.googleapis.com/language/translate/v2");
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      expect(JSON.parse(String(init?.body))).toMatchObject({ q: "hello", source: "en", target: "zh-CN", format: "text" });
      return okJson({ data: { translations: [{ translatedText: "你好" }] } });
    });

    const result = await translateText(publicRequest({ providerId: "google", text: "hello" }), fetchMock as unknown as typeof fetch, {
      credentials: configuredCredentials
    });

    expect(result.translatedText).toBe("你好");
  });
});
