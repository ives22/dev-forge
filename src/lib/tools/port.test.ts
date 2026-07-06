import { describe, expect, it } from "vitest";
import { defaultPortFilterOptions, filterPorts, portMetrics, portsToTsv, portSamples, summarizeProcesses, type PortEntry } from "./port";

const rows: PortEntry[] = [
  { port: 3000, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 10, process: "node", group: "dev" },
  { port: 6379, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 11, process: "redis-server", group: "database" },
  { port: 53, protocol: "UDP", address: "*", status: "BOUND", pid: 12, process: "mDNSResponder", group: "system" },
  { port: 62078, protocol: "TCP", address: "192.168.31.12", status: "ESTABLISHED", pid: 13, process: "rapportd", group: "system" }
];

describe("port tools", () => {
  it("hides established connections when listenOnly is enabled", () => {
    const result = filterPorts(rows, defaultPortFilterOptions);
    expect(result.map((row) => row.port)).toEqual([53, 3000, 6379]);
  });

  it("filters by protocol, status, local address, and keyword", () => {
    const protocol = filterPorts(rows, { ...defaultPortFilterOptions, protocol: "UDP" });
    expect(protocol).toHaveLength(1);
    expect(protocol[0].process).toBe("mDNSResponder");

    const status = filterPorts(rows, { ...defaultPortFilterOptions, status: "LISTEN" });
    expect(status.map((row) => row.port)).toEqual([3000, 6379]);

    const local = filterPorts(rows, { ...defaultPortFilterOptions, localOnly: true });
    expect(local.map((row) => row.address)).toEqual(["127.0.0.1", "127.0.0.1"]);

    const keyword = filterPorts(rows, { ...defaultPortFilterOptions, keyword: "redis" });
    expect(keyword.map((row) => row.port)).toEqual([6379]);
  });

  it("sorts numeric and text columns", () => {
    const byPidDesc = filterPorts(rows, { ...defaultPortFilterOptions, listenOnly: false, sortKey: "pid", sortDir: -1 });
    expect(byPidDesc.map((row) => row.pid)).toEqual([13, 12, 11, 10]);

    const byProcess = filterPorts(rows, { ...defaultPortFilterOptions, listenOnly: false, sortKey: "process", sortDir: 1 });
    expect(byProcess.map((row) => row.process)).toEqual(["mDNSResponder", "node", "rapportd", "redis-server"]);
  });

  it("builds metrics, process summary, and TSV exports", () => {
    const visible = filterPorts(portSamples, defaultPortFilterOptions);
    expect(portMetrics(visible)).toMatchObject({ listen: 11, tcp: 10, process: 9 });
    expect(summarizeProcesses(visible)[0]).toMatchObject({ process: "nginx", count: 2 });
    expect(portsToTsv(rows.slice(0, 1))).toBe("3000\tTCP\t127.0.0.1\tLISTEN\t10\tnode");
  });
});
