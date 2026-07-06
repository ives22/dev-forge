export type PortProtocol = "TCP" | "UDP";
export type PortStatus = "LISTEN" | "BOUND" | "ESTABLISHED";
export type PortGroup = "system" | "database" | "dev" | "app";

export interface PortEntry {
  port: number;
  protocol: PortProtocol;
  address: string;
  status: PortStatus;
  pid: number;
  process: string;
  group: PortGroup;
}

export type PortSortKey = "port" | "protocol" | "address" | "status" | "pid" | "process";
export type PortFilterValue<T extends string> = T | "ALL";

export interface PortFilterOptions {
  keyword: string;
  protocol: PortFilterValue<PortProtocol>;
  status: PortFilterValue<PortStatus>;
  listenOnly: boolean;
  localOnly: boolean;
  sortKey: PortSortKey;
  sortDir: 1 | -1;
}

export const portSamples: PortEntry[] = [
  { port: 53, protocol: "UDP", address: "*", status: "BOUND", pid: 391, process: "mDNSResponder", group: "system" },
  { port: 80, protocol: "TCP", address: "0.0.0.0", status: "LISTEN", pid: 612, process: "nginx", group: "system" },
  { port: 443, protocol: "TCP", address: "0.0.0.0", status: "LISTEN", pid: 612, process: "nginx", group: "system" },
  { port: 5000, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 812, process: "ControlCenter", group: "system" },
  { port: 5173, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 42841, process: "vite", group: "dev" },
  { port: 1420, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 42841, process: "vite", group: "dev" },
  { port: 3000, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 38214, process: "node", group: "dev" },
  { port: 3306, protocol: "TCP", address: "0.0.0.0", status: "LISTEN", pid: 2486, process: "mysqld", group: "database" },
  { port: 5432, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 5190, process: "postgres", group: "database" },
  { port: 6379, protocol: "TCP", address: "127.0.0.1", status: "LISTEN", pid: 6043, process: "redis-server", group: "database" },
  { port: 8080, protocol: "TCP", address: "::1", status: "LISTEN", pid: 33801, process: "java", group: "dev" },
  { port: 62078, protocol: "TCP", address: "192.168.31.12", status: "ESTABLISHED", pid: 881, process: "rapportd", group: "system" }
];

export const defaultPortFilterOptions: PortFilterOptions = {
  keyword: "",
  protocol: "ALL",
  status: "ALL",
  listenOnly: true,
  localOnly: false,
  sortKey: "port",
  sortDir: 1
};

export function isLocalAddress(address: string): boolean {
  return ["127.0.0.1", "::1", "localhost"].includes(address);
}

function compareValue(row: PortEntry, key: PortSortKey): string | number {
  if (key === "port" || key === "pid") return Number(row[key]);
  return String(row[key]).toLowerCase();
}

export function filterPorts(rows: PortEntry[], options: PortFilterOptions): PortEntry[] {
  const keyword = options.keyword.trim().toLowerCase();
  return rows
    .filter((row) => options.protocol === "ALL" || row.protocol === options.protocol)
    .filter((row) => options.status === "ALL" || row.status === options.status)
    .filter((row) => !options.listenOnly || row.status === "LISTEN" || row.status === "BOUND")
    .filter((row) => !options.localOnly || isLocalAddress(row.address))
    .filter((row) => {
      if (!keyword) return true;
      return [row.port, row.protocol, row.address, row.status, row.pid, row.process].some((value) => String(value).toLowerCase().includes(keyword));
    })
    .sort((a, b) => {
      const av = compareValue(a, options.sortKey);
      const bv = compareValue(b, options.sortKey);
      if (av > bv) return options.sortDir;
      if (av < bv) return -options.sortDir;
      return a.port - b.port;
    });
}

export function portMetrics(rows: PortEntry[]) {
  return {
    listen: rows.filter((row) => row.status === "LISTEN" || row.status === "BOUND").length,
    tcp: rows.filter((row) => row.protocol === "TCP").length,
    process: new Set(rows.map((row) => row.pid)).size
  };
}

export function summarizeProcesses(rows: PortEntry[], limit = 6): Array<{ process: string; count: number }> {
  const summary = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.process] = (acc[row.process] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(summary)
    .map(([process, count]) => ({ process, count }))
    .sort((a, b) => b.count - a.count || a.process.localeCompare(b.process, "zh-CN"))
    .slice(0, limit);
}

export function portsToTsv(rows: PortEntry[]): string {
  return rows.map((row) => [row.port, row.protocol, row.address, row.status, row.pid, row.process].join("\t")).join("\n");
}
