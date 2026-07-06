import { describe, expect, it } from "vitest";
import { calculateSubnet, localNetworkIpRows, maskToPrefix, normalizeIpInfo, parseMask, parseIPv4 } from "./ip";

describe("ip tools", () => {
  it("parses valid IPv4 addresses", () => {
    expect(parseIPv4("192.168.10.34")).toEqual([192, 168, 10, 34]);
    expect(parseIPv4("256.1.1.1")).toBeNull();
    expect(parseIPv4("192.168.1")).toBeNull();
  });

  it("parses CIDR and contiguous dotted masks", () => {
    expect(parseMask("24")).toBe(24);
    expect(parseMask("/26")).toBe(26);
    expect(parseMask("255.255.255.192")).toBe(26);
    expect(maskToPrefix(0xffffff00)).toBe(24);
    expect(parseMask("255.0.255.0")).toBeNull();
  });

  it("calculates a /24 private subnet", () => {
    const result = calculateSubnet("192.168.10.34", "24");
    expect(result.network).toBe("192.168.10.0");
    expect(result.broadcast).toBe("192.168.10.255");
    expect(result.firstUsable).toBe("192.168.10.1");
    expect(result.lastUsable).toBe("192.168.10.254");
    expect(result.usableHosts).toBe(254);
    expect(result.ipType).toBe("私有地址");
    expect(result.ipClass).toBe("C 类");
  });

  it("calculates a subnet from dotted decimal mask", () => {
    const result = calculateSubnet("10.24.18.129", "255.255.255.192");
    expect(result.prefix).toBe(26);
    expect(result.mask).toBe("255.255.255.192");
    expect(result.network).toBe("10.24.18.128");
    expect(result.broadcast).toBe("10.24.18.191");
    expect(result.usableHosts).toBe(62);
  });

  it("handles /31 point-to-point networks", () => {
    const result = calculateSubnet("192.0.2.10", "31");
    expect(result.network).toBe("192.0.2.10");
    expect(result.broadcast).toBe("192.0.2.11");
    expect(result.firstUsable).toBe("192.0.2.10");
    expect(result.lastUsable).toBe("192.0.2.11");
    expect(result.usableHosts).toBe(2);
  });

  it("normalizes ipinfo responses", () => {
    const result = normalizeIpInfo(
      {
        ip: "18.181.224.94",
        city: "Tokyo",
        region: "Tokyo",
        country: "JP",
        loc: "35.6895,139.6917",
        org: "AS16509 Amazon.com, Inc.",
        timezone: "Asia/Tokyo"
      },
      new Date("2026-06-13T10:00:00+08:00")
    );
    expect(result.type).toBe("IPv4");
    expect(result.asn).toBe("AS16509");
    expect(result.org).toBe("Amazon.com, Inc.");
    expect(result.latitude).toBeCloseTo(35.6895);
    expect(result.source).toBe("ipinfo.io");
  });

  it("formats local network interface rows", () => {
    const rows = localNetworkIpRows({
      ip: "192.168.60.211",
      interfaceName: "en0",
      connectionType: "wifi",
      hardwarePort: "Wi-Fi",
      macAddress: "90:9b:6f:15:bc:93",
      netmask: "0xffffff00",
      broadcast: "192.168.60.255",
      isDefaultRoute: true,
      source: "system",
      updatedAt: "2026-06-26 12:00:00",
      statusText: "默认出口网卡"
    });

    expect(rows).toContainEqual({
      name: "Local IP",
      value: "192.168.60.211",
      description: "当前系统默认出口网卡的本机 IPv4 地址"
    });
    expect(rows).toContainEqual({
      name: "Connection",
      value: "Wi-Fi",
      description: "Wi-Fi、有线或未识别网卡类型"
    });
    expect(rows).toContainEqual({
      name: "Route",
      value: "Default",
      description: "默认出口网卡"
    });
  });
});
