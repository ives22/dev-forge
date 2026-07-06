import {
  Braces,
  Clock3,
  Database,
  Gauge,
  Globe2,
  Grid2X2,
  GitCompare,
  KeySquare,
  Key,
  KeyRound,
  Languages,
  Link2,
  Lock,
  LogIn,
  Palette,
  Regex,
  Server,
  Wifi,
  type LucideIcon
} from "lucide-react";

export type ToolId =
  | "dashboard"
  | "base64"
  | "json-yaml"
  | "jwt"
  | "password"
  | "authenticator"
  | "palette"
  | "ssh"
  | "regex"
  | "sql"
  | "url"
  | "timestamp"
  | "unit"
  | "bandwidth"
  | "port"
  | "dns"
  | "ip"
  | "diff"
  | "translate";

export type ToolCategory = "workspace" | "encoder" | "data" | "security" | "network" | "calculator" | "database";

export interface ToolDefinition {
  id: ToolId;
  title: string;
  shortTitle: string;
  description: string;
  route: string;
  shortcut?: string;
  category: ToolCategory;
  searchAliases?: string[];
  icon: LucideIcon;
  accent: "blue" | "cyan" | "green" | "amber" | "rose" | "violet" | "slate";
}

export const tools: ToolDefinition[] = [
  {
    id: "dashboard",
    title: "工作台",
    shortTitle: "工作台",
    description: "快速启动工具、查看最近活动和剪贴板类型。",
    route: "/",
    shortcut: "⌘K",
    category: "workspace",
    searchAliases: ["gongzuotai", "gong zuo tai"],
    icon: Grid2X2,
    accent: "blue"
  },
  {
    id: "base64",
    title: "Base64 编解码",
    shortTitle: "Base64",
    description: "文本、Data URI 与文件片段快速转换。",
    route: "/tools/base64",
    shortcut: "⌘⇧B",
    category: "encoder",
    searchAliases: ["bianjiema", "bian jie ma"],
    icon: Lock,
    accent: "green"
  },
  {
    id: "json-yaml",
    title: "JSON / YAML 格式化",
    shortTitle: "JSON / YAML",
    description: "格式化、压缩、校验与结构预览。",
    route: "/tools/json-yaml",
    shortcut: "⌘⇧J",
    category: "data",
    searchAliases: ["geshihua", "ge shi hua"],
    icon: Braces,
    accent: "cyan"
  },
  {
    id: "jwt",
    title: "JWT 编解码",
    shortTitle: "JWT",
    description: "Header、Payload、Claims 与 HMAC 签名校验。",
    route: "/tools/jwt",
    shortcut: "⌘⇧W",
    category: "security",
    searchAliases: ["bianjiema", "bian jie ma", "qianming", "qian ming"],
    icon: KeyRound,
    accent: "rose"
  },
  {
    id: "password",
    title: "密码生成器",
    shortTitle: "密码",
    description: "生成密码、UUID v4 与 NanoID。",
    route: "/tools/password",
    shortcut: "⌘⇧G",
    category: "security",
    searchAliases: ["mimashengchengqi", "mi ma sheng cheng qi", "mima", "shengcheng"],
    icon: Key,
    accent: "green"
  },
  {
    id: "authenticator",
    title: "身份验证器",
    shortTitle: "2FA",
    description: "管理 TOTP 账号、生成动态验证码并本地加密保存。",
    route: "/tools/authenticator",
    shortcut: "⌘⇧A",
    category: "security",
    searchAliases: ["shenfenyanzhengqi", "shen fen yan zheng qi", "yanzheng", "yan zheng", "yanzhengma", "yan zheng ma", "dongtaiyanzhengma"],
    icon: KeySquare,
    accent: "violet"
  },
  {
    id: "palette",
    title: "配色方案",
    shortTitle: "配色",
    description: "生成色板、HEX 列表、CSS 变量与可读文本色。",
    route: "/tools/palette",
    shortcut: "⌘⇧C",
    category: "data",
    searchAliases: ["peisefangan", "pei se fang an", "peise", "seban"],
    icon: Palette,
    accent: "rose"
  },
  {
    id: "ssh",
    title: "SSH 密钥对",
    shortTitle: "SSH",
    description: "生成 RSA、ECDSA 密钥对、公钥与指纹。",
    route: "/tools/ssh",
    shortcut: "⌘⇧H",
    category: "security",
    searchAliases: ["miyaodui", "mi yao dui", "miyao", "gongyao", "zhiwen"],
    icon: LogIn,
    accent: "cyan"
  },
  {
    id: "regex",
    title: "正则测试",
    shortTitle: "正则",
    description: "表达式、Flags、捕获分组与替换预览。",
    route: "/tools/regex",
    shortcut: "⌘⇧R",
    category: "data",
    searchAliases: ["zhengzeceshi", "zheng ze ce shi", "zhengze", "ceshi"],
    icon: Regex,
    accent: "green"
  },
  {
    id: "sql",
    title: "SQL 格式化",
    shortTitle: "SQL",
    description: "SQL 方言、缩进、结构摘要与风险检查。",
    route: "/tools/sql",
    shortcut: "⌘⇧S",
    category: "database",
    searchAliases: ["geshihua", "ge shi hua"],
    icon: Database,
    accent: "green"
  },
  {
    id: "url",
    title: "URL 编码",
    shortTitle: "URL",
    description: "Encode、Decode 和 Query 参数解析。",
    route: "/tools/url",
    shortcut: "⌘⇧U",
    category: "encoder",
    searchAliases: ["bianma", "bian ma", "jiema", "jie ma"],
    icon: Link2,
    accent: "blue"
  },
  {
    id: "timestamp",
    title: "时间戳计算",
    shortTitle: "时间戳",
    description: "Unix、毫秒、ISO 和时区时间互转。",
    route: "/tools/timestamp",
    shortcut: "⌘⇧T",
    category: "calculator",
    searchAliases: ["shijianchuojisuan", "shi jian chuo ji suan", "shijianchuo", "shijian"],
    icon: Clock3,
    accent: "amber"
  },
  {
    id: "unit",
    title: "单位换算",
    shortTitle: "单位",
    description: "存储、时间、速度、长度、面积和进制转换。",
    route: "/tools/unit",
    shortcut: "⌘⇧I",
    category: "calculator",
    searchAliases: ["danweihuansuan", "dan wei huan suan", "danwei", "huansuan"],
    icon: Gauge,
    accent: "violet"
  },
  {
    id: "bandwidth",
    title: "网络带宽计算",
    shortTitle: "带宽",
    description: "文件大小、带宽、效率、耗时和吞吐换算。",
    route: "/tools/bandwidth",
    shortcut: "⌘⇧N",
    category: "network",
    searchAliases: ["wangluodaikuanjisuan", "wang luo dai kuan ji suan", "daikuan", "tun tu"],
    icon: Gauge,
    accent: "slate"
  },
  {
    id: "port",
    title: "端口占用",
    shortTitle: "端口",
    description: "监听端口、进程与 PID 排查。",
    route: "/tools/port",
    shortcut: "⌘⇧P",
    category: "network",
    searchAliases: ["duankouzhanyong", "duan kou zhan yong", "duankou"],
    icon: Server,
    accent: "cyan"
  },
  {
    id: "dns",
    title: "DNS 查询",
    shortTitle: "DNS",
    description: "A、AAAA、CNAME、MX 与 TXT 解析。",
    route: "/tools/dns",
    shortcut: "⌘⇧L",
    category: "network",
    searchAliases: ["chaxun", "cha xun", "jiexi", "jie xi"],
    icon: Wifi,
    accent: "cyan"
  },
  {
    id: "ip",
    title: "IP 工具",
    shortTitle: "IP",
    description: "公网出口 IP、地理信息与 IPv4 子网计算。",
    route: "/tools/ip",
    shortcut: "⌘⇧O",
    category: "network",
    searchAliases: ["gongju", "gong ju", "gongwang", "gong wang", "ziwang"],
    icon: Globe2,
    accent: "blue"
  },
  {
    id: "diff",
    title: "差异对比",
    shortTitle: "差异",
    description: "文本、JSON 与配置文件差异对比。",
    route: "/tools/diff",
    shortcut: "⌘⇧D",
    category: "data",
    searchAliases: ["chayiduibi", "cha yi dui bi", "chayi", "duibi"],
    icon: GitCompare,
    accent: "cyan"
  },
  {
    id: "translate",
    title: "文本翻译",
    shortTitle: "翻译",
    description: "免配置短文本翻译，支持自带免费额度 Key。",
    route: "/tools/translate",
    shortcut: "⌘⇧M",
    category: "data",
    searchAliases: ["wenbenfanyi", "wen ben fan yi", "fanyi", "wenben"],
    icon: Languages,
    accent: "blue"
  }
];

export const runnableTools = tools.filter((tool) => tool.id !== "dashboard");

export const toolById = Object.fromEntries(tools.map((tool) => [tool.id, tool])) as Record<ToolId, ToolDefinition>;

export function findToolByRoute(pathname: string): ToolDefinition {
  return tools.find((tool) => tool.route === pathname) ?? toolById.dashboard;
}
