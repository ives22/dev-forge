import { AppWindow, Box, Search } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApplicationIconDataUrl, listApplications } from "../lib/desktop";
import {
  buildLauncherResults,
  groupLauncherResults,
  launcherShortcutLabel,
  type ApplicationEntry,
  type LauncherResult
} from "../lib/launcher";
import { runnableTools, tools, type ToolDefinition } from "../lib/toolRegistry";

export function CommandPalette({
  embedded = false,
  focusRequest = 0,
  open,
  onClose,
  onPickApplication,
  onPickTool
}: {
  embedded?: boolean;
  focusRequest?: number;
  open: boolean;
  onClose: () => void;
  onPickApplication?: (application: ApplicationEntry) => void | Promise<void>;
  onPickTool: (tool: ToolDefinition) => void;
}) {
  const [query, setQuery] = useState("");
  const [applications, setApplications] = useState<ApplicationEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusTimersRef = useRef<number[]>([]);

  const clearScheduledFocus = useCallback(() => {
    focusTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    focusTimersRef.current = [];
  }, []);

  const scheduleInputFocus = useCallback(() => {
    clearScheduledFocus();
    focusTimersRef.current = [0, 16, 50, 120, 240, 360].map((delay) =>
      window.setTimeout(() => {
        const input = inputRef.current;
        if (!input) return;
        const activeElement = document.activeElement;
        const activeElementIsPaletteControl =
          activeElement instanceof HTMLElement &&
          activeElement !== input &&
          activeElement.closest(".palette") !== null &&
          activeElement !== document.body;
        if (activeElement !== input && !activeElementIsPaletteControl) {
          input.focus({ preventScroll: true });
        }
        if (document.activeElement === input) {
          clearScheduledFocus();
        }
      }, delay)
    );
  }, [clearScheduledFocus]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    } else {
      clearScheduledFocus();
    }
  }, [clearScheduledFocus, open]);

  useEffect(() => {
    if (open) scheduleInputFocus();
  }, [focusRequest, open, scheduleInputFocus]);

  useEffect(() => () => clearScheduledFocus(), [clearScheduledFocus]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void listApplications(query).then((items) => {
        if (!cancelled) setApplications(items);
      });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return undefined;
    const focusLauncher = () => {
      scheduleInputFocus();
    };
    window.addEventListener("devforge:focus-launcher", focusLauncher);
    return () => window.removeEventListener("devforge:focus-launcher", focusLauncher);
  }, [open, scheduleInputFocus]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const results = useMemo(() => {
    const candidates = [tools[0], ...runnableTools];
    return buildLauncherResults({ applications, query, tools: candidates });
  }, [applications, query]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const groupedResults = useMemo(() => groupLauncherResults(results), [results]);
  const displayedResults = useMemo(
    () => [...groupedResults.tools, ...groupedResults.applications],
    [groupedResults.applications, groupedResults.tools]
  );

  const pickResult = (result: LauncherResult | undefined) => {
    if (!result) return;
    if (result.type === "tool") {
      onPickTool(result.tool);
      onClose();
      return;
    }
    if (onPickApplication) {
      void Promise.resolve(onPickApplication(result.application)).finally(onClose);
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, Math.max(displayedResults.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      pickResult(displayedResults[selectedIndex]);
    }
  };

  if (!open) return null;

  const content = (
    <div className={`palette ${embedded ? "launcher-palette" : ""}`} role="dialog" aria-label="命令面板" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="搜索工具、命令或应用..."
          />
          <kbd>{launcherShortcutLabel}</kbd>
        </div>
        <div className="palette-list">
          {results.length === 0 ? (
            <div className="palette-empty" role="status">
              <Box size={18} />
              <span>没有匹配的工具或应用</span>
            </div>
          ) : null}
          <PaletteSection
            label="小工具"
            results={groupedResults.tools}
            allResults={displayedResults}
            selectedIndex={selectedIndex}
            onPick={pickResult}
          />
          <PaletteSection
            label="应用"
            results={groupedResults.applications}
            allResults={displayedResults}
            selectedIndex={selectedIndex}
            onPick={pickResult}
          />
        </div>
        <div className="palette-footer">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
  );

  if (embedded) return content;

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      {content}
    </div>
  );
}

function PaletteSection({
  allResults,
  label,
  onPick,
  results,
  selectedIndex
}: {
  allResults: LauncherResult[];
  label: string;
  onPick: (result: LauncherResult) => void;
  results: LauncherResult[];
  selectedIndex: number;
}) {
  if (results.length === 0) return null;

  return (
    <section className="palette-section" aria-label={label}>
      <div className="palette-section-label">{label}</div>
      {results.map((result) => {
        const flatIndex = allResults.findIndex((item) => item.id === result.id);
        const active = flatIndex === selectedIndex;
        const Icon = result.type === "tool" ? result.tool.icon : AppWindow;
        const iconClass = result.type === "tool" ? `accent-${result.tool.accent}` : "accent-slate";

        return (
          <button
            key={result.id}
            className={`palette-row ${active ? "active" : ""}`}
            type="button"
            onClick={() => onPick(result)}
          >
            {result.type === "application" ? (
              <ApplicationIcon application={result.application} />
            ) : (
              <span className={`palette-icon ${iconClass}`}>
                <Icon size={17} />
              </span>
            )}
            <span>
              <strong>{result.title}</strong>
              <small>{result.subtitle}</small>
            </span>
            {result.type === "tool" && result.shortcut ? <code>{result.shortcut}</code> : null}
          </button>
        );
      })}
    </section>
  );
}

function ApplicationIcon({ application }: { application: ApplicationEntry }) {
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!application.iconPath) {
      setIconDataUrl(null);
      return undefined;
    }
    let cancelled = false;
    void getApplicationIconDataUrl(application.iconPath).then((dataUrl) => {
      if (!cancelled) setIconDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setIconDataUrl(null);
    });
    return () => {
      cancelled = true;
    };
  }, [application.iconPath]);

  if (iconDataUrl) {
    return (
      <span className="palette-icon palette-app-icon">
        <img src={iconDataUrl} alt="" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="palette-icon accent-slate">
      <AppWindow size={17} />
    </span>
  );
}
