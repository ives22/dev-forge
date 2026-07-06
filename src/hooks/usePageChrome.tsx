import { createContext, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { ToolDefinition } from "../lib/toolRegistry";
import type { ToolId } from "../lib/toolRegistry";

export type PageChromeMetric = {
  label: string;
  value: ReactNode;
  compact?: boolean;
};

export type PageChromeConfig = {
  tool: ToolDefinition;
  kicker?: ReactNode;
  metrics?: PageChromeMetric[];
};

const PageChromeStateContext = createContext<PageChromeConfig | null>(null);
const PageChromeSetterContext = createContext<Dispatch<SetStateAction<PageChromeConfig | null>> | null>(null);
const ActiveToolContext = createContext<ToolId | null>(null);

function getChromeSignature(config: PageChromeConfig) {
  return `${config.tool.id}|${String(config.kicker ?? "")}|${config.metrics?.map((metric) => `${metric.label}:${String(metric.value)}`).join("|") ?? ""}`;
}

export function PageChromeProvider({ children, activeToolId = null }: { children: ReactNode; activeToolId?: ToolId | null }) {
  const [chrome, setChrome] = useState<PageChromeConfig | null>(null);

  return (
    <ActiveToolContext.Provider value={activeToolId}>
      <PageChromeSetterContext.Provider value={setChrome}>
        <PageChromeStateContext.Provider value={chrome}>{children}</PageChromeStateContext.Provider>
      </PageChromeSetterContext.Provider>
    </ActiveToolContext.Provider>
  );
}

export function usePageChrome(config: PageChromeConfig) {
  const setChrome = useContext(PageChromeSetterContext);
  const activeToolId = useContext(ActiveToolContext);
  if (!setChrome) {
    throw new Error("usePageChrome must be used within PageChromeProvider");
  }
  const signature = getChromeSignature(config);

  useEffect(() => {
    if (activeToolId !== null && activeToolId !== config.tool.id) return undefined;
    setChrome(config);
    return () => setChrome(null);
  }, [activeToolId, config.tool.id, setChrome, signature]);
}

export function useCurrentPageChrome() {
  return useContext(PageChromeStateContext);
}
