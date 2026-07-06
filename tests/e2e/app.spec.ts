import { expect, test } from "@playwright/test";

test("dashboard and tools render without obvious overlap", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await expect(page.getByRole("region", { name: "常用工具" })).toBeVisible();
  await page.getByRole("link", { name: "JSON / YAML" }).click();
  await expect(page.locator(".titlebar")).toContainText("JSON / YAML");
  await expect(page.locator(".json-page .json-code-editor")).toBeVisible();
});

test("command palette opens", async ({ page }) => {
  await page.goto("/");
  await page.locator(".sidebar-search").click();
  await expect(page.getByRole("dialog", { name: "命令面板" })).toBeVisible();
  await page.getByPlaceholder("搜索工具、命令或应用...").fill("jwt");
  await expect(page.getByRole("button", { name: /JWT 编解码/ })).toBeVisible();
});

test("json yaml page keeps the editor usable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/json-yaml");

  const editor = page.locator(".json-page .cm-content");
  await expect(editor).toBeVisible();

  const editorBox = await editor.boundingBox();
  expect(editorBox?.width).toBeGreaterThan(300);
  expect(editorBox?.height).toBeGreaterThan(220);

  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type('{"status":"ok","items":[{"id":1}]}');
  await expect(editor).toContainText('"status"');
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("1 行");

  await page.getByRole("button", { name: "运行" }).click();
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("8 行");
  await expect(page.locator(".json-page .json-structure-tree")).toContainText("Object · 2 keys");
  await expect(page.locator(".json-page .json-structure-tree")).toContainText("Array · 1 item");

  await page.getByRole("button", { name: "压缩" }).click();
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("1 行");
  await page.getByRole("button", { name: "YAML" }).click();
  await expect(page.locator(".json-page .cm-content")).toContainText("DevForge");
  await page.getByRole("button", { name: "压缩" }).click();
  await expect(page.locator(".json-page .cm-content")).toContainText("tools: [json,yaml,jwt]");
  await page.getByRole("button", { name: "JSON" }).click();
  await expect(page.locator(".json-page .cm-content")).toContainText('"status":"ok"');
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("1 行");
  await page.getByRole("button", { name: "YAML" }).click();
  await expect(page.locator(".json-page .cm-content")).toContainText("tools: [json,yaml,jwt]");
  await page.getByRole("button", { name: "JSON" }).click();

  await page.getByRole("button", { name: "格式化" }).click();
  await page.getByRole("button", { name: "运行" }).click();
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("8 行");

  await page.locator(".json-editor-panel").getByRole("button", { name: "折叠", exact: true }).click();
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("1 行");

  await page.locator(".json-editor-panel").getByRole("button", { name: "展开", exact: true }).click();
  await expect(page.locator(".json-page .json-visible-lines")).toContainText("8 行");

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".json-page .json-tree-panel .json-structure-tree")).toBeVisible();
  await expect(page.locator(".json-page .tiny-list")).toBeVisible();
});

test("json yaml page searches formatted editor content", async ({ page }) => {
  await page.goto("/#/tools/json-yaml");

  const editor = page.locator(".json-page .cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type('{"status":"ready","services":[{"name":"api","status":"ready"},{"name":"worker","status":"ready"}]}');

  await page.getByRole("button", { name: "运行" }).click();
  await page.getByRole("button", { name: "搜索" }).click();

  const searchInput = page.getByLabel("搜索 JSON/YAML 内容");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("status");

  await expect(page.locator(".json-search-count")).toContainText("1/3");
  await expect(page.locator(".json-page .cm-searchMatch")).toHaveCount(3);
  await expect(page.locator(".json-page .cm-searchMatch-selected")).toHaveCount(1);

  await page.getByRole("button", { name: "下一处" }).click();
  await expect(page.locator(".json-search-count")).toContainText("2/3");

  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".json-search-count")).toContainText("1/3");

  await page.keyboard.press("Escape");
  await expect(searchInput).toBeHidden();
});

test("json yaml search works while the document is invalid", async ({ page }) => {
  await page.goto("/#/tools/json-yaml");

  const editor = page.locator(".json-page .cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type('{"status":"ready", broken');

  await expect(page.locator(".json-page .editor-footer .error-text")).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+F" : "Control+F");

  const searchInput = page.getByLabel("搜索 JSON/YAML 内容");
  await expect(searchInput).toBeVisible();
  await searchInput.fill("status");
  await expect(page.locator(".json-search-count")).toContainText("1/1");
});

test("json yaml page replaces current and all search matches", async ({ page }) => {
  await page.goto("/#/tools/json-yaml");

  const editor = page.locator(".json-page .cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type('{"status":"ready","services":[{"name":"api","status":"ready"},{"name":"worker","status":"ready"}]}');

  await page.getByRole("button", { name: "运行" }).click();
  await page.getByRole("button", { name: "搜索" }).click();

  const searchInput = page.getByLabel("搜索 JSON/YAML 内容");
  const replaceInput = page.getByLabel("替换为");
  await expect(searchInput).toBeVisible();
  await expect(replaceInput).toBeVisible();

  await searchInput.fill("status");
  await replaceInput.fill("state");
  await page.getByRole("button", { name: "替换当前" }).click();

  await expect(editor).toContainText('"state": "ready"');
  await expect(page.locator(".json-search-count")).toContainText("1/2");
  await expect(page.locator(".json-page .cm-searchMatch")).toHaveCount(2);
  await expect(page.locator(".json-page .json-structure-tree")).toContainText("state");

  await searchInput.fill("ready");
  await replaceInput.fill("done");
  await page.getByRole("button", { name: "全部替换" }).click();

  await expect(editor).not.toContainText("ready");
  await expect(editor).toContainText('"done"');
  await expect(page.locator(".json-search-count")).toContainText("0/0");
  await expect(page.locator(".json-page .json-structure-tree")).toContainText('"done"');
});

test("json yaml replace works while the document is invalid", async ({ page }) => {
  await page.goto("/#/tools/json-yaml");

  const editor = page.locator(".json-page .cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type('{"status":"ready", broken');

  await expect(page.locator(".json-page .editor-footer .error-text")).toBeVisible();
  await page.getByRole("button", { name: "搜索" }).click();

  await page.getByLabel("搜索 JSON/YAML 内容").fill("broken");
  await page.getByLabel("替换为").fill('"fixed": true}');
  await page.getByRole("button", { name: "替换当前" }).click();

  await expect(editor).toContainText('"fixed"');
  await expect(page.locator(".json-page .json-visible-lines")).toBeVisible();
  await expect(page.locator(".json-page .json-structure-tree")).toContainText("fixed");
});

test("base64 page stacks editors and remains usable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/base64");

  const inputEditor = page.locator(".base64-tool-page .base64-input-panel textarea");
  const outputPanel = page.locator(".base64-tool-page .base64-output-panel");
  await expect(inputEditor).toBeVisible();
  await expect(outputPanel).toBeVisible();

  const inputBox = await inputEditor.boundingBox();
  const outputBox = await outputPanel.boundingBox();
  expect(inputBox?.width).toBeGreaterThan(300);
  expect(inputBox?.height).toBeGreaterThan(160);
  expect(outputBox?.y).toBeGreaterThan((inputBox?.y ?? 0) + (inputBox?.height ?? 0));

  await inputEditor.fill("DevForge");
  await expect(inputEditor).toHaveValue("DevForge");

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".base64-tool-page .side-stack .inspector-panel").first()).toBeVisible();
});

test("base64 page loads a selected file into the input editor", async ({ page }) => {
  await page.goto("/#/tools/base64");

  const fileInput = page.getByLabel("选择文件转换为 Base64", { exact: true });
  await fileInput.setInputFiles({
    name: "devforge.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("DevForge file")
  });

  await expect(page.locator(".base64-tool-page .base64-input-panel textarea")).toHaveValue("data:text/plain;base64,RGV2Rm9yZ2UgZmlsZQ==");
  await expect(page.locator(".base64-tool-page .file-status")).toContainText("devforge.txt");
});

test("url page swaps output into input from the middle control", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.goto("/#/tools/url");

  const inputEditor = page.locator(".url-page .url-editor-panel textarea").first();
  await inputEditor.fill("a b");
  await expect(page.locator(".url-page .url-editor-panel textarea").last()).toHaveValue("a%20b");

  const swapButton = page.getByRole("button", { name: "交换输入输出" });
  await expect(swapButton).toBeVisible();
  await swapButton.click();

  await expect(inputEditor).toHaveValue("a%20b");
});

test("bandwidth page remains usable and scrollable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/bandwidth");

  const fileSizeInput = page.locator(".bandwidth-page .bandwidth-transfer-panel input").first();
  const convertPanel = page.locator(".bandwidth-page .bandwidth-convert-panel");
  await expect(fileSizeInput).toBeVisible();
  await expect(convertPanel).toBeVisible();

  const inputBox = await fileSizeInput.boundingBox();
  const convertBox = await convertPanel.boundingBox();
  expect(inputBox?.width).toBeGreaterThan(300);
  expect(convertBox?.y).toBeGreaterThan((inputBox?.y ?? 0) + (inputBox?.height ?? 0));

  await fileSizeInput.fill("2.5");
  await expect(fileSizeInput).toHaveValue("2.5");

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".bandwidth-page .side-stack .panel").first()).toBeVisible();
});

test("port page keeps search and table usable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/port");

  const search = page.locator(".port-page .port-search input");
  const tableShell = page.locator(".port-page .port-table-shell");
  const table = page.locator(".port-page .port-table");
  await expect(search).toBeVisible();
  await expect(tableShell).toBeVisible();

  const searchBox = await search.boundingBox();
  const shellBox = await tableShell.boundingBox();
  expect(searchBox?.width).toBeGreaterThan(220);
  expect(shellBox?.width).toBeGreaterThan(300);
  await expect(table.getByRole("columnheader", { name: "PID" })).toBeVisible();

  await search.fill("node");
  await expect(search).toHaveValue("node");

  const tableLayout = await tableShell.evaluate((shell) => {
    const tableElement = shell.querySelector(".port-table");
    return {
      horizontalScrollable: shell.scrollWidth > shell.clientWidth,
      tableInsideShell: Boolean(tableElement) && tableElement.getBoundingClientRect().left >= shell.getBoundingClientRect().left
    };
  });
  expect(tableLayout.horizontalScrollable).toBe(true);
  expect(tableLayout.tableInsideShell).toBe(true);

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".port-page .side-stack .inspector-panel").first()).toBeVisible();
});

test("dns page keeps lookup controls and results usable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/dns");

  const search = page.locator(".dns-page .port-search input");
  const tableShell = page.locator(".dns-page .dns-table-shell");
  const table = page.locator(".dns-page .dns-table");
  await expect(search).toBeVisible();
  await expect(tableShell).toBeVisible();

  const searchBox = await search.boundingBox();
  const shellBox = await tableShell.boundingBox();
  expect(searchBox?.width).toBeGreaterThan(220);
  expect(shellBox?.width).toBeGreaterThan(300);
  await expect(table.getByRole("columnheader", { name: "TTL" })).toBeVisible();

  await search.fill("example.com");
  await expect(search).toHaveValue("example.com");
  await page.getByRole("button", { name: "TXT" }).click();
  await expect(page.getByRole("button", { name: "TXT" })).toHaveAttribute("aria-pressed", "true");

  const tableLayout = await tableShell.evaluate((shell) => {
    const tableElement = shell.querySelector(".dns-table");
    return {
      horizontalScrollable: shell.scrollWidth > shell.clientWidth,
      tableInsideShell: Boolean(tableElement) && tableElement.getBoundingClientRect().left >= shell.getBoundingClientRect().left
    };
  });
  expect(tableLayout.horizontalScrollable).toBe(true);
  expect(tableLayout.tableInsideShell).toBe(true);

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".dns-page .side-stack .inspector-panel").first()).toBeVisible();
  await expect(page.locator(".dns-page .dns-resolver-panel")).toBeVisible();
});

test("regex page keeps pattern, flags and groups usable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/regex");

  const pattern = page.locator(".regex-page .regex-pattern-field input");
  const editor = page.locator(".regex-page .regex-text-panel textarea");
  const preview = page.locator(".regex-page .regex-preview-panel");
  await expect(pattern).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(preview).toBeVisible();

  const patternBox = await pattern.boundingBox();
  const editorBox = await editor.boundingBox();
  expect(patternBox?.width).toBeGreaterThan(290);
  expect(editorBox?.width).toBeGreaterThan(300);
  expect(editorBox?.height).toBeGreaterThan(180);

  await pattern.fill(String.raw`\b(api|ops)@example\.(com|org)\b`);
  await editor.fill("api@example.com\nops@example.org");
  await expect(editor).toHaveValue("api@example.com\nops@example.org");

  await page.getByRole("button", { name: "替换预览" }).click();
  await expect(page.locator(".regex-page .regex-replacement-panel").last()).toBeVisible();

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".regex-page .regex-groups-panel")).toBeVisible();
  await expect(page.locator(".regex-page .regex-cheatsheet-panel")).toBeVisible();
});

test("jwt decode layout stacks and remains scrollable on narrow windows", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/tools/jwt");

  const tokenEditor = page.locator("#jwtInput");
  const headerPanel = page.locator(".jwt-page .jwt-stack .compact-panel").filter({ hasText: "Header" });
  const payloadPanel = page.locator(".jwt-page .jwt-stack .compact-panel").filter({ hasText: "Payload" });
  const payloadCode = payloadPanel.locator(".jwt-code");
  await expect(tokenEditor).toBeVisible();
  await expect(headerPanel).toBeVisible();
  await expect(payloadCode).toBeVisible();

  const tokenBox = await tokenEditor.boundingBox();
  const headerBox = await headerPanel.boundingBox();
  expect(tokenBox?.width).toBeGreaterThan(300);
  expect(headerBox?.y).toBeGreaterThan((tokenBox?.y ?? 0) + (tokenBox?.height ?? 0));

  const payloadLayout = await payloadPanel.evaluate((panel) => {
    const code = panel.querySelector(".jwt-code");
    if (!code) return { inside: false, overflowY: "" };

    const panelRect = panel.getBoundingClientRect();
    const codeRect = code.getBoundingClientRect();
    return {
      inside: codeRect.bottom <= panelRect.bottom - 8,
      overflowY: getComputedStyle(code).overflowY
    };
  });
  expect(payloadLayout.inside).toBe(true);
  expect(["auto", "scroll"]).toContain(payloadLayout.overflowY);

  await page.locator(".content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator(".jwt-page .side-stack .tiny-list").first()).toBeVisible();
});
