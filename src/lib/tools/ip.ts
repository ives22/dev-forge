export type IpLookupStatus = "idle" | "loading" | "ready" | "sample" | "error";

export interface PublicIpInfo {
  ip: string;
  type: "IPv4" | "IPv6";
  country: string;
  countryCode: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  isp: string;
  org: string;
  asn: string;
  source: string;
  updatedAt: string;
}

export type LocalConnectionType = "wifi" | "ethernet" | "unknown" | "unavailable";

export interface LocalNetworkIpInfo {
  ip: string;
  interfaceName: string;
  connectionType: LocalConnectionType;
  hardwarePort: string;
  macAddress: string;
  netmask: string;
  broadcast: string;
  isDefaultRoute: boolean;
  source: string;
  updatedAt: string;
  statusText: string;
}

export interface IpInfoResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;
  timezone?: string;
}

export interface IpifyResponse {
  ip?: string;
}

export interface SubnetCalculation {
  ip: string;
  prefix: number;
  mask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstUsable: string;
  lastUsable: string;
  totalAddresses: number;
  usableHosts: number;
  ipType: string;
  ipClass: string;
  blockSize: string;
  binary: Array<{ label: string; bits: string; prefix: number }>;
}

export const fallbackPublicIpInfo: PublicIpInfo = {
  ip: "203.0.113.42",
  type: "IPv4",
  country: "China",
  countryCode: "CN",
  region: "Shanghai",
  city: "Shanghai",
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: "Asia/Shanghai",
  isp: "China Telecom",
  org: "China Telecom Shanghai",
  asn: "AS4812",
  source: "示例数据",
  updatedAt: ""
};

export const unavailableLocalNetworkIpInfo: LocalNetworkIpInfo = {
  ip: "--",
  interfaceName: "--",
  connectionType: "unavailable",
  hardwarePort: "--",
  macAddress: "--",
  netmask: "--",
  broadcast: "--",
  isDefaultRoute: false,
  source: "browser",
  updatedAt: "",
  statusText: "桌面端可用"
};

export function localConnectionTypeLabel(type: LocalConnectionType): string {
  if (type === "wifi") return "Wi-Fi";
  if (type === "ethernet") return "有线";
  if (type === "unknown") return "未知";
  return "不可用";
}

export function parseIPv4(value: string): number[] | null {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) return Number.NaN;
    const num = Number(part);
    return num >= 0 && num <= 255 ? num : Number.NaN;
  });
  return octets.some(Number.isNaN) ? null : octets;
}

export function ipToInt(octets: number[]): number {
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

export function intToIp(value: number): string {
  const int = value >>> 0;
  return [int >>> 24, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join(".");
}

export function prefixToMask(prefix: number): number {
  if (prefix === 0) return 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function maskToPrefix(maskInt: number): number | null {
  const bits = (maskInt >>> 0).toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(bits)) return null;
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
}

export function parseMask(value: string): number | null {
  const text = value.trim().replace(/^\//, "");
  if (/^\d+$/.test(text)) {
    const prefix = Number(text);
    return prefix >= 0 && prefix <= 32 ? prefix : null;
  }
  const maskOctets = parseIPv4(text);
  if (!maskOctets) return null;
  return maskToPrefix(ipToInt(maskOctets));
}

export function classifyIp(octets: number[]): string {
  const [a, b] = octets;
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "私有地址";
  if (a === 127) return "回环地址";
  if (a === 169 && b === 254) return "链路本地";
  if (a >= 224 && a <= 239) return "组播地址";
  if (a >= 240) return "保留地址";
  return "公网地址";
}

export function ipClass(octets: number[]): string {
  const first = octets[0];
  if (first <= 127) return "A 类";
  if (first <= 191) return "B 类";
  if (first <= 223) return "C 类";
  if (first <= 239) return "D 类";
  return "E 类";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function binaryIp(intValue: number): string {
  return (intValue >>> 0)
    .toString(2)
    .padStart(32, "0")
    .match(/.{1,8}/g)!
    .join(".");
}

export function calculateSubnet(ipValue: string, maskValue: string): SubnetCalculation {
  const octets = parseIPv4(ipValue);
  if (!octets) throw new Error("请输入有效的 IPv4 地址，例如 192.168.10.34。");
  const prefix = parseMask(maskValue);
  if (prefix === null) throw new Error("请输入有效的 CIDR 或连续子网掩码，例如 24 或 255.255.255.0。");

  const ipInt = ipToInt(octets);
  const maskInt = prefixToMask(prefix);
  const wildcardInt = (~maskInt) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const totalAddresses = prefix === 0 ? 4294967296 : 2 ** (32 - prefix);
  const usableHosts = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(totalAddresses - 2, 0);
  const firstUsable = prefix >= 31 ? networkInt : (networkInt + 1) >>> 0;
  const lastUsable = prefix >= 31 ? broadcastInt : (broadcastInt - 1) >>> 0;
  const mask = intToIp(maskInt);
  const wildcard = intToIp(wildcardInt);

  return {
    ip: intToIp(ipInt),
    prefix,
    mask,
    wildcard,
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    firstUsable: intToIp(firstUsable),
    lastUsable: intToIp(lastUsable),
    totalAddresses,
    usableHosts,
    ipType: classifyIp(octets),
    ipClass: ipClass(octets),
    blockSize: prefix >= 24 ? String(256 - (maskInt & 255)) : `2^${32 - prefix}`,
    binary: [
      { label: "IP", bits: binaryIp(ipInt), prefix },
      { label: "Mask", bits: binaryIp(maskInt), prefix },
      { label: "Network", bits: binaryIp(networkInt), prefix },
      { label: "Broadcast", bits: binaryIp(broadcastInt), prefix }
    ]
  };
}

export function normalizeIpInfo(data: IpInfoResponse, now = new Date()): PublicIpInfo {
  const [latitude, longitude] = String(data.loc || "")
    .split(",")
    .map(Number);
  const orgParts = String(data.org || "").split(" ").filter(Boolean);
  const firstOrgPart = orgParts[0] ?? "";
  const asn = /^AS\d+$/i.test(firstOrgPart) ? firstOrgPart.toUpperCase() : "--";
  const org = /^AS\d+$/i.test(firstOrgPart) ? orgParts.slice(1).join(" ") : data.org || "--";
  const ip = data.ip || fallbackPublicIpInfo.ip;

  return {
    ip,
    type: ip.includes(":") ? "IPv6" : "IPv4",
    country: data.country || "--",
    countryCode: data.country || "--",
    region: data.region || "--",
    city: data.city || "--",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    timezone: data.timezone || "--",
    isp: org || "--",
    org: org || "--",
    asn,
    source: "ipinfo.io",
    updatedAt: now.toLocaleString("zh-CN", { hour12: false })
  };
}

export function withFallbackIp(ip?: string, now = new Date()): PublicIpInfo {
  return {
    ...fallbackPublicIpInfo,
    ip: ip || fallbackPublicIpInfo.ip,
    source: ip ? "ipify + 示例定位" : fallbackPublicIpInfo.source,
    updatedAt: now.toLocaleString("zh-CN", { hour12: false })
  };
}

export async function lookupPublicIp(fetcher: typeof fetch = fetch): Promise<{ info: PublicIpInfo; fallback: boolean }> {
  try {
    const response = await fetcher("https://ipinfo.io/json", { cache: "no-store" });
    if (!response.ok) throw new Error(`ipinfo returned ${response.status}`);
    const data = (await response.json()) as IpInfoResponse;
    if (!data.ip) throw new Error("ipinfo response missing ip");
    return { info: normalizeIpInfo(data), fallback: false };
  } catch {
    try {
      const response = await fetcher("https://api.ipify.org?format=json", { cache: "no-store" });
      if (!response.ok) throw new Error(`ipify returned ${response.status}`);
      const data = (await response.json()) as IpifyResponse;
      return { info: withFallbackIp(data.ip), fallback: true };
    } catch {
      return { info: withFallbackIp(), fallback: true };
    }
  }
}

export function publicIpRows(info: PublicIpInfo): Array<{ name: string; value: string; description: string }> {
  const location =
    info.latitude !== null && info.longitude !== null ? `${info.latitude.toFixed(4)}, ${info.longitude.toFixed(4)}` : "--";
  return [
    { name: "Public IP", value: info.ip, description: "当前机器访问公网服务时暴露的出口地址" },
    { name: "Location", value: `${info.city}, ${info.region}, ${info.country}`, description: "基于 IP 库推断的城市级位置" },
    { name: "ISP", value: info.isp, description: "互联网服务提供商" },
    { name: "Organization", value: info.org, description: "IP 段所属组织" },
    { name: "ASN", value: info.asn, description: "自治系统编号" },
    { name: "Timezone", value: info.timezone, description: "IP 所在地常见时区" },
    { name: "Coordinates", value: location, description: "纬度、经度，仅用于定位参考" },
    { name: "Source", value: info.source, description: "查询数据来源" }
  ];
}

export function localNetworkIpRows(info: LocalNetworkIpInfo): Array<{ name: string; value: string; description: string }> {
  return [
    { name: "Local IP", value: info.ip, description: "当前系统默认出口网卡的本机 IPv4 地址" },
    { name: "Interface", value: info.interfaceName, description: "系统网卡设备名" },
    { name: "Connection", value: localConnectionTypeLabel(info.connectionType), description: "Wi-Fi、有线或未识别网卡类型" },
    { name: "Hardware Port", value: info.hardwarePort, description: "macOS 硬件端口名称" },
    { name: "Netmask", value: info.netmask, description: "本机网卡 IPv4 子网掩码" },
    { name: "Broadcast", value: info.broadcast, description: "本机网卡 IPv4 广播地址" },
    { name: "MAC", value: info.macAddress, description: "网卡 MAC 地址" },
    { name: "Route", value: info.isDefaultRoute ? "Default" : "Fallback", description: info.statusText }
  ];
}

export function subnetRows(result: SubnetCalculation): Array<{ name: string; value: string; description: string }> {
  return [
    { name: "IP 地址", value: result.ip, description: `${result.ipType}，${result.ipClass}` },
    { name: "CIDR", value: `/${result.prefix}`, description: "网络前缀长度" },
    { name: "子网掩码", value: result.mask, description: "网络位为 1，主机位为 0" },
    { name: "反掩码", value: result.wildcard, description: "Wildcard mask，常用于 ACL" },
    { name: "网络地址", value: result.network, description: "该网段的 Network ID" },
    { name: "广播地址", value: result.broadcast, description: "该网段的广播地址" },
    { name: "首个可用", value: result.firstUsable, description: result.prefix >= 31 ? "点对点或单主机网络" : "通常排除网络地址" },
    { name: "最后可用", value: result.lastUsable, description: result.prefix >= 31 ? "点对点或单主机网络" : "通常排除广播地址" },
    { name: "地址总数", value: formatNumber(result.totalAddresses), description: "包含网络地址与广播地址" },
    { name: "可用主机数", value: formatNumber(result.usableHosts), description: result.prefix >= 31 ? "特殊网段按可用地址处理" : "总数减去网络与广播地址" }
  ];
}
