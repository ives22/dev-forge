export const dnsRecordTypes = ["A", "AAAA", "CNAME", "MX", "TXT"] as const;

export type DnsRecordType = (typeof dnsRecordTypes)[number];
export type DnsSource = "system" | "doh";
export type DnsStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface DnsRecord {
  type: DnsRecordType;
  host: string;
  value: string;
  ttl: number | null;
  source: string;
  priority?: number;
}

export interface DnsTraceStep {
  name: string;
  value: string;
}

export interface DnsLookupResult {
  domain: string;
  type: DnsRecordType;
  records: DnsRecord[];
  trace: DnsTraceStep[];
  elapsedMs: number;
  source: DnsSource;
  resolver: string;
  statusText: string;
}

interface DnsAnswer {
  name?: string;
  type?: number;
  TTL?: number;
  data?: string;
}

interface DnsJsonResponse {
  Status?: number;
  Answer?: DnsAnswer[];
  Comment?: string;
}

const typeCodeByRecord: Record<DnsRecordType, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  TXT: 16
};

const recordByTypeCode = Object.fromEntries(
  Object.entries(typeCodeByRecord).map(([recordType, code]) => [code, recordType])
) as Record<number, DnsRecordType>;

export function normalizeDnsDomain(value: string): string {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  return cleaned || "devforge.app";
}

export function isValidDnsDomain(value: string): boolean {
  const domain = normalizeDnsDomain(value);
  if (domain.length > 253) return false;
  return domain.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

export function makeDnsTrace(domain: string, elapsedMs: number): DnsTraceStep[] {
  const parts = normalizeDnsDomain(domain).split(".");
  const root = parts.at(-1) ?? domain;
  const zone = parts.length > 1 ? parts.slice(-2).join(".") : domain;
  const host = parts.length > 2 ? parts.join(".") : domain;
  const safeElapsed = Math.max(1, elapsedMs);
  return [
    { name: "root", value: `${Math.max(1, Math.round(safeElapsed * 0.24))}ms` },
    { name: root, value: `${Math.max(2, Math.round(safeElapsed * 0.36))}ms` },
    { name: zone === host ? "authoritative" : zone, value: `${Math.max(3, Math.round(safeElapsed * 0.58))}ms` },
    { name: host, value: `${safeElapsed}ms` }
  ];
}

export async function lookupDnsOverHttps(domain: string, type: DnsRecordType, fetcher: typeof fetch = fetch): Promise<DnsLookupResult> {
  const normalizedDomain = normalizeDnsDomain(domain);
  if (!isValidDnsDomain(normalizedDomain)) {
    throw new Error("请输入有效域名，例如 devforge.app 或 api.example.com");
  }

  const startedAt = performance.now();
  const endpoint = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(normalizedDomain)}&type=${type}`;
  const response = await fetcher(endpoint, {
    headers: {
      accept: "application/dns-json"
    }
  });
  const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));

  if (!response.ok) {
    throw new Error(`DNS 查询失败：Cloudflare DoH 返回 ${response.status}`);
  }

  const payload = (await response.json()) as DnsJsonResponse;
  if (payload.Status && payload.Status !== 0) {
    throw new Error(payload.Comment || `DNS 查询失败：状态码 ${payload.Status}`);
  }

  const records = (payload.Answer ?? [])
    .filter((answer) => answer.type === typeCodeByRecord[type])
    .map((answer) =>
      parseDnsRecordValue(
        normalizeDnsHost(answer.name ?? normalizedDomain),
        recordByTypeCode[answer.type ?? typeCodeByRecord[type]] ?? type,
        answer.data ?? "",
        typeof answer.TTL === "number" ? answer.TTL : null,
        "1.1.1.1"
      )
    );

  return {
    domain: normalizedDomain,
    type,
    records,
    trace: makeDnsTrace(normalizedDomain, elapsedMs),
    elapsedMs,
    source: "doh",
    resolver: "Cloudflare 1.1.1.1",
    statusText: records.length ? "OK" : "No Answer"
  };
}

export function dnsMetrics(result: DnsLookupResult | null, status: DnsStatus) {
  if (!result) {
    return status === "loading" ? { count: "-", ttl: "-", elapsed: "..." } : { count: "0", ttl: "-", elapsed: "-" };
  }

  const ttlValues = result.records.map((record) => record.ttl).filter((ttl): ttl is number => typeof ttl === "number");
  const ttl = ttlValues.length ? Math.min(...ttlValues).toString() : "-";
  return {
    count: result.records.length.toString(),
    ttl,
    elapsed: `${result.elapsedMs}ms`
  };
}

export function recordsToText(records: DnsRecord[]): string {
  return records.map((record) => [record.type, record.host, record.value, record.ttl ?? "-", record.source].join("\t")).join("\n");
}

function normalizeDnsHost(value: string): string {
  return value.replace(/\.$/, "");
}

function parseDnsRecordValue(host: string, type: DnsRecordType, value: string, ttl: number | null, source: string): DnsRecord {
  if (type === "MX") {
    const [priority, ...exchange] = value.split(/\s+/);
    return {
      type,
      host,
      value: normalizeDnsHost(exchange.join(" ") || value),
      ttl,
      source,
      priority: Number(priority)
    };
  }

  return {
    type,
    host,
    value: type === "TXT" ? value.replace(/^"|"$/g, "") : normalizeDnsHost(value),
    ttl,
    source
  };
}
