import { describe, expect, it, vi } from "vitest";
import { dnsMetrics, isValidDnsDomain, lookupDnsOverHttps, recordsToText, type DnsLookupResult } from "./dns";

describe("dns tool", () => {
  it("normalizes and validates domains", () => {
    expect(isValidDnsDomain("https://API.DevForge.App/path")).toBe(true);
    expect(isValidDnsDomain("-bad.example")).toBe(false);
  });

  it("parses DNS over HTTPS answers", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        Status: 0,
        Answer: [
          { name: "devforge.app.", type: 5, TTL: 300, data: "edge.devforge.app." },
          { name: "devforge.app.", type: 1, TTL: 300, data: "104.21.32.18" },
          { name: "devforge.app.", type: 1, TTL: 360, data: "172.67.140.81" }
        ]
      })
    })) as unknown as typeof fetch;

    const result = await lookupDnsOverHttps("DevForge.App", "A", fetcher);

    expect(result.domain).toBe("devforge.app");
    expect(result.records).toHaveLength(2);
    expect(result.records.every((record) => record.type === "A")).toBe(true);
    expect(result.records[0]).toMatchObject({ host: "devforge.app", type: "A", ttl: 300, value: "104.21.32.18" });
    expect(result.source).toBe("doh");
    expect(recordsToText(result.records)).toContain("A\tdevforge.app\t104.21.32.18\t300\t1.1.1.1");
  });

  it("keeps previous metrics visible while refreshing", () => {
    const result: DnsLookupResult = {
      domain: "devforge.app",
      type: "A",
      records: [
        { type: "A", host: "devforge.app", value: "3.33.130.190", ttl: 571, source: "1.1.1.1" },
        { type: "A", host: "devforge.app", value: "15.197.148.33", ttl: 571, source: "1.1.1.1" }
      ],
      trace: [],
      elapsedMs: 33,
      source: "doh",
      resolver: "Cloudflare 1.1.1.1",
      statusText: "OK"
    };

    expect(dnsMetrics(result, "loading")).toEqual({ count: "2", ttl: "571", elapsed: "33ms" });
  });
});
