import { beforeEach, describe, expect, it, vi } from "vitest";
import { launcherAccelerator } from "./launcher";

const invoke = vi.fn();
const isRegistered = vi.fn(async () => false);
const register = vi.fn(async () => undefined);

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readText: vi.fn(), writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));
vi.mock("@tauri-apps/plugin-global-shortcut", () => ({ isRegistered, register }));

describe("desktop launcher shortcut", () => {
  beforeEach(() => {
    invoke.mockReset();
    isRegistered.mockClear();
    register.mockClear();
    vi.resetModules();
  });

  it("registers Option+Space for the global launcher", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    const { registerGlobalCommandShortcut } = await import("./desktop");

    await expect(registerGlobalCommandShortcut()).resolves.toBe(true);

    expect(isRegistered).toHaveBeenCalledWith(launcherAccelerator);
    expect(register).toHaveBeenCalledWith(launcherAccelerator, expect.any(Function));
    const [, callback] = register.mock.calls[0] as unknown as [string, () => void];
    callback();
    expect(invoke).toHaveBeenCalledWith("show_launcher");
    expect(dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "devforge:open-command-palette" }));
  });

  it("returns null for screen selection outside Tauri", async () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    const { captureScreenSelection } = await import("./desktop");

    await expect(captureScreenSelection()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("captures a selected screen area in Tauri", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    invoke.mockResolvedValueOnce("data:image/png;base64,abc");
    const { captureScreenSelection } = await import("./desktop");

    await expect(captureScreenSelection()).resolves.toBe("data:image/png;base64,abc");
    expect(invoke).toHaveBeenCalledWith("capture_screen_selection");
  });

  it("returns an unavailable local IP outside Tauri", async () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    const { getLocalNetworkIp } = await import("./desktop");

    await expect(getLocalNetworkIp()).resolves.toMatchObject({
      ip: "--",
      connectionType: "unavailable",
      statusText: "桌面端可用"
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads the local network IP in Tauri", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    invoke.mockResolvedValueOnce({
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
    const { getLocalNetworkIp } = await import("./desktop");

    await expect(getLocalNetworkIp()).resolves.toMatchObject({
      ip: "192.168.60.211",
      connectionType: "wifi",
      interfaceName: "en0"
    });
    expect(invoke).toHaveBeenCalledWith("get_local_network_ip");
  });
});
