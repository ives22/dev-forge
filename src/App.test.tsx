import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { resetStorageFallbacksForTests } from "./lib/storage";

const mocks = vi.hoisted(() => {
  const savedFiles: Array<{ defaultPath: string; value: string }> = [];
  const clipboardWriteText = vi.fn(async (_value: string) => undefined);
  return {
    clipboardWriteText,
    copyText: vi.fn(async (value: string) => {
      await clipboardWriteText(value);
    }),
    captureScreenSelection: vi.fn(async () => null as string | null),
    getLocalNetworkIp: vi.fn(async () => ({
      ip: "192.168.60.211",
      interfaceName: "en0",
      connectionType: "wifi" as const,
      hardwarePort: "Wi-Fi",
      macAddress: "90:9b:6f:15:bc:93",
      netmask: "0xffffff00",
      broadcast: "192.168.60.255",
      isDefaultRoute: true,
      source: "system",
      updatedAt: "2026-06-26 12:00:00",
      statusText: "默认出口网卡"
    })),
    jsQrData: null as string | null,
    qrToDataURL: vi.fn(async () => "data:image/png;base64,qr"),
    savedFiles,
    saveTextFile: vi.fn(async (defaultPath: string, value: string) => {
      savedFiles.push({ defaultPath, value });
      return true;
    })
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readText: vi.fn(async () => "{}"), writeText: mocks.clipboardWriteText }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  isRegistered: vi.fn(async () => false),
  register: vi.fn(async () => undefined)
}));
vi.mock("jsqr", () => ({ default: vi.fn(() => (mocks.jsQrData ? { data: mocks.jsQrData } : null)) }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.qrToDataURL } }));
vi.mock("./lib/desktop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/desktop")>();
  return {
    ...actual,
    copyText: mocks.copyText,
    captureScreenSelection: mocks.captureScreenSelection,
    getLocalNetworkIp: mocks.getLocalNetworkIp,
    saveTextFile: mocks.saveTextFile
  };
});

function setupUser() {
  return userEvent.setup();
}

function mockTranslateFetch(translatedText = "Translated inside DevForge") {
  const fetchMock = vi.fn(async () =>
    Response.json({
      responseStatus: 200,
      responseData: {
        translatedText,
        match: 0.99
      }
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function originalTextPanel() {
  const panel = screen.getByText("原文").closest(".panel");
  if (!panel) throw new Error("Original text panel not found");
  return within(panel as HTMLElement);
}

const RealDate = Date;

function mockCurrentTime(iso: string) {
  const fixedTime = new RealDate(iso).getTime();

  class MockDate extends RealDate {
    constructor(...args: unknown[]) {
      switch (args.length) {
        case 0:
          super(fixedTime);
          break;
        case 1:
          super(args[0] as string | number | Date);
          break;
        case 2:
          super(args[0] as number, args[1] as number);
          break;
        case 3:
          super(args[0] as number, args[1] as number, args[2] as number);
          break;
        case 4:
          super(args[0] as number, args[1] as number, args[2] as number, args[3] as number);
          break;
        case 5:
          super(args[0] as number, args[1] as number, args[2] as number, args[3] as number, args[4] as number);
          break;
        case 6:
          super(args[0] as number, args[1] as number, args[2] as number, args[3] as number, args[4] as number, args[5] as number);
          break;
        default:
          super(
            args[0] as number,
            args[1] as number,
            args[2] as number,
            args[3] as number,
            args[4] as number,
            args[5] as number,
            args[6] as number
          );
      }
    }

    static now() {
      return fixedTime;
    }

    static parse = RealDate.parse;
    static UTC = RealDate.UTC;
  }

  vi.stubGlobal("Date", MockDate as unknown as DateConstructor);
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  mocks.savedFiles.splice(0);
  mocks.saveTextFile.mockReset();
  mocks.saveTextFile.mockImplementation(async (defaultPath: string, value: string) => {
    mocks.savedFiles.push({ defaultPath, value });
    return true;
  });
  mocks.captureScreenSelection.mockReset();
  mocks.captureScreenSelection.mockResolvedValue(null);
  mocks.getLocalNetworkIp.mockClear();
  mocks.copyText.mockClear();
  mocks.qrToDataURL.mockReset();
  mocks.qrToDataURL.mockResolvedValue("data:image/png;base64,qr");
  mocks.jsQrData = null;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn(async () => "{}"),
      writeText: mocks.clipboardWriteText
    }
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ip: "18.181.224.94",
        city: "Tokyo",
        region: "Tokyo",
        country: "JP",
        loc: "35.6895,139.6917",
        org: "AS16509 Amazon.com, Inc.",
        timezone: "Asia/Tokyo"
      })
    )
  );
});

afterEach(() => {
  resetStorageFallbacksForTests();
  mocks.clipboardWriteText.mockClear();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("App shell", () => {
  it("renders dashboard and navigates to Base64", async () => {
    const user = setupUser();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: /Base64/ })[0]);
    expect((await screen.findAllByText("输出")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /运行/ })).toBeInTheDocument();
  });

  it("navigates to the Translate tool", async () => {
    const user = setupUser();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /文本翻译/ }));

    expect(await screen.findByRole("region", { name: "文本翻译工具" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "翻译" })).toBeInTheDocument();
    expect(screen.getAllByText("MyMemory 公共接口").length).toBeGreaterThan(0);
  });

  it("saves a Translate provider key from the config dialog", async () => {
    const user = setupUser();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /文本翻译/ }));
    await screen.findByRole("region", { name: "文本翻译工具" });
    await user.click(screen.getByRole("button", { name: /Azure/ }));

    const dialog = await screen.findByRole("dialog", { name: "Azure Translator 配置" });
    await user.type(within(dialog).getByLabelText("Subscription Key"), "azure-test-key");
    await user.type(within(dialog).getByLabelText("Region"), "eastasia");
    await user.click(within(dialog).getByRole("button", { name: "保存配置" }));

    expect(await within(dialog).findByText("配置已保存")).toBeInTheDocument();
    expect(within(dialog).getByText(/当前已保存/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "删除配置" }));
    expect(await within(dialog).findByText("配置已删除")).toBeInTheDocument();
    expect(within(dialog).getByText("当前未保存配置")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Subscription Key")).toHaveValue("");
  });

  it("translates from the original text panel action", async () => {
    const fetchMock = mockTranslateFetch("Translated from nearby action");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /文本翻译/ }));
    await screen.findByRole("region", { name: "文本翻译工具" });

    expect(screen.getByRole("button", { name: "翻译" })).toBeInTheDocument();
    await user.click(originalTextPanel().getByRole("button", { name: "翻译原文" }));

    expect(await screen.findByDisplayValue("Translated from nearby action")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("auto-translates when the original text editor loses focus", async () => {
    const fetchMock = mockTranslateFetch("Translated after blur");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /文本翻译/ }));
    const editor = await screen.findByDisplayValue("DevForge 需要一个快捷、免配置、在工具内直接返回结果的翻译入口。");
    await user.click(editor);
    await user.tab();

    expect(await screen.findByDisplayValue("Translated after blur")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-translate the same signature twice", async () => {
    const fetchMock = mockTranslateFetch("Translated once");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /文本翻译/ }));
    const editor = await screen.findByDisplayValue("DevForge 需要一个快捷、免配置、在工具内直接返回结果的翻译入口。");
    await user.click(editor);
    await user.tab();
    expect(await screen.findByDisplayValue("Translated once")).toBeInTheDocument();

    await user.click(editor);
    await user.tab();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not auto-translate when clicking the original text clear action", async () => {
    const fetchMock = mockTranslateFetch("Should not translate");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /文本翻译/ }));
    const editor = await screen.findByDisplayValue("DevForge 需要一个快捷、免配置、在工具内直接返回结果的翻译入口。");
    await user.click(editor);
    await user.click(originalTextPanel().getByRole("button", { name: "清空" }));

    expect(editor).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts without default favorites", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();
    expect(screen.queryByText("收藏")).not.toBeInTheDocument();
  });

  it("toggles the active page from the titlebar favorite button", async () => {
    const user = setupUser();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收藏当前页面" }));
    expect(await screen.findByText("收藏")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消收藏当前页面" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消收藏当前页面" }));
    expect(screen.queryByText("收藏")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收藏当前页面" })).toBeInTheDocument();
  });

  it("adds and removes favorites from the sidebar context menu", async () => {
    const user = setupUser();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();

    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("link", { name: /Base64/ }) });
    await user.click(await screen.findByRole("menuitem", { name: "添加到收藏" }));

    expect(await screen.findByText("收藏")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "收藏夹" })).getByRole("link", { name: /Base64/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Base64/ })).toHaveLength(4);

    await user.pointer({ keys: "[MouseRight]", target: screen.getAllByRole("link", { name: /Base64/ })[0] });
    await user.click(await screen.findByRole("menuitem", { name: "取消收藏" }));

    expect(screen.queryByText("收藏")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Base64/ })).toHaveLength(1);
  });

  it("loads a selected file into the Base64 input", async () => {
    const user = setupUser();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /Base64/ }));

    const fileInput = screen.getByLabelText("选择文件转换为 Base64");
    const file = new File(["DevForge file"], "devforge.txt", { type: "text/plain" });
    await user.upload(fileInput, file);

    expect(await screen.findByDisplayValue("data:text/plain;base64,RGV2Rm9yZ2UgZmlsZQ==")).toBeInTheDocument();
    expect(screen.getByText(/devforge\.txt/)).toBeInTheDocument();
  });

  it("opens command palette with keyboard shortcut", async () => {
    const user = setupUser();
    render(<App />);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索工具、命令或应用...")).toBeInTheDocument();
  });

  it("opens the selected tool from launcher search with Enter", async () => {
    const user = setupUser();
    render(<App />);

    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByPlaceholderText("搜索工具、命令或应用..."), "jwt");
    await user.keyboard("{Enter}");

    expect(await screen.findByLabelText("JWT 快捷键")).toBeInTheDocument();
  });

  it("shows real usage summary and recent activity on the dashboard", async () => {
    const user = setupUser();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "今日使用" })).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "平均响应" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "工具总数" })).getByText("→ 0%")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "今日使用" })).getByText("→ 0%")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "剪贴板操作" })).getByText("→ 0%")).toBeInTheDocument();
    expect(screen.queryByText("可用工具")).not.toBeInTheDocument();
    expect(screen.queryByText("本地记录")).not.toBeInTheDocument();
    expect(screen.queryByText("复制相关")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("link", { name: /Base64/ }));
    await user.click(await screen.findByRole("button", { name: /运行/ }));
    await user.click(await screen.findByRole("link", { name: "工作台" }));

    expect(await within(screen.getByRole("article", { name: "今日使用" })).findByText("1")).toBeInTheDocument();
    expect(await within(screen.getByRole("article", { name: "今日使用" })).findByText("↑ 100%")).toBeInTheDocument();
    const recentActivity = screen.getByRole("region", { name: "最近活动" });
    expect(within(recentActivity).getByRole("link", { name: /Base64/ })).toBeInTheDocument();
    expect(within(recentActivity).getByText("编码")).toBeInTheDocument();
  });

  it("does not show a hot badge before any recent usage exists", async () => {
    mockCurrentTime("2026-06-18T10:00:00.000Z");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "工作台" })).toBeInTheDocument();
    expect(screen.queryByText("热门")).not.toBeInTheDocument();
  });

  it("shows a hot badge on the only recently used tool", async () => {
    mockCurrentTime("2026-06-18T10:00:00.000Z");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /Base64/ }));
    await user.click(await screen.findByRole("button", { name: /运行/ }));
    await user.click(await screen.findByRole("link", { name: "工作台" }));

    const hotBadge = await screen.findByText("热门");
    expect(hotBadge).toBeInTheDocument();
    expect(hotBadge.closest("a")).toHaveAccessibleName(/Base64/);
  });

  it("moves the hot badge to the most-used tool within the last 7 days", async () => {
    mockCurrentTime("2026-06-18T10:00:00.000Z");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /Base64/ }));
    await user.click(await screen.findByRole("button", { name: /运行/ }));

    await user.click(await screen.findByRole("link", { name: /正则测试/ }));
    const patternInput = await screen.findByPlaceholderText("输入正则表达式");
    await user.clear(patternInput);
    await user.type(patternInput, "devforge");
    await user.click(await screen.findByRole("button", { name: "运行" }));

    mockCurrentTime("2026-06-18T10:05:00.000Z");
    await user.click(await screen.findByRole("button", { name: "运行" }));

    await user.click(await screen.findByRole("link", { name: "工作台" }));

    const hotBadge = await screen.findByText("热门");
    expect(hotBadge.closest("a")).toHaveAccessibleName(/正则测试/);
  });

  it("uses the most recent tool when recent usage counts are tied", async () => {
    mockCurrentTime("2026-06-18T10:00:00.000Z");
    const user = setupUser();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: /Base64/ }));
    await user.click(await screen.findByRole("button", { name: /运行/ }));

    mockCurrentTime("2026-06-18T10:05:00.000Z");
    await user.click(await screen.findByRole("link", { name: /URL 编码/ }));
    await user.click(await screen.findByRole("button", { name: "运行" }));
    await user.click(await screen.findByRole("link", { name: "工作台" }));

    const hotBadge = await screen.findByText("热门");
    expect(hotBadge.closest("a")).toHaveAccessibleName(/URL 编码/);
  });

  it("navigates to the diff tool", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /差异对比/ }));
    expect(await screen.findByText("左侧内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "对比" })).toBeInTheDocument();
  });

  it("swaps URL output back into the input editor", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /URL 编码/ }));

    const inputEditor = await screen.findByDisplayValue("https://devforge.app/search?q=开发者工具&mode=fast");
    await userEvent.clear(inputEditor);
    await userEvent.type(inputEditor, "a b");

    expect(await screen.findByDisplayValue("a%20b")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "交换输入输出" }));

    expect(inputEditor).toHaveValue("a%20b");
  });

  it("navigates to the port tool", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /端口占用/ }));
    expect(await screen.findByText("端口占用列表")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PID" })).toBeInTheDocument();
    expect(screen.getAllByText("⌘⇧P")).toHaveLength(1);
  });

  it("navigates to the DNS tool", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /DNS 查询/ }));
    expect(await screen.findByText("解析结果")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "TTL" })).toBeInTheDocument();
    expect(screen.getAllByText("⌘⇧L").length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to the IP tool", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /IP 工具/ }));
    expect(await screen.findByText("IP 查询结果表")).toBeInTheDocument();
    expect(await screen.findByText("本机网卡 IP")).toBeInTheDocument();
    expect((await screen.findAllByText("192.168.60.211")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "IP 网络计算" })).toBeInTheDocument();
    expect(screen.getAllByText("⌘⇧O").length).toBeGreaterThanOrEqual(1);
  });

  it("copies public and local IP lookup rows", async () => {
    const user = setupUser();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /IP 工具/ }));
    expect(await screen.findByText("本机网卡 IP")).toBeInTheDocument();
    expect(await screen.findByText("Local IP")).toBeInTheDocument();

    await user.click(within(screen.getByLabelText("IP 工具")).getByRole("button", { name: "复制" }));

    await waitFor(() =>
      expect(mocks.clipboardWriteText).toHaveBeenCalledWith(
        expect.stringContaining("Local IP\t192.168.60.211\t当前系统默认出口网卡的本机 IPv4 地址")
      )
    );
    expect(mocks.clipboardWriteText).toHaveBeenCalledWith(expect.stringContaining("Public IP\t18.181.224.94"));
  });

  it("navigates to the regex tool", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /正则测试/ }));
    expect(await screen.findByText("匹配高亮")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "替换预览" })).toBeInTheDocument();
    expect(screen.getAllByText("⌘⇧R").length).toBeGreaterThanOrEqual(1);
  });

  it("preserves timestamp inputs when switching between tools", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /时间戳计算/ }));

    const timestampInputs = await screen.findAllByDisplayValue("1700000000");
    const timestampInput = timestampInputs[0];
    await userEvent.clear(timestampInput);
    await userEvent.type(timestampInput, "1800000000");

    const diffStartInput = timestampInputs[1];
    await userEvent.clear(diffStartInput);
    await userEvent.type(diffStartInput, "1800000100");

    await userEvent.click(await screen.findByRole("link", { name: /正则测试/ }));
    expect(await screen.findByText("匹配高亮")).toBeInTheDocument();
    expect(screen.getByLabelText("正则 快捷键")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("link", { name: /时间戳计算/ }));
    expect(await screen.findByDisplayValue("1800000000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1800000100")).toBeInTheDocument();
    expect(screen.getByLabelText("时间戳 快捷键")).toBeInTheDocument();
  });

  it("preserves regex editor state when switching between tools", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /正则测试/ }));

    const patternInput = await screen.findByPlaceholderText("输入正则表达式");
    await userEvent.clear(patternInput);
    await userEvent.type(patternInput, "hello");

    const textEditor = screen.getByDisplayValue("Contact devforge@app.local, api-team@example.com and ops@example.org for rollout notes.");
    await userEvent.clear(textEditor);
    await userEvent.type(textEditor, "hello devforge");

    await userEvent.click(await screen.findByRole("link", { name: /时间戳计算/ }));
    expect(await screen.findByText("当前时间")).toBeInTheDocument();
    expect(screen.getByLabelText("时间戳 快捷键")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("link", { name: /正则测试/ }));
    expect(await screen.findByDisplayValue("hello")).toBeInTheDocument();
    expect(screen.getByDisplayValue("hello devforge")).toBeInTheDocument();
    expect(screen.getByLabelText("正则 快捷键")).toBeInTheDocument();
  });

  it("navigates to the password generator", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /密码生成器/ }));

    expect(await screen.findByText("生成结果")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "密码" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("24").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("row")).toHaveLength(13);

    await userEvent.click(screen.getByRole("tab", { name: "UUID v4" }));
    expect(screen.getByRole("tab", { name: "UUID v4" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findAllByText("UUID v4")).not.toHaveLength(0);

    await userEvent.click(screen.getByRole("tab", { name: "NanoID" }));
    expect(screen.getByRole("tab", { name: "NanoID" })).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to the palette generator", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /配色方案/ }));

    expect(await screen.findByText("生成色板")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "邻近色" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("基准色 HEX")).toHaveValue("#2563EB");
    expect(screen.getByLabelText("CSS 变量")).toHaveTextContent("--color-1: #2563EB;");

    await userEvent.click(screen.getByRole("tab", { name: "互补色" }));
    expect(screen.getByRole("tab", { name: "互补色" })).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to the SSH key pair generator", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /SSH 密钥对/ }));

    expect(await screen.findByRole("region", { name: "SSH 密钥对" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "RSA" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("OpenSSH 公钥")).toBeInTheDocument();
    expect(await screen.findByText(/SHA256:/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "ECDSA" }));
    expect(screen.getByRole("tab", { name: "ECDSA" })).toHaveAttribute("aria-selected", "true");
  });

  it("creates an authenticator vault, adds a TOTP account and preserves unlocked state while switching tools", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /身份验证器/ }));

    expect(await screen.findByRole("region", { name: "身份验证器" })).toBeInTheDocument();
    expect(screen.getByText("创建 2FA 保险库")).toBeInTheDocument();

    await user.type(screen.getByLabelText("创建主密码"), "correct horse battery staple");
    await user.type(screen.getByLabelText("确认主密码"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /创建并解锁/ }));

    expect(await screen.findByText("TOTP 账号")).toBeInTheDocument();
    await screen.findByLabelText("服务商");
    await user.type(screen.getByLabelText("服务商"), "GitHub");
    await user.type(screen.getByLabelText("账号"), "dev@example.com");
    await user.type(screen.getByLabelText("Base32 密钥"), "JBSWY3DPEHPK3PXP");
    await user.click(screen.getByRole("button", { name: /添加账号/ }));

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("dev@example.com")).toBeInTheDocument();
    expect(await screen.findByText(/\d{3} \d{3}/)).toBeInTheDocument();

    const accountRow = screen.getByText("GitHub").closest("article");
    expect(accountRow).not.toBeNull();
    expect(within(accountRow as HTMLElement).getByRole("button", { name: "显示二维码" })).toBeInTheDocument();
    expect(within(accountRow as HTMLElement).getByRole("button", { name: "编辑账号" })).toBeInTheDocument();
    expect(within(accountRow as HTMLElement).getByRole("button", { name: "删除账号" })).toBeInTheDocument();
    const copyButton = within(accountRow as HTMLElement).getByRole("button", { name: "复制验证码" });
    mocks.clipboardWriteText.mockClear();
    await waitFor(() => expect(copyButton).toBeEnabled());
    await user.click(within(accountRow as HTMLElement).getByRole("button", { name: "复制 GitHub 的验证码" }));
    await waitFor(() => expect(mocks.clipboardWriteText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)));
    expect(await screen.findByText("验证码已复制")).toBeInTheDocument();
    await user.click(copyButton);
    await waitFor(() => expect(mocks.clipboardWriteText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)));
    expect(await screen.findByText("验证码已复制")).toBeInTheDocument();

    await user.click(within(accountRow as HTMLElement).getByRole("button", { name: "编辑账号" }));
    const editDialog = await screen.findByRole("dialog", { name: "编辑 2FA 账号" });
    expect(within(editDialog).getByLabelText("编辑服务商")).toHaveValue("GitHub");
    expect(within(editDialog).getByLabelText("编辑账号")).toHaveValue("dev@example.com");
    await user.clear(within(editDialog).getByLabelText("编辑服务商"));
    await user.click(within(editDialog).getByRole("button", { name: "保存修改" }));
    expect(await screen.findByText("请输入服务商")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "编辑 2FA 账号" })).toBeInTheDocument();
    await user.type(within(editDialog).getByLabelText("编辑服务商"), "GitLab");
    await user.clear(within(editDialog).getByLabelText("编辑账号"));
    await user.type(within(editDialog).getByLabelText("编辑账号"), "ops@example.com");
    await user.click(within(editDialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑 2FA 账号" })).not.toBeInTheDocument());
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("dev@example.com")).toBeInTheDocument();

    await user.click(within(accountRow as HTMLElement).getByRole("button", { name: "编辑账号" }));
    const saveDialog = await screen.findByRole("dialog", { name: "编辑 2FA 账号" });
    await user.clear(within(saveDialog).getByLabelText("编辑服务商"));
    await user.type(within(saveDialog).getByLabelText("编辑服务商"), "GitLab");
    await user.clear(within(saveDialog).getByLabelText("编辑账号"));
    await user.type(within(saveDialog).getByLabelText("编辑账号"), "ops@example.com");
    await user.click(within(saveDialog).getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑 2FA 账号" })).not.toBeInTheDocument());
    expect(await screen.findByText("账号已更新")).toBeInTheDocument();
    expect(await screen.findByText("GitLab")).toBeInTheDocument();
    expect(screen.getByText("ops@example.com")).toBeInTheDocument();
    expect(screen.queryByText("dev@example.com")).not.toBeInTheDocument();

    const updatedAccountRow = screen.getByText("GitLab").closest("article");
    expect(updatedAccountRow).not.toBeNull();
    await user.click(within(updatedAccountRow as HTMLElement).getByRole("button", { name: "复制 GitLab 的验证码" }));
    await waitFor(() => expect(mocks.clipboardWriteText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)));
    await user.click(within(updatedAccountRow as HTMLElement).getByRole("button", { name: "显示二维码" }));
    const qrDialog = await screen.findByRole("dialog", { name: "账号二维码" });
    expect(within(qrDialog).getByText(/二维码包含 2FA 密钥/)).toBeInTheDocument();
    expect(within(qrDialog).getByAltText("GitLab 账号二维码")).toHaveAttribute("src", "data:image/png;base64,qr");
    expect(mocks.qrToDataURL).toHaveBeenCalledWith(
      "otpauth://totp/GitLab%3Aops%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitLab&algorithm=SHA1&digits=6&period=30",
      expect.objectContaining({ errorCorrectionLevel: "M" })
    );
    await user.click(within(qrDialog).getByRole("button", { name: "复制 otpauth URI" }));
    await waitFor(() =>
      expect(mocks.clipboardWriteText).toHaveBeenCalledWith(
        "otpauth://totp/GitLab%3Aops%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitLab&algorithm=SHA1&digits=6&period=30"
      )
    );
    await user.click(within(qrDialog).getByRole("button", { name: "关闭二维码弹窗" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "账号二维码" })).not.toBeInTheDocument());

    await user.click(within(updatedAccountRow as HTMLElement).getByRole("button", { name: "删除账号" }));
    const deleteDialog = await screen.findByRole("dialog", { name: "删除 2FA 账号" });
    expect(within(deleteDialog).getAllByText("GitLab").length).toBeGreaterThan(0);
    expect(within(deleteDialog).getByText("ops@example.com")).toBeInTheDocument();
    await user.click(within(deleteDialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "删除 2FA 账号" })).not.toBeInTheDocument());
    expect(screen.getByText("GitLab")).toBeInTheDocument();

    await user.click(within(updatedAccountRow as HTMLElement).getByRole("button", { name: "删除账号" }));
    await user.click(within(await screen.findByRole("dialog", { name: "删除 2FA 账号" })).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(screen.queryByText("GitLab")).not.toBeInTheDocument());
    expect(screen.getByText("账号已删除")).toBeInTheDocument();

    await user.click(await screen.findByRole("link", { name: /Base64/ }));
    await user.click(await screen.findByRole("link", { name: /身份验证器/ }));
    expect(await screen.findByText("暂无 2FA 账号。")).toBeInTheDocument();

    await user.click(await screen.findByRole("link", { name: "工作台" }));
    const recentActivity = screen.getByRole("region", { name: "最近活动" });
    expect(within(recentActivity).queryByText(/JBSWY3DPEHPK3PXP|otpauth:\/\/|dev@example\.com|ops@example\.com|\d{6}/)).not.toBeInTheDocument();
  });

  it("exports and imports authenticator backups and scans selected QR content without leaking secrets to activity", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /身份验证器/ }));

    await user.type(await screen.findByLabelText("创建主密码"), "correct horse battery staple");
    await user.type(screen.getByLabelText("确认主密码"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: /创建并解锁/ }));

    await screen.findByLabelText("服务商");
    await user.type(screen.getByLabelText("服务商"), "GitHub");
    await user.type(screen.getByLabelText("账号"), "dev@example.com");
    await user.type(screen.getByLabelText("Base32 密钥"), "JBSWY3DPEHPK3PXP");
    await user.click(screen.getByRole("button", { name: /添加账号/ }));
    expect(await screen.findByText("GitHub")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /导出备份/ }));
    expect(await screen.findByText("明文备份包含 2FA 密钥，再次点击导出")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /确认导出/ }));

    await waitFor(() => expect(mocks.savedFiles).toHaveLength(1));
    expect(mocks.savedFiles[0].defaultPath).toMatch(/^devforge-2fa-backup-\d{8}-\d{4}\.txt$/);
    expect(mocks.savedFiles[0].value.trim()).toBe(
      "otpauth://totp/GitHub%3Adev%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30"
    );

    const backupText = [
      mocks.savedFiles[0].value.trim(),
      "otpauth://totp/Work:ops%40example.com?secret=ABCD2345&issuer=Work",
      "not-a-url"
    ].join("\n");
    await user.upload(screen.getByLabelText("导入 2FA 备份文件"), new File([backupText], "backup.txt", { type: "text/plain" }));

    expect(await screen.findByText("导入 1 个，跳过 1 个，失败 1 行")).toBeInTheDocument();
    expect(await screen.findByText("Work")).toBeInTheDocument();
    expect(screen.getByText("ops@example.com")).toBeInTheDocument();

    class MockImage {
      naturalWidth = 12;
      naturalHeight = 12;
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event("load")));
      }
    }
    vi.stubGlobal("Image", MockImage);
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }))
    } as unknown as CanvasRenderingContext2D);

    try {
      mocks.captureScreenSelection.mockResolvedValueOnce("data:image/png;base64,scan");
      mocks.jsQrData = "otpauth://totp/Scan:scan%40example.com?secret=JBSWY3DP&issuer=Scan";
      await user.click(screen.getByRole("button", { name: /扫一扫/ }));

      expect(await screen.findByText("导入 1 个，跳过 0 个，失败 0 行")).toBeInTheDocument();
      expect(await screen.findByText("Scan")).toBeInTheDocument();
      expect(screen.getByText("scan@example.com")).toBeInTheDocument();
      expect(mocks.captureScreenSelection).toHaveBeenCalledTimes(1);
    } finally {
      getContextSpy.mockRestore();
    }

    await user.click(await screen.findByRole("link", { name: "工作台" }));
    const recentActivity = screen.getByRole("region", { name: "最近活动" });
    expect(within(recentActivity).queryByText(/JBSWY3DPEHPK3PXP|ABCD2345|otpauth:\/\/|dev@example\.com|ops@example\.com|scan@example\.com/)).not.toBeInTheDocument();
  });

  it("navigates to the SQL formatter", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("link", { name: /SQL 格式化/ }));
    expect(await screen.findByText("SQL 编辑器")).toBeInTheDocument();
    expect(screen.getByText("格式选项")).toBeInTheDocument();
    expect(screen.getByText("检查项")).toBeInTheDocument();
    expect(screen.getByText("速查")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Postgres" })).toBeInTheDocument();
    expect(screen.getAllByText("⌘⇧S").length).toBeGreaterThanOrEqual(1);
  });

  it("uses an in-editor folding JSON view with a structural tree preview", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /JSON 格式化/ }));

    expect(await screen.findByLabelText("JSON 编辑器")).toBeInTheDocument();
    expect(screen.getByText("root")).toBeInTheDocument();
    expect(screen.getByText("Object · 3 keys")).toBeInTheDocument();
    expect(screen.getByText("tools")).toBeInTheDocument();
    expect(screen.getByText("Array · 3 items")).toBeInTheDocument();
    expect(screen.getByText(/5 行 · \d+ chars · JSON/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "折叠" }));
    expect(await screen.findByText(/1 行 · \d+ chars · JSON/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开" }));
    expect(await screen.findByText(/5 行 · \d+ chars · JSON/)).toBeInTheDocument();
  });

  it("preserves JSON and YAML editor drafts while switching formats", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /JSON 格式化/ }));

    await user.click(screen.getByRole("button", { name: "压缩" }));
    expect(await screen.findByText(/1 行 · \d+ chars · JSON/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "YAML" }));
    expect(await screen.findByLabelText("YAML 编辑器")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "JSON" }));
    expect(await screen.findByText(/1 行 · \d+ chars · JSON/)).toBeInTheDocument();
    expect(screen.getByLabelText("JSON 编辑器")).toHaveTextContent('"name":"DevForge"');
  });

  it("shows parse errors without removing the CodeMirror editor", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("link", { name: /JSON 格式化/ }));

    const editor = await screen.findByLabelText("JSON 编辑器");
    await user.click(screen.getByRole("button", { name: "清空" }));
    await user.click(screen.getByRole("button", { name: "运行" }));

    expect((await screen.findAllByText(/Unexpected end of JSON input/)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("JSON 编辑器")).toBe(editor);
  });

  it("toggles theme", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "切换主题" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies the saved light theme in the launcher window", async () => {
    window.localStorage.setItem("devforge:theme", JSON.stringify("light"));
    window.history.replaceState(null, "", "/?window=launcher");

    render(<App />);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(document.body.dataset.theme).toBe("light");
    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeInTheDocument();
  });
});
