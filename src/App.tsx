import { useEffect, useMemo, useState } from "react";
import { HashRouter, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { CommandPalette } from "./components/CommandPalette";
import { PageChromeProvider, useCurrentPageChrome } from "./hooks/usePageChrome";
import { useTheme } from "./hooks/useTheme";
import { useUsage } from "./hooks/useUsage";
import {
  hideLauncher,
  listenForDesktopEvents,
  openApplication,
  openToolFromLauncher,
  registerGlobalCommandShortcut,
} from "./lib/desktop";
import { addFavoriteTool, listFavoriteTools, removeFavoriteTool } from "./lib/storage";
import { findToolByRoute, toolById, type ToolDefinition, type ToolId } from "./lib/toolRegistry";
import type { ApplicationEntry } from "./lib/launcher";
import { DashboardPage } from "./pages/DashboardPage";
import { Base64Page } from "./pages/Base64Page";
import { JsonYamlPage } from "./pages/JsonYamlPage";
import { JwtPage } from "./pages/JwtPage";
import { AuthenticatorPage } from "./pages/AuthenticatorPage";
import { PalettePage } from "./pages/PalettePage";
import { PasswordPage } from "./pages/PasswordPage";
import { SshKeyPage } from "./pages/SshKeyPage";
import { UrlPage } from "./pages/UrlPage";
import { TimestampPage } from "./pages/TimestampPage";
import { UnitPage } from "./pages/UnitPage";
import { BandwidthPage } from "./pages/BandwidthPage";
import { DiffPage } from "./pages/DiffPage";
import { PortPage } from "./pages/PortPage";
import { DnsPage } from "./pages/DnsPage";
import { IpPage } from "./pages/IpPage";
import { RegexPage } from "./pages/RegexPage";
import { SqlPage } from "./pages/SqlPage";
import { TranslatePage } from "./pages/TranslatePage";

function pickHotToolId(recentToolCounts: Array<{ tool_id: ToolId; count: number }>): ToolId | undefined {
  return recentToolCounts[0]?.count ? recentToolCounts[0].tool_id : undefined;
}

function RoutedApp() {
  const { theme, toggleTheme } = useTheme();
  const usageApi = useUsage();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutRegistered, setShortcutRegistered] = useState(false);
  const [favoriteToolIds, setFavoriteToolIds] = useState<ToolId[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const activeTool = findToolByRoute(location.pathname);
  const activeRoute = activeTool.route;
  const [visitedRoutes, setVisitedRoutes] = useState<Set<string>>(() => new Set([activeRoute]));
  const pageChrome = useCurrentPageChrome();
  const activeChrome = pageChrome?.tool.id === activeTool.id ? pageChrome : { tool: activeTool };

  const routePanels = useMemo(
    () => [
      {
        route: "/",
        element: (
          <DashboardPage
            usage={usageApi.usage}
            summary={usageApi.summary}
            favoriteToolIds={favoriteToolIds}
            shortcutRegistered={shortcutRegistered}
            onOpenPalette={() => setPaletteOpen(true)}
          />
        )
      },
      { route: "/tools/base64", element: <Base64Page recordUsage={usageApi.record} /> },
      { route: "/tools/json-yaml", element: <JsonYamlPage recordUsage={usageApi.record} /> },
      { route: "/tools/jwt", element: <JwtPage recordUsage={usageApi.record} /> },
      { route: "/tools/password", element: <PasswordPage recordUsage={usageApi.record} /> },
      { route: "/tools/authenticator", element: <AuthenticatorPage recordUsage={usageApi.record} /> },
      { route: "/tools/palette", element: <PalettePage recordUsage={usageApi.record} /> },
      { route: "/tools/ssh", element: <SshKeyPage recordUsage={usageApi.record} /> },
      { route: "/tools/regex", element: <RegexPage recordUsage={usageApi.record} /> },
      { route: "/tools/sql", element: <SqlPage recordUsage={usageApi.record} /> },
      { route: "/tools/url", element: <UrlPage recordUsage={usageApi.record} /> },
      { route: "/tools/timestamp", element: <TimestampPage recordUsage={usageApi.record} /> },
      { route: "/tools/unit", element: <UnitPage recordUsage={usageApi.record} /> },
      { route: "/tools/bandwidth", element: <BandwidthPage recordUsage={usageApi.record} /> },
      { route: "/tools/port", element: <PortPage recordUsage={usageApi.record} /> },
      { route: "/tools/dns", element: <DnsPage recordUsage={usageApi.record} /> },
      { route: "/tools/ip", element: <IpPage recordUsage={usageApi.record} /> },
      { route: "/tools/diff", element: <DiffPage recordUsage={usageApi.record} /> },
      { route: "/tools/translate", element: <TranslatePage recordUsage={usageApi.record} /> }
    ],
    [favoriteToolIds, shortcutRegistered, usageApi.record, usageApi.summary, usageApi.usage]
  );

  const openTool = (toolId: ToolId) => {
    navigate(toolById[toolId]?.route ?? "/");
  };

  const favoriteToolIdSet = useMemo(() => new Set(favoriteToolIds), [favoriteToolIds]);
  const hotToolId = useMemo(() => pickHotToolId(usageApi.summary.recentToolCounts), [usageApi.summary.recentToolCounts]);
  const activeToolIsFavorite = favoriteToolIdSet.has(activeTool.id);

  const setToolFavorite = async (toolId: ToolId, shouldFavorite: boolean) => {
    const previousFavoriteToolIds = favoriteToolIds;
    setFavoriteToolIds((current) => {
      const exists = current.includes(toolId);
      if (shouldFavorite) return exists ? current : [...current, toolId];
      return exists ? current.filter((favoriteToolId) => favoriteToolId !== toolId) : current;
    });

    try {
      if (shouldFavorite) {
        await addFavoriteTool(toolId);
      } else {
        await removeFavoriteTool(toolId);
      }
      setFavoriteToolIds(await listFavoriteTools());
    } catch {
      setFavoriteToolIds(previousFavoriteToolIds);
    }
  };

  const toggleActiveToolFavorite = () => {
    void setToolFavorite(activeTool.id, !activeToolIsFavorite);
  };

  useEffect(() => {
    const openCommandPalette = () => setPaletteOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      const shortcutMap: Record<string, ToolId> = {
        b: "base64",
        i: "unit",
        j: "json-yaml",
        w: "jwt",
        g: "password",
        a: "authenticator",
        c: "palette",
        h: "ssh",
        r: "regex",
        s: "sql",
        u: "url",
        t: "timestamp",
        n: "bandwidth",
        p: "port",
        l: "dns",
        o: "ip",
        d: "diff",
        m: "translate"
      };
      if (modifier && event.shiftKey) {
        const target = shortcutMap[event.key.toLowerCase()];
        if (target) {
          event.preventDefault();
          openTool(target);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("devforge:open-command-palette", openCommandPalette);
    void registerGlobalCommandShortcut().then(setShortcutRegistered);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("devforge:open-command-palette", openCommandPalette);
    };
  }, []);

  useEffect(() => {
    setVisitedRoutes((current) => (current.has(activeRoute) ? current : new Set(current).add(activeRoute)));
  }, [activeRoute]);

  useEffect(() => {
    void listenForDesktopEvents({
      openCommandPalette: () => setPaletteOpen(true),
      openTool
    });
  }, []);

  useEffect(() => {
    void listFavoriteTools().then(setFavoriteToolIds);
  }, []);

  const pickTool = (tool: ToolDefinition) => {
    navigate(tool.route);
  };

  const pickApplication = (application: ApplicationEntry) => {
    return openApplication(application.path);
  };

  const titlebarSupplement = (
    <>
      <span
        className="chrome-pill titlebar-page-chip"
        title={typeof activeChrome.kicker === "string" ? activeChrome.kicker : activeChrome.tool.description}
      >
        <span className="chrome-pill-value">{activeChrome.tool.shortTitle}</span>
      </span>
      {activeChrome.tool.shortcut ? (
        <span className="chrome-pill titlebar-shortcut-pill" aria-label={`${activeChrome.tool.shortTitle} 快捷键`}>
          <span className="chrome-pill-value">{activeChrome.tool.shortcut}</span>
        </span>
      ) : null}
    </>
  );

  return (
    <AppShell
      theme={theme}
      onToggleTheme={toggleTheme}
      onOpenPalette={() => setPaletteOpen(true)}
      favoriteToolIds={favoriteToolIds}
      favoriteToolIdSet={favoriteToolIdSet}
      hotToolId={hotToolId}
      activeToolIsFavorite={activeToolIsFavorite}
      onToggleActiveToolFavorite={toggleActiveToolFavorite}
      onSetToolFavorite={(toolId, shouldFavorite) => void setToolFavorite(toolId, shouldFavorite)}
      titlebarSupplement={titlebarSupplement}
      pageMetrics={activeChrome.metrics}
    >
      {routePanels.map((panel) =>
        visitedRoutes.has(panel.route) ? (
          <div className="route-cache-panel" hidden={panel.route !== activeRoute} key={panel.route}>
            {panel.element}
          </div>
        ) : null
      )}
      <CommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
          void hideLauncher();
        }}
        onPickApplication={pickApplication}
        onPickTool={pickTool}
      />
    </AppShell>
  );
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("window") === "launcher") {
    return <LauncherApp />;
  }

  return (
    <HashRouter>
      <PageChromeRouteProvider />
    </HashRouter>
  );
}

function LauncherApp() {
  useTheme({ persist: false });
  const [open, setOpen] = useState(true);
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    const focusLauncher = () => {
      setOpen(true);
      setFocusRequest((current) => current + 1);
    };
    window.addEventListener("devforge:focus-launcher", focusLauncher);
    void listenForDesktopEvents({
      openCommandPalette: focusLauncher,
      openTool: () => undefined,
      focusLauncher
    });
    return () => window.removeEventListener("devforge:focus-launcher", focusLauncher);
  }, []);

  const close = () => {
    setOpen(false);
    void hideLauncher();
  };

  const pickTool = (tool: ToolDefinition) => {
    void openToolFromLauncher(tool.id);
  };

  const pickApplication = (application: ApplicationEntry) => {
    return openApplication(application.path);
  };

  return (
    <div className="launcher-window">
      <CommandPalette
        embedded
        focusRequest={focusRequest}
        open={open}
        onClose={close}
        onPickApplication={pickApplication}
        onPickTool={pickTool}
      />
    </div>
  );
}

function PageChromeRouteProvider() {
  const location = useLocation();
  const activeTool = findToolByRoute(location.pathname);

  return (
    <PageChromeProvider activeToolId={activeTool.id}>
      <RoutedApp />
    </PageChromeProvider>
  );
}
