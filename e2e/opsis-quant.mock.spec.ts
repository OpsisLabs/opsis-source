import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.skip(!enabled, "Opsis workspaces are disabled in this test environment");
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({ json: { expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663, research: true, exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false } }));
});

test("pre-run dataset card shows captured CSV identity and provenance labels", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  const rows = Array.from({ length: 190 }, (_, index) => `${new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)},${100 + index}`).join("\n");
  await page.getByLabel("Symbol").fill("CSV_ORIGINAL");
  await page.getByLabel("Contract / address").fill("0x0000000000000000000000000000000000000abc");
  await page.getByLabel("Source").fill("Local fixture source");
  await page.getByLabel("CSV or JSON file").setInputFiles({ name: "local.csv", mimeType: "text/csv", buffer: Buffer.from(`date,price\n${rows}`) });
  await expect(page.getByText(/USER IMPORT \/ PROVENANCE NOT VERIFIED/)).toBeVisible();
  await expect(page.getByText(/Chain 4663 · .* · CSV_ORIGINAL/)).toBeVisible();
  await expect(page.getByText(/Date range: 2026-01-01 – 2026-07-09/)).toBeVisible();
  await expect(page.getByText("Quote currency: USD")).toBeVisible();
  await expect(page.getByText(/Daily crypto, 24\/7/)).toBeVisible();
  await expect(page.getByText("Source: Local fixture source")).toBeVisible();
  // Metadata edited after the file is chosen is the metadata that runs and exports.
  await page.getByLabel("Symbol").fill("EDITED_AFTER_IMPORT");
  await page.getByLabel("Source").fill("Edited source");
  await expect(page.getByText(/Chain 4663 · .* · EDITED_AFTER_IMPORT/)).toBeVisible();
  await expect(page.getByText("Source: Edited source")).toBeVisible();
  await expect(page.getByText(/CSV_ORIGINAL/)).toHaveCount(0);
});

test("30-return import is refused by default and accepted in short-window research mode", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  const rows = Array.from({ length: 31 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 100 + index,
  }));
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "short-local.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "SHORT" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "Local fixture", observedAt: "2026-09-01T00:00:00Z" }, synthetic: true, observations: rows })),
  });
  const runButton = page.getByRole("button", { name: "Run local experiment" });
  await expect(runButton).toBeDisabled();
  await expect(page.getByText(/USER IMPORT \/ PROVENANCE NOT VERIFIED/)).toBeVisible();
  await expect(page.getByText(/File flags this as synthetic; not independently certified/)).toBeVisible();
  await expect(page.getByText(/At least 180 daily returns are required; this dataset has 30/)).toBeVisible();
  await page.getByLabel(/Short-window research mode/).check();
  await expect(runButton).toBeEnabled();
  const tooShort = rows.slice(0, 30);
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "too-short.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "SHORT" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "Local fixture", observedAt: "2026-09-01T00:00:00Z" }, observations: tooShort })),
  });
  await expect(runButton).toBeDisabled();
  await expect(page.getByText(/Short-window research mode still requires at least 30 daily returns; this dataset has 29/)).toBeVisible();
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "empty.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "EMPTY" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "Local fixture", observedAt: "2026-09-01T00:00:00Z" }, observations: [] })),
  });
  await expect(runButton).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: /At least 1 daily returns are required/ })).toBeVisible();
  await expect(page.getByText(/USER IMPORT \/ PROVENANCE NOT VERIFIED/)).toHaveCount(0);
  expect(requests.some((request) => /dataset|quant.*upload/i.test(request))).toBe(false);
  expect(requests.some((request) => request.includes("Local fixture"))).toBe(false);
});

test("local quant workflow validates, runs, and requires export consent", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await expect(page.getByText("1. Define the dataset")).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  const rows = Array.from({ length: 190 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return { date, price: 100 + index };
  });
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "local.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ PRIVATE_CANARY: "PRIVATE_CANARY", schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "TEST" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "PRIVATE_SOURCE_CANARY", observedAt: "2026-09-01T00:00:00Z" }, synthetic: true, observations: rows })),
  });
  await expect(page.getByText(/observations loaded/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observed daily return histogram" })).toBeVisible();
  await expect(page.getByText("Observations: 189.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Lower edge (fraction)" })).toBeVisible();
  await expect(page.locator(".opsis-quant-histogram-table tbody tr")).toHaveCount(12);
  await expect(page.getByRole("img", { name: /Observed daily return histogram/ })).toBeVisible();
  await expect(page.getByText(/Negative tail \(≤ -5%\): 0; Positive tail \(≥ \+5%\): 0/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observed peak-to-trough drawdown" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Observed dated drawdown curve/ })).toBeVisible();
  await expect(page.locator(".opsis-quant-drawdown-table tbody tr")).toHaveCount(190);
  await expect(page.getByRole("columnheader", { name: "Peak date" })).toBeVisible();
  await page.getByRole("button", { name: "Run local experiment" }).click();
  await expect(page.getByText("4. Results")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: /50%, 80%, and 95% bands and median/i })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "50% low" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "80% high" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "95% low" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Median" }).last()).toBeVisible();
  await expect(page.locator(".opsis-quant-fan-table tbody tr")).toHaveCount(190);
  await expect(page.getByText(/single-instrument parametric GBM comparison/)).toBeVisible();
  await page.getByLabel("Simulation model").selectOption("historical_moving_block_bootstrap");
  await page.getByLabel("Block length (2–30 days; at most half the sample)").fill("7");
  await page.getByRole("button", { name: "Run local experiment" }).click();
  await expect(page.getByText(/historical_moving_block_bootstrap \(7d\)/).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("At most two local runs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export manifest" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /consent to download/i }).check();
  await expect(page.getByRole("button", { name: "Export manifest" })).toBeEnabled();
  const [singleDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export manifest" }).click(),
  ]);
  const exportedSingle = await readFile(await singleDownload.path());
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "观察到的每日收益直方图" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "观察到的峰谷回撤" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "下边界（比例）" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "95% 下界" })).toBeVisible();
  await expect(page.getByRole("img", { name: /50%、80%、95% 区间和中位数/i })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(requests.some((url) => url.includes("PRIVATE_CANARY"))).toBe(false);
  expect(requests.some((url) => url.includes("/v1/private/analyze"))).toBe(false);
  expect(requests.some((url) => /dataset|quant.*upload/i.test(url))).toBe(false);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    { timeout: 3_000, message: "Quant settles without horizontal overflow after a viewport resize" },
  ).toBeLessThanOrEqual(1);
  await page.reload();
  await page.getByRole("button", { name: /Quant research/ }).click();
  const replay = page.locator("details").filter({ hasText: "Verify an exported Quant run" });
  await replay.locator("summary").click();
  await replay.getByLabel("Exported run JSON").setInputFiles({ name: "single-export.json", mimeType: "application/json", buffer: exportedSingle });
  await expect(replay.getByText("Replay matches the exported result.")).toBeVisible();
  await expect(replay).toContainText("historical_moving_block_bootstrap");
  const changedSingle = JSON.parse(exportedSingle.toString()) as { run: { bootstrap: { terminal: { median: number } } } };
  changedSingle.run.bootstrap.terminal.median += 0.01;
  await replay.getByLabel("Exported run JSON").setInputFiles({ name: "tampered-export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changedSingle)) });
  await expect(replay.getByRole("alert")).toBeVisible();
  await expect(replay.getByText("Replay matches the exported result.")).toHaveCount(0);
  expect(requests.some((request) => request.includes("PRIVATE_SOURCE_CANARY"))).toBe(false);
});

test("parametric GBM comparison is labeled bilingually and stays local", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  const rows = Array.from({ length: 190 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 100 * Math.pow(index % 2 ? 1.02 : 0.98, Math.floor(index / 2)),
  }));
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "gbm-local.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "TEST" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "local fixture", observedAt: "2026-09-01T00:00:00Z" }, observations: rows })),
  });
  await expect(page.getByText(/single-instrument parametric GBM comparison/)).toBeVisible();
  await page.getByLabel("Simulation model").selectOption("gbm_parametric_comparison");
  await page.getByRole("button", { name: "Run local experiment" }).click();
  await expect(page.getByText(/gbm_parametric_comparison/).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByText(/单一资产参数化 GBM 对比/)).toBeVisible();
  await expect(page.getByText(/并非观测分布、预测、目标价、投资建议或交易场所\/清算结果/)).toBeVisible();
  expect(requests.some((url) => /dataset|quant.*upload/i.test(url))).toBe(false);
});

test("extreme validated prices show histogram refusal without crashing the workbench", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  const rows = Array.from({ length: 40 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: index === 0 ? 1e-300 : 1e300,
  }));
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "extreme.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "TEST" }, quoteCurrency: "USD", clock: "daily_crypto_24_7", provenance: { source: "synthetic fixture", observedAt: "2026-09-01T00:00:00Z" }, observations: rows })),
  });
  await expect(page.getByText(/Observed return histogram unavailable/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observed daily risk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2. Set the experiment" })).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByText(/观察收益直方图不可用/)).toBeVisible();
});

test("stock-token gap series stays local and shows session, corporate-action and oracle-age evidence", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  await page.locator("summary").filter({ hasText: "Stock-token reference gap" }).click();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  const base = {
    schemaVersion: 1,
    instrument: { chainId: 4663, address: "0x0000000000000000000000000000000000000abc", symbol: "SYN" },
    quoteCurrency: "USD",
    referenceQuoteCurrency: "USD",
    sourceName: "PRIVATE_STOCK_SOURCE_CANARY",
    observedAt: "2026-09-03T00:00:00Z",
  };
  const underlying = {
    ...base,
    referenceType: "underlying",
    observations: [
      { timestamp: "2026-08-31T14:00:00Z", dexPrice: "55", referencePrice: "100", multiplier: "0.5", session: "open" },
      { timestamp: "2026-09-01T14:00:00Z", dexPrice: "58", referencePrice: "100", multiplier: "0.5", session: "closed" },
      { timestamp: "2026-09-02T14:00:00Z", dexPrice: "105", referencePrice: "100", multiplier: "1", session: "unknown", corporateAction: { state: "effective", description: "SPLIT_CANARY" } },
    ],
  };
  await page.getByLabel("Paired stock-token gap JSON").setInputFiles({ name: "underlying.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(underlying)) });
  await expect(page.getByRole("img", { name: /Observed stock-token reference gap by session/ })).toBeVisible();
  await expect(page.locator(".opsis-stock-series-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".opsis-stock-series-table tbody tr").first().locator("td").nth(4)).toHaveText("10.0000");
  await expect(page.locator(".opsis-stock-series-table tbody tr").last()).toContainText("Effective: SPLIT_CANARY");
  await expect(page.locator(".opsis-stock-series-table tbody tr").last().locator("td").nth(3)).toHaveText("1");
  await page.locator(".opsis-stock-series-table tbody tr").last().getByRole("button").click();
  await expect(page.getByText(/Selected: 2026-09-02T14:00:00Z/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Oracle age in minutes by observation/ })).toHaveCount(0);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "价差如何随交易时段变化？" })).toBeVisible();
  await expect(page.getByRole("img", { name: /按交易时段显示的股票代币参考价差/ })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator("summary").filter({ hasText: "JSON format and required fields" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { timeout: 3_000 }).toBeLessThanOrEqual(1);

  const oracle = {
    ...base,
    referenceType: "oracle",
    observations: underlying.observations.slice(0, 2).map(({ multiplier, ...row }, index) => {
      void multiplier;
      return { ...row, referencePrice: "50", oracleObservedAt: index === 0 ? "2026-08-31T13:30:00Z" : "2026-09-01T13:45:00Z" };
    }),
  };
  await page.getByLabel("Paired stock-token gap JSON").setInputFiles({ name: "oracle.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(oracle)) });
  await expect(page.getByRole("img", { name: /Oracle age in minutes by observation/ })).toBeVisible();
  await expect(page.locator(".opsis-stock-series-table tbody tr").first().locator("td").nth(4)).toHaveText("10.0000");
  await expect(page.locator(".opsis-stock-series-table tbody tr").first().locator("td").nth(7)).toHaveText("30");
  await page.getByLabel("Paired stock-token gap JSON").setInputFiles({ name: "mismatch.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...oracle, referenceQuoteCurrency: "USDG" })) });
  await expect(page.getByRole("alert").filter({ hasText: /quote currencies must match/ })).toBeVisible();
  await expect(page.locator(".opsis-stock-series-table tbody tr")).toHaveCount(0);
  expect(requests.some((request) => request.includes("PRIVATE_STOCK_SOURCE_CANARY"))).toBe(false);
});

test("joint portfolio keeps three imports and weights local, preserves the shared calendar, and shows numeric bands", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: /Quant research/ }).click();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(`${request.url()}${request.postData() ?? ""}`));
  const rows = Array.from({ length: 190 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 100 + index,
  }));
  const pack = (address: string, symbol: string, observations: typeof rows) => Buffer.from(JSON.stringify({
    PRIVATE_JOINT_CANARY: "PRIVATE_JOINT_CANARY",
    schemaVersion: 1,
    instrument: { chainId: 4663, address, symbol },
    quoteCurrency: "USD",
    clock: "daily_crypto_24_7",
    provenance: { source: "PRIVATE_JOINT_SOURCE_CANARY", observedAt: "2026-09-01T00:00:00Z" },
    synthetic: true,
    observations,
  }));
  await page.getByLabel("CSV or JSON file").setInputFiles({
    name: "first.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000abc", "FIRST", rows),
  });
  await page.getByRole("button", { name: "Add another dataset" }).click();
  await page.getByLabel("Additional asset 1 JSON").setInputFiles({
    name: "second.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "SECOND", rows.map((row) => ({ ...row, price: row.price * 2 }))),
  });
  await expect(page.getByLabel("First asset weight (basis points)")).toHaveValue("5000");
  await expect(page.getByLabel("SECOND weight (basis points)")).toHaveValue("5000");
  await page.getByRole("button", { name: "Inspect observed co-movement" }).click();
  await expect(page.getByText(/189 matched returns/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Observed daily-return correlation heatmap/ })).toBeVisible();
  await expect(page.locator(".opsis-quant-correlation-table tbody tr")).toHaveCount(4);
  await expect(page.locator(".opsis-quant-correlation-table tbody tr").nth(1).locator("td").nth(2)).toHaveText("189");
  await expect(page.locator(".opsis-quant-correlation-table tbody tr").nth(1).locator("td").nth(3)).toHaveText("1");
  await page.getByLabel("First asset weight (basis points)").fill("4000");
  await page.getByLabel("SECOND weight (basis points)").fill("3000");
  await page.getByRole("button", { name: "Add another dataset" }).click();
  await page.getByLabel("Additional asset 2 JSON").setInputFiles({
    name: "third.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000123", "THIRD", rows.map((row) => ({ ...row, price: row.price * 3 }))),
  });
  await page.getByLabel("THIRD weight (basis points)").fill("3000");
  await page.getByRole("button", { name: "Inspect observed co-movement" }).click();
  await expect(page.locator(".opsis-quant-correlation-table tbody tr")).toHaveCount(9);
  await page.getByLabel("Simulation model").selectOption("gbm_parametric_comparison");
  await expect(page.getByText(/Joint portfolio runs require a historical resampling model/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Run joint portfolio locally" })).toBeDisabled();
  await expect(page.getByLabel("First asset weight (basis points)")).toHaveValue("4000");
  await page.getByLabel("Simulation model").selectOption("historical_moving_block_bootstrap");
  await expect(page.getByRole("button", { name: "Run joint portfolio locally" })).toBeEnabled();
  await page.getByLabel("Block length (2–30 days; at most half the sample)").fill("7");
  await page.getByRole("button", { name: "Run joint portfolio locally" }).click();
  await expect(page.getByText(/joint_portfolio_moving_block_bootstrap \(7d\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: /Joint portfolio pointwise fan chart/ })).toBeVisible();
  await expect(page.locator(".opsis-quant-joint-chart + .opsis-table-scroll tbody tr")).toHaveCount(190);
  await expect(page.getByRole("button", { name: "Export joint manifest" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /consent to download all local datasets/i }).check();
  await expect(page.getByRole("button", { name: "Export joint manifest" })).toBeEnabled();
  const [jointDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export joint manifest" }).click(),
  ]);
  const exportedJoint = await readFile(await jointDownload.path());
  expect(JSON.parse(exportedJoint.toString()).datasets).toHaveLength(3);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "联合投资组合实验" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "此样本中哪些资产共同变化？" })).toBeVisible();
  await expect(page.getByRole("img", { name: /观察到的每日收益相关性热力图/ })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(requests.some((request) => request.includes("PRIVATE_JOINT_CANARY"))).toBe(false);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { timeout: 3_000 }).toBeLessThanOrEqual(1);

  await page.getByLabel("First asset weight (basis points)").fill("4500");
  await page.getByLabel("SECOND weight (basis points)").fill("2500");
  await expect(page.getByText(/joint_portfolio_moving_block_bootstrap \(7d\)/)).toHaveCount(0);
  await page.getByRole("button", { name: "Run joint portfolio locally" }).click();
  await expect(page.getByText(/4500bp \/ .*2500bp \/ .*3000bp/)).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("THIRD weight (basis points)").fill("2000");
  await expect(page.getByRole("button", { name: "Run joint portfolio locally" })).toBeDisabled();
  await expect(page.getByText(/must total exactly 10,000/)).toBeVisible();
  await page.getByLabel("THIRD weight (basis points)").fill("3000");

  const shifted = rows.map((row, index) => ({ ...row, date: new Date(Date.UTC(2026, 0, index + 2)).toISOString().slice(0, 10) }));
  await page.getByLabel("Additional asset 1 JSON").setInputFiles({
    name: "shifted.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "SECOND", shifted),
  });
  await expect(page.getByRole("alert").filter({ hasText: /dates must align exactly/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run joint portfolio locally" })).toBeDisabled();
  await page.getByLabel("Additional asset 1 JSON").setInputFiles({
    name: "short.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "SECOND", rows.slice(-40)),
  });
  await expect(page.getByRole("alert").filter({ hasText: /Dates must align exactly/ })).toBeVisible();
  await expect(page.locator(".opsis-quant-correlation-table tbody tr")).toHaveCount(0);
  await page.getByLabel("Additional asset 1 JSON").setInputFiles({
    name: "second-restored.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "SECOND", rows),
  });
  await expect(page.getByLabel("SECOND weight (basis points)")).toBeVisible();
  await page.getByLabel("Additional asset 2 JSON").setInputFiles({
    name: "duplicate.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "DUPLICATE", rows),
  });
  await expect(page.getByRole("alert").filter({ hasText: /distinct chain and contract identity/i })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Quant research/ }).click();
  const replay = page.locator("details").filter({ hasText: "Verify an exported Quant run" });
  await replay.locator("summary").click();
  await replay.getByLabel("Exported run JSON").setInputFiles({ name: "joint-export.json", mimeType: "application/json", buffer: exportedJoint });
  await expect(replay.getByText("Replay matches the exported result.")).toBeVisible();
  await expect(replay).toContainText("joint_portfolio_moving_block_bootstrap");
  expect(requests.some((request) => request.includes("PRIVATE_JOINT_SOURCE_CANARY"))).toBe(false);
});
