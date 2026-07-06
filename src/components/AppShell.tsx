import {
  Braces,
  Database,
  FileCode2,
  FileType,
  GitCompare,
  Globe2,
  Key,
  KeyRound,
  KeySquare,
  Languages,
  LogIn,
  Moon,
  MoreHorizontal,
  Palette,
  Regex,
  Search,
  Server,
  Star,
  Sun,
  Type,
  Wifi
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { startWindowDragging } from "../lib/desktop";
import { findToolByRoute, tools } from "../lib/toolRegistry";
import { PageStatusStrip } from "./PageStatusStrip";
import type { ThemeMode } from "../hooks/useTheme";
import type { PageChromeMetric } from "../hooks/usePageChrome";
import type { ToolId } from "../lib/toolRegistry";

type SidebarNavItem = {
  label: string;
  id?: ToolId;
  muted?: boolean;
  icon?: LucideIcon;
};

const baseGroups: Array<{ label: string; items: SidebarNavItem[] }> = [
  {
    label: "工作台",
    items: [{ label: "工作台", id: "dashboard" as ToolId }]
  },
  {
    label: "编码器",
    items: [
      { label: "Base64", id: "base64" as ToolId },
      { label: "URL 编码", id: "url" as ToolId },
      { label: "单位换算", id: "unit" as ToolId, icon: FileType },
      { label: "JSON 格式化", id: "json-yaml" as ToolId, icon: Braces }
    ]
  },
  {
    label: "生成器",
    items: [
      { label: "密码生成器", id: "password" as ToolId, icon: Key },
      { label: "身份验证器", id: "authenticator" as ToolId, icon: KeySquare },
      { label: "时间戳计算", id: "timestamp" as ToolId },
      { label: "占位文本", muted: true, icon: Type },
      { label: "配色方案", id: "palette" as ToolId, icon: Palette },
      { label: "SSH 密钥对", id: "ssh" as ToolId, icon: LogIn }
    ]
  },
  {
    label: "文本",
    items: [
      { label: "文本翻译", id: "translate" as ToolId, icon: Languages },
      { label: "正则测试", id: "regex" as ToolId, icon: Regex },
      { label: "JWT 解码器", id: "jwt" as ToolId, icon: KeyRound },
      { label: "差异对比", id: "diff" as ToolId, icon: GitCompare }
    ]
  },
  {
    label: "网络",
    items: [
      { label: "HTTP 客户端", muted: true, icon: Globe2 },
      { label: "网络带宽计算", id: "bandwidth" as ToolId },
      { label: "端口占用", id: "port" as ToolId, icon: Server },
      { label: "DNS 查询", id: "dns" as ToolId, icon: Wifi },
      { label: "IP 工具", id: "ip" as ToolId, icon: Globe2 }
    ]
  },
  {
    label: "数据库",
    items: [{ label: "SQL 格式化", id: "sql" as ToolId, icon: Database }]
  }
];

const contentClassByTool: Record<ToolId, string> = {
  dashboard: "base64-page dashboard-page",
  base64: "base64-page base64-tool-page",
  "json-yaml": "base64-page json-page",
  jwt: "base64-page jwt-page",
  password: "base64-page password-page",
  authenticator: "base64-page authenticator-page",
  palette: "base64-page palette-page",
  ssh: "base64-page ssh-page",
  regex: "base64-page regex-page",
  sql: "base64-page sql-page",
  url: "base64-page url-page",
  timestamp: "base64-page timestamp-page",
  unit: "base64-page unit-page",
  bandwidth: "base64-page bandwidth-page",
  port: "base64-page port-page",
  dns: "base64-page dns-page",
  ip: "base64-page ip-page",
  diff: "base64-page diff-page",
  translate: "base64-page translate-page"
};

export function AppShell({
  children,
  theme,
  onToggleTheme,
  onOpenPalette,
  favoriteToolIds,
  favoriteToolIdSet,
  hotToolId,
  activeToolIsFavorite,
  onToggleActiveToolFavorite,
  onSetToolFavorite,
  titlebarSupplement,
  pageMetrics
}: {
  children: ReactNode;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  favoriteToolIds: ToolId[];
  favoriteToolIdSet: Set<ToolId>;
  hotToolId?: ToolId;
  activeToolIsFavorite: boolean;
  onToggleActiveToolFavorite: () => void;
  onSetToolFavorite: (toolId: ToolId, shouldFavorite: boolean) => void;
  titlebarSupplement?: ReactNode;
  pageMetrics?: PageChromeMetric[];
}) {
  const location = useLocation();
  const activeTool = findToolByRoute(location.pathname);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; toolId: ToolId } | null>(null);
  const groups = useMemo(() => {
    const favoriteItems: SidebarNavItem[] = favoriteToolIds.flatMap((toolId) => {
      const tool = tools.find((candidate) => candidate.id === toolId);
      return tool ? [{ label: tool.shortTitle, id: tool.id }] : [];
    });

    if (favoriteItems.length === 0) return baseGroups;
    return [{ label: "收藏", items: favoriteItems }, ...baseGroups];
  }, [favoriteToolIds]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, [contextMenu]);

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenPalette();
    }
  };

  const handleTitlebarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, select, a, [data-no-window-drag]")) return;
    void startWindowDragging().catch(() => undefined);
  };

  const openToolContextMenu = (event: React.MouseEvent, toolId: ToolId) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, toolId });
  };

  const contextTool = contextMenu ? tools.find((tool) => tool.id === contextMenu.toolId) : undefined;
  const contextToolIsFavorite = contextMenu ? favoriteToolIdSet.has(contextMenu.toolId) : false;

  return (
    <div className="window">
      <div className="titlebar" onMouseDown={handleTitlebarMouseDown} onDoubleClick={(event) => event.preventDefault()}>
        {titlebarSupplement ? <div className="titlebar-leading titlebar-supplement">{titlebarSupplement}</div> : null}
        <div className="titlebar-drag-zone" />
        <div className="titlebar-actions" data-no-window-drag>
          <button
            className={`theme-toggle favorite-toggle ${activeToolIsFavorite ? "active" : ""}`}
            type="button"
            onClick={onToggleActiveToolFavorite}
            aria-label={activeToolIsFavorite ? "取消收藏当前页面" : "收藏当前页面"}
            title={activeToolIsFavorite ? "取消收藏当前页面" : "收藏当前页面"}
          >
            <Star size={15} fill={activeToolIsFavorite ? "currentColor" : "none"} />
          </button>
          <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label="切换主题">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <MoreHorizontal className="titlebar-more" size={16} aria-hidden="true" />
        </div>
      </div>

      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-search" role="button" tabIndex={0} onClick={onOpenPalette} onKeyDown={handleSearchKeyDown}>
              <Search size={14} />
              <input readOnly aria-label="搜索工具" placeholder="搜索工具... ⌘K / ⌥Space" />
            </div>
          </div>
          {groups.map((group) => (
            <div className="sidebar-section" key={group.label}>
              <div className="sidebar-label">{group.label}</div>
              {group.items.map((item) => {
                const tool = item.id ? tools.find((candidate) => candidate.id === item.id) : undefined;
                const Icon = tool?.icon ?? item.icon ?? FileCode2;
                if (!tool || item.muted) {
                  return (
                    <div className="sidebar-item muted" key={item.label}>
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </div>
                  );
                }
                return (
                  <NavLink
                    key={tool.id}
                    to={tool.route}
                    className={({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`}
                    onContextMenu={(event) => openToolContextMenu(event, tool.id)}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {tool.id === hotToolId ? <span className="sidebar-badge">热门</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="sidebar-footer">
            <span className="status-dot" />
            <span>DevForge v0.1.0</span>
          </div>
        </aside>
        <main className={`content ${contentClassByTool[activeTool.id]}`}>{children}</main>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-left">
          <span className="bottom-item">
            <span className="status-dot tiny" />
            就绪
          </span>
          <span className="bottom-item">UTF-8</span>
          <span className="bottom-item">剪贴板：已同步</span>
        </div>
        <div className="bottom-bar-right">
          <PageStatusStrip metrics={pageMetrics ?? []} />
          <span className="bottom-item">CPU 2.1%</span>
          <span className="bottom-item">MEM 48MB</span>
          <span className="bottom-item">v0.1.0</span>
        </div>
      </div>
      {contextMenu && contextTool ? (
        <div
          className="sidebar-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label={`${contextTool.shortTitle} 操作`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSetToolFavorite(contextMenu.toolId, !contextToolIsFavorite);
              setContextMenu(null);
            }}
          >
            <Star size={14} fill={contextToolIsFavorite ? "currentColor" : "none"} />
            <span>{contextToolIsFavorite ? "取消收藏" : "添加到收藏"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
