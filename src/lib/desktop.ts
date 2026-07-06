import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { isRegistered, register } from "@tauri-apps/plugin-global-shortcut";
import { portSamples, type PortEntry } from "./tools/port";
import { lookupDnsOverHttps, type DnsLookupResult, type DnsRecordType } from "./tools/dns";
import { evaluateRegex, type RegexOptions, type RegexResult } from "./tools/regex";
import { unavailableLocalNetworkIpInfo, type LocalNetworkIpInfo } from "./tools/ip";
import { translateText, type TranslateOptions, type TranslateRequest, type TranslateResult } from "./tools/translate";
import type { ToolId } from "./toolRegistry";
import { launcherAccelerator, type ApplicationEntry } from "./launcher";

export function runningInTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function copyText(value: string): Promise<void> {
  if (runningInTauri()) {
    await writeText(value);
    return;
  }
  await navigator.clipboard?.writeText(value);
}

export async function readClipboardText(): Promise<string> {
  if (runningInTauri()) return readText();
  return navigator.clipboard?.readText?.() ?? "";
}

export async function saveTextFile(defaultPath: string, value: string): Promise<boolean> {
  if (!runningInTauri()) {
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultPath;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const path = await save({ defaultPath, filters: [{ name: "Text", extensions: ["txt", "json", "yaml", "yml"] }] });
  if (!path) return false;
  await writeTextFile(path, value);
  return true;
}

export async function registerGlobalCommandShortcut(): Promise<boolean> {
  if (!runningInTauri()) return false;
  const accelerator = launcherAccelerator;
  try {
    if (await isRegistered(accelerator)) return true;
    await register(accelerator, () => {
      void showLauncher();
    });
    return true;
  } catch {
    return false;
  }
}

export async function listenForDesktopEvents(handlers: {
  openCommandPalette: () => void;
  openTool: (toolId: ToolId) => void;
  focusLauncher?: () => void;
}): Promise<() => void> {
  if (!runningInTauri()) return () => undefined;
  const unlistenCommand = await listen("devforge://open-command-palette", handlers.openCommandPalette);
  const unlistenTool = await listen<string>("devforge://open-tool", (event) => handlers.openTool(event.payload as ToolId));
  const unlistenLauncher = handlers.focusLauncher
    ? await listen("devforge://focus-launcher", handlers.focusLauncher)
    : () => undefined;
  return () => {
    unlistenCommand();
    unlistenTool();
    unlistenLauncher();
  };
}

export async function emitCommandPalette(): Promise<void> {
  if (runningInTauri()) await invoke("emit_command_palette");
}

export async function showLauncher(): Promise<void> {
  if (runningInTauri()) await invoke("show_launcher");
}

export async function hideLauncher(): Promise<void> {
  if (runningInTauri()) await invoke("hide_launcher");
}

export async function openToolFromLauncher(toolId: ToolId): Promise<void> {
  if (runningInTauri()) {
    await invoke("open_tool_from_launcher", { toolId });
    return;
  }
  window.dispatchEvent(new CustomEvent("devforge:open-tool", { detail: toolId }));
}

export async function listApplications(query: string): Promise<ApplicationEntry[]> {
  if (!runningInTauri()) return [];
  const rows = await invoke<ApplicationEntry[]>("list_applications", { query });
  return Array.isArray(rows) ? rows : [];
}

export async function openApplication(path: string): Promise<void> {
  if (runningInTauri()) await invoke("open_application", { path });
}

export async function getApplicationIconDataUrl(path: string): Promise<string | null> {
  if (!runningInTauri()) return null;
  return invoke<string | null>("application_icon_data_url", { path });
}

export async function startWindowDragging(): Promise<void> {
  if (!runningInTauri()) return;
  await getCurrentWindow().startDragging();
}

export async function listPorts(): Promise<{ rows: PortEntry[]; source: "system" | "sample" }> {
  if (!runningInTauri()) return { rows: portSamples, source: "sample" };
  const rows = await invoke<PortEntry[]>("list_ports");
  return { rows, source: "system" };
}

export async function getLocalNetworkIp(): Promise<LocalNetworkIpInfo> {
  if (!runningInTauri()) return unavailableLocalNetworkIpInfo;
  return invoke<LocalNetworkIpInfo>("get_local_network_ip");
}

export async function lookupDns(domain: string, recordType: DnsRecordType): Promise<DnsLookupResult> {
  if (!runningInTauri()) return lookupDnsOverHttps(domain, recordType);
  return invoke<DnsLookupResult>("lookup_dns", { domain, recordType });
}

export async function evaluateRegexNative(options: RegexOptions): Promise<RegexResult> {
  if (!runningInTauri()) return evaluateRegex(options);
  return invoke<RegexResult>("evaluate_regex", { options });
}

export async function translateTextWithProvider(request: TranslateRequest, options?: TranslateOptions): Promise<TranslateResult> {
  return translateText(request, fetch, options);
}

export async function captureScreenSelection(): Promise<string | null> {
  if (!runningInTauri()) return null;
  return invoke<string | null>("capture_screen_selection");
}
