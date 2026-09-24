import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const enabled = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.skip(!enabled, "Opsis workspaces are disabled in this test environment");
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/private/opsis/access", (route) => route.fulfill({ json: { expiresAt: new Date(Date.now() + 3_600_000).toISOString(), chainId: 4663, research: true, exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false } }));
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
  await page.getByLabel("Resampling model").selectOption("historical_moving_block_bootstrap");
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

test("joint portfolio keeps both imports and weights local, preserves the shared calendar, and shows numeric bands", async ({ page }) => {
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
  await page.getByLabel("Second asset JSON").setInputFiles({
    name: "second.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "SECOND", rows.map((row) => ({ ...row, price: row.price * 2 }))),
  });
  await page.getByLabel("First asset weight (%)").fill("60");
  await page.getByLabel("Resampling model").selectOption("historical_moving_block_bootstrap");
  await page.getByLabel("Block length (2–30 days; at most half the sample)").fill("7");
  await page.getByRole("button", { name: "Run joint portfolio locally" }).click();
  await expect(page.getByText(/joint_portfolio_moving_block_bootstrap \(7d\)/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: /Joint portfolio pointwise fan chart/ })).toBeVisible();
  await expect(page.locator(".opsis-quant-joint-chart + .opsis-table-scroll tbody tr")).toHaveCount(190);
  await expect(page.getByRole("button", { name: "Export joint manifest" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /consent to download both local datasets/i }).check();
  await expect(page.getByRole("button", { name: "Export joint manifest" })).toBeEnabled();
  const [jointDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export joint manifest" }).click(),
  ]);
  const exportedJoint = await readFile(await jointDownload.path());
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "联合投资组合实验" })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  expect(requests.some((request) => request.includes("PRIVATE_JOINT_CANARY"))).toBe(false);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { timeout: 3_000 }).toBeLessThanOrEqual(1);

  await page.getByLabel("First asset weight (%)").fill("70");
  await expect(page.getByText(/joint_portfolio_moving_block_bootstrap \(7d\)/)).toHaveCount(0);
  await page.getByRole("button", { name: "Run joint portfolio locally" }).click();
  await expect(page.getByText(/FIRST 70% \/ SECOND 30%/)).toBeVisible({ timeout: 10_000 });

  const shifted = rows.map((row, index) => ({ ...row, date: new Date(Date.UTC(2026, 0, index + 2)).toISOString().slice(0, 10) }));
  await page.getByLabel("Second asset JSON").setInputFiles({
    name: "shifted.json", mimeType: "application/json",
    buffer: pack("0x0000000000000000000000000000000000000def", "SECOND", shifted),
  });
  await page.getByRole("button", { name: "Run joint portfolio locally" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /dates must align exactly/i })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Quant research/ }).click();
  const replay = page.locator("details").filter({ hasText: "Verify an exported Quant run" });
  await replay.locator("summary").click();
  await replay.getByLabel("Exported run JSON").setInputFiles({ name: "joint-export.json", mimeType: "application/json", buffer: exportedJoint });
  await expect(replay.getByText("Replay matches the exported result.")).toBeVisible();
  await expect(replay).toContainText("joint_portfolio_moving_block_bootstrap");
  expect(requests.some((request) => request.includes("PRIVATE_JOINT_SOURCE_CANARY"))).toBe(false);
});
