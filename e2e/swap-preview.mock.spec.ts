import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { SwapQuote } from "../apps/web/src/swap/api";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const opsis = process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
const publicAccess = process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const previewKey = "a".repeat(64);
const walletRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Unmatched API calls and external destinations must never reach a real provider.
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  await page.route("**/v1/**", route => route.fulfill({ status: 503, json: { error: { code: "UNMOCKED", message: "No fixture for this API" } } }));
  await page.route("**/v1/private/opsis/access", async route => {
    expect(route.request().postDataJSON()).toEqual({});
    expect(route.request().headers().authorization).toBe(publicAccess ? undefined : `Preview ${previewKey}`);
    // Match the browser's access-session clock, including the skewed-clock test.
    const now = await page.evaluate(() => Date.now());
    await route.fulfill({ json: {
      expiresAt: new Date(now + 3_600_000).toISOString(), chainId: 4663,
      research: false, exitCheck: false, watch: false, rwa: false,
      observedTrades: false, swapPreview: true, perpExecution: false,
    } });
  });
  const requests: string[] = [];
  walletRequests.set(page, requests);
  await page.exposeFunction("recordPreviewWalletRequest", (method: string) => requests.push(method));
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", { value: {
      request: async ({ method }: { method: string }) => {
        await (window as unknown as { recordPreviewWalletRequest: (method: string) => Promise<void> }).recordPreviewWalletRequest(method);
        throw new Error("A read-only preview must not request a wallet");
      },
    } });
  });
});

test.afterEach(async ({ page }) => {
  expect(walletRequests.get(page), "No wallet method may be requested").toEqual([]);
});

async function openPreview(page: Page, path: string) {
  await page.goto(path);
  await unlockPreview(page);
}

async function unlockPreview(page: Page) {
  if (opsis && !publicAccess) {
    await page.getByLabel("Preview access key", { exact: true }).fill(previewKey);
    await page.getByRole("button", { name: "Open preview", exact: true }).click();
  }
  if (opsis) {
    // The workspace navigation collapses behind the menu on phones; the page's main content proves it opened.
    const narrow = (page.viewportSize()?.width ?? 1280) < 768;
    if (narrow) await expect(page.locator("main").first()).toBeVisible();
    else await expect(page.getByRole("navigation", { name: "Workspaces", exact: true })).toBeVisible();
  }
}

test("trade simulator one-click example exports a private-by-default PNG and clears it on edit", async ({ page }) => {
  test.skip(process.env.VITE_TRADE_SIMULATOR_ENABLED !== "true", "preview flag required");
  const nginx = await readFile("apps/web/nginx.conf", "utf8");
  const imagePolicy = nginx.match(/img-src [^;]+/)?.[0];
  expect(imagePolicy).toBe("img-src 'self' data:");
  // Apply the actual production image directive; Vite's dev-only inline preamble
  // cannot use the production script directive. Production policy is not changed.
  await page.route("**/simulate", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "Content-Security-Policy": `${imagePolicy};` } });
  });
  let calls = 0;
  await page.route("**/v1/private/trade-simulator/quote", async route => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({ direction: "WETH_TO_USDG", amount: "0.01" });
    expect(route.request().headers().cookie).toBeUndefined();
    await route.fulfill({ json: quoteFixture() });
  });
  // /simulate is still the Trade scenarios route in the Opsis shell.
  await openPreview(page, "/simulate");
  if (opsis) await expect(page).toHaveTitle("Opsis · Trade scenarios");
  expect(calls).toBe(0);
  await expect(page.getByText(/Examples use 1 WETH/)).toBeVisible();
  await page.getByRole("button", { name: "Try 0.01 WETH → USDG" }).click();
  const card = page.getByRole("region", { name: "Trade Card", exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByText("36.45 USDG", { exact: true })).toBeVisible();
  await expect(card.getByRole("status")).toHaveText("Single-pool quote only; no full transaction simulation.");
  await expect(page.getByRole("region", { name: "On-chain quote evidence", exact: true })).toContainText("Quote at block 4660");
  await expect(page.getByLabel("Include my entered balances in the image")).not.toBeChecked();
  await page.getByRole("button", { name: "Create share card" }).click();
  await expect(card.getByRole("img")).toBeVisible();
  await expect(card.getByRole("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect.poll(() => card.getByRole("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1200);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("opsis-trade-card.png");
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(1200);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  if (process.env.OPSIS_CARD_SHOT) {
    await page.getByRole("img", { name: /Your Trade Card preview/ }).screenshot({ path: process.env.OPSIS_CARD_SHOT });
  }
  await page.getByLabel("Include my entered balances in the image").check();
  await expect(card.getByRole("link", { name: "Download PNG" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create share card" }).click();
  await expect(card.getByRole("img")).toBeVisible();
  expect(calls).toBe(1);
  await page.getByLabel("Trade amount", { exact: true }).fill("0.02");
  await expect(card).toHaveCount(0);
});

test("trade simulator reverse example, expiry, provider failure and export failure remain honest", async ({ page }) => {
  test.skip(process.env.VITE_TRADE_SIMULATOR_ENABLED !== "true", "preview flag required");
  let fail = false;
  await page.route("**/v1/private/trade-simulator/quote", async route => {
    expect(route.request().postDataJSON()).toEqual({ direction: "USDG_TO_WETH", amount: "25" });
    if (fail) { await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE", message: "Quotes temporarily unavailable" } } }); return; }
    await route.fulfill({ json: quoteFixture({ source: "uniswap-api", reverse: true, warning: true }) });
  });
  await page.clock.install();
  await openPreview(page, "/simulate");
  await page.getByRole("button", { name: "Try 25 USDG → WETH" }).click();
  const card = page.getByRole("region", { name: "Trade Card", exact: true });
  await expect(card.getByText("0.007 WETH", { exact: true })).toBeVisible();
  await expect(card.getByText(/Provider check returned a warning/)).toBeVisible();
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); }; });
  await page.getByRole("button", { name: "Create share card" }).click();
  await expect(card.getByRole("alert")).toHaveText("Image export failed. Please try again.");
  await expect(card.getByRole("link", { name: "Download PNG" })).toHaveCount(0);
  await page.clock.fastForward(31000);
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("expired");
  fail = true;
  await page.getByRole("button", { name: "Try 25 USDG → WETH" }).click();
  await expect(page.getByRole("alert")).toContainText("The service is unavailable right now");
  await expect(card).toHaveCount(0);
});

test("trade simulator compares quantities, keeps balances private and invalidates edits", async ({ page }) => {
  test.skip(process.env.VITE_TRADE_SIMULATOR_ENABLED !== "true", "preview flag required");
  await page.route("**/v1/private/trade-simulator/quote", async route => {
    expect(route.request().postDataJSON()).toEqual({ direction: "WETH_TO_USDG", amount: "0.01" });
    await route.fulfill({ json: quoteFixture() });
  });
  await openPreview(page, opsis ? "/saved?view=assets" : "/vault");
  await page.getByLabel("VAULT PASSPHRASE").fill("trade preview test passphrase");
  await page.getByLabel("CONFIRM PASSPHRASE").fill("trade preview test passphrase");
  await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
  await page.getByRole("button", { name: /I SAVED IT/i }).click();
  await openPreview(page, "/simulate");
  await page.getByLabel("History Vault passphrase").fill("trade preview test passphrase");
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(page.getByRole("button", { name: "Lock history" })).toBeVisible();
  await page.getByLabel("Your WETH balance", { exact: true }).fill("1");
  await page.getByLabel("Your USDG balance", { exact: true }).fill("100");
  await page.getByLabel("WETH reference price in USDG").fill("3645");
  await page.getByRole("button", { name: "Request quote & compare" }).click();
  const table = page.getByRole("table", { name: "Two-token allocation at your entered reference—not USD valuation or profit.", exact: true });
  await expect(table.getByRole("row", { name: "Before 1 100 97.32%", exact: true })).toBeVisible();
  await expect(table.getByRole("row", { name: "Expected after 0.99 136.45 96.35%", exact: true })).toBeVisible();
  await expect(table.getByRole("row", { name: "Minimum after 0.99 136.26775 96.36%", exact: true })).toBeVisible();
  await expect(page.getByText(/Liquidity-provider, protocol and token-specific fees may also apply/)).toBeVisible();
  await expect(page.getByText(/minimum output is not a total-cost guarantee/)).toBeVisible();
  if (process.env.OPSIS_PREVIEW_SHOT) await page.screenshot({ path: process.env.OPSIS_PREVIEW_SHOT, fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `preview must reflow at ${width}px`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Save encrypted scenario report" }).click();
  await expect(page.getByText("Saved encrypted on this device.", { exact: true })).toBeVisible();
  await page.getByLabel("Trade amount").fill("0.02");
  await expect(page.getByRole("heading", { name: "Before and after" })).toHaveCount(0);
  await page.reload();
  await unlockPreview(page);
  await page.getByLabel("History Vault passphrase").fill("trade preview test passphrase");
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(page.getByRole("button", { name: /^Trade scenario: 0.01 WETH/ })).toBeVisible();
  await page.getByRole("button", { name: /^Trade scenario: 0.01 WETH/ }).click();
  await expect(page.getByText(/Historical what-if report, not a live quote/)).toBeVisible();
});

type QuoteOptions = {
  source?: "onchain" | "uniswap-api";
  stale?: boolean;
  warning?: boolean;
  reverse?: boolean;
  freshForMs?: number;
};

function quoteFixture({ source = "onchain", stale = false, warning = false, reverse = false, freshForMs = 30_000 }: QuoteOptions = {}): SwapQuote {
  const now = Date.now();
  const quotedAt = stale ? now - 65_000 : now - (30_000 - freshForMs);
  const onchain = source === "onchain";
  const input = reverse ? { symbol: "USDG" as const, address: USDG, amount: "25" } : { symbol: "WETH" as const, address: WETH, amount: "0.01" };
  const output = reverse
    ? { symbol: "WETH" as const, address: WETH, amount: "0.007", minimumReceived: "0.006965" }
    : { symbol: "USDG" as const, address: USDG, amount: "36.45", minimumReceived: "36.26775" };
  return {
    pair: "WETH/USDG",
    chain: { id: 4663, name: "Robinhood Chain" },
    input,
    output: { ...output, minimumSource: onchain ? "derived_tolerance" : "provider" },
    route: { routing: "CLASSIC", label: onchain ? "Uniswap v3 · single pool (fee 0.05%)" : "[v3] 100.00% = [0.05%] 0x1111111111111111111111111111111111111111", protocols: ["V3"] },
    priceImpactPercent: 0.04,
    slippageTolerancePercent: 0.5,
    estimatedGas: { nativeAmount: onchain ? "0.0001" : "0.000012", usdAmount: onchain ? "0.2" : "0.004958764702551881", paidBy: "user" },
    simulation: onchain
      ? { status: "warning", reasons: ["Single-pool quote only; no wallet or full transaction simulation."] }
      : warning ? { status: "warning", reasons: ["SIMULATION_UNAVAILABLE"] }
      : { status: "passed", reasons: [] },
    approvalMayBeRequired: true,
    transactionPreview: {
      explanationOnly: true,
      unsigned: true,
      chainId: 4663,
      sender: null,
      target: "0x8876789976decbfcbbbe364623c63652db8c0904",
      action: `Execute an exact-input swap for ${input.amount} ${input.symbol} → at least ${output.minimumReceived} ${output.symbol}`,
      canSign: false,
      canBroadcast: false,
    },
    quotedAt: new Date(quotedAt).toISOString(),
    expiresAt: new Date(quotedAt + 30_000).toISOString(),
    freshForMs: stale ? 0 : freshForMs,
    provider: { name: "Uniswap", requestId: "mock-quote", cached: false },
    handoffUrl: `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=${input.address}&outputCurrency=${output.address}&field=input&value=${input.amount}&theme=dark`,
    ...(onchain ? { onchain: {
      blockNumber: 4660, blockHash: `0x${"ab".repeat(32)}`, capturedAtMs: quotedAt,
      poolAddress: "0x1111111111111111111111111111111111111111", feeTier: 500 as const,
      lpFeeAmount: reverse ? "0.0125" : "0.000005", gasEstimate: "100000", gasPriceWei: "1000000000",
      networkFeeEth: "0.0001", ethUsd: "2000", ethUsdObservedAt: new Date(quotedAt - 5000).toISOString(),
      nativeSide: null, rpcProvider: "drpc" as const,
    } } : {}),
    disclosures: onchain ? [
      "Single-pool estimate. Uniswap's app may route differently and show a different price.",
      "Quote at block 4660. Standard Uniswap V3 fee tiers only; no multi-pool routing, UniswapX or permit paths.",
      "Network fee is an estimate you pay: QuoterV2 gas estimate × gas price observed at quote time. Approval, wrapping and chain-specific execution costs may be additional.",
      "Network fee USD uses Chainlink ETH / USD at the quote block. No sequencer-uptime feed is checked; oracle health coverage is limited.",
      "Price impact includes the pool fee against the same-block pre-fee spot price. The input-side LP fee is a floor estimate; exact charges can differ with V3 rounding.",
      "You pay network, liquidity-provider and any protocol or token-specific fees. Minimum output is not a total-cost guarantee or proof of transferability.",
      "Only the pair, amount and public contract reads go to the dRPC Robinhood Chain gateway. dRPC is a paid gateway that may route reads to independent node operators. No wallet address is requested.",
      "Opsis holds the pair and amount in a short quote cache for less than 30 seconds. No historical transaction or account is linked to it.",
      "Opsis cannot sign, approve, submit or broadcast. The official Uniswap app independently requotes and owns execution.",
    ] : [
      "Uniswap fetches a new quote before execution; this preview is not a guaranteed price.",
      "You may pay network gas, liquidity-provider or protocol fees, price impact, slippage, and token-specific fees.",
      "Your wallet address is not sent for this preview; Uniswap receives the pair, amount, and a fixed non-user preview address.",
      "Opsis may hold this pair and amount in a short quote cache for less than 30 seconds; no historical transaction or account is linked to it.",
      "Opsis cannot sign, approve, submit, or broadcast this transaction.",
    ],
  };
}

async function mockQuote(page: Page, options: QuoteOptions & { fail?: boolean; waitForResponse?: Promise<void> } = {}) {
  let calls = 0;
  await page.route("**/v1/swaps/quote", async (route) => {
    calls += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ direction: "WETH_TO_USDG", amount: "0.01" });
    expect(route.request().headers().cookie).toBeUndefined();
    if (options.waitForResponse) await options.waitForResponse;
    if (options.fail) {
      await route.fulfill({
        status: 503,
        json: { error: { code: "SWAP_RATE_LIMITED", message: "Live quotes are cooling down" } },
      });
      return;
    }
    await route.fulfill({ json: quoteFixture(options) });
  });
  return () => calls;
}

for (const source of ["onchain", "uniswap-api"] as const) {
  test(`Swap preview explains a fresh ${source} quote and hands off only to official Uniswap`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    let releaseQuote!: () => void;
    const waitForResponse = new Promise<void>(resolve => { releaseQuote = resolve; });
    const calls = await mockQuote(page, { source, waitForResponse });
    let handoffs = 0;
    const expectedUrl = quoteFixture({ source }).handoffUrl;
    await context.route("https://app.uniswap.org/**", route => {
      handoffs++;
      expect(route.request().isNavigationRequest()).toBe(true);
      expect(route.request().url()).toBe(expectedUrl);
      return route.fulfill({ contentType: "text/html", body: "<title>Official handoff fixture</title>" });
    });
    await openPreview(page, "/swap");

    if (opsis) {
      await expect(page).toHaveTitle("Opsis · Swap preview");
      await expect(page.getByRole("heading", { name: "See what the swap costs.", exact: true })).toBeVisible();
    } else {
      await expect(page).toHaveTitle("Swap preview | Opsis");
      await expect(page.getByRole("heading", { name: /See the trade/i })).toBeVisible();
      await expect(page.getByText("Swap preview · read-only preview", { exact: true })).toBeVisible();
      await expect(page.getByText(/official Uniswap app requotes and handles every approval, signature and transaction/)).toBeVisible();
      await expect(page.getByText("NO WALLET DATA")).toBeVisible();
    }
    await expect(page.getByText("No wallet is requested or shared. The official Uniswap app handles wallet context only after you choose to continue.", { exact: true })).toBeVisible();
    expect(calls()).toBe(0);
    await page.getByLabel("Wrapped Ether").fill("0.01");
    await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

    await expect(page.getByTestId("swap-loading")).toBeVisible();
    await expect(page.getByTestId("swap-quote")).toHaveCount(0);
    await expect(page.getByTestId("swap-receive-amount")).toHaveText("Calculated live");
    releaseQuote();
    const quote = page.getByTestId("swap-quote");
    await expect(quote).toBeVisible();
    await expect(quote.getByText("36.45 USDG", { exact: true })).toBeVisible();
    // The "You receive" field shows the same quoted estimate as the card.
    await expect(page.getByTestId("swap-receive-amount")).toHaveText("36.45");
    await expect(page.getByText("YOU RECEIVE · ESTIMATE", { exact: true })).toBeVisible();
    await expect(quote.getByText("36.26775 USDG", { exact: true })).toBeVisible();
    await expect(quote.getByText(source === "onchain" ? "Derived preview floor · 0.5% tolerance" : "Uniswap minimum · 0.5% tolerance", { exact: true })).toBeVisible();
    await expect(quote.getByText("0.04%", { exact: true })).toBeVisible();
    await expect(quote.getByText(source === "onchain" ? "$0.20" : "$0.004959", { exact: true })).toBeVisible();
    await expect(quote.getByText("$0.004958764702551881", { exact: true })).toHaveCount(0);
    if (source === "onchain") {
      const evidence = quote.getByRole("region", { name: "On-chain quote evidence", exact: true });
      await expect(evidence).toContainText("Quote at block 4660");
      await expect(evidence).toContainText("Pool: 0x1111111111111111111111111111111111111111");
      await expect(evidence).toContainText("LP fee estimate: 0.000005 WETH (0.05%)");
      await expect(evidence).toContainText("Network fee estimate you pay: 0.0001 ETH · 0.2 USD.");
      await expect(evidence).toContainText("Chainlink ETH / USD at the quote block: 2000 USD.");
      await expect(quote.getByText("Provider route check passed", { exact: true })).toHaveCount(0);
    } else {
      await expect(quote.getByText("Provider route check passed", { exact: true })).toBeVisible();
      await expect(quote.getByRole("region", { name: "On-chain quote evidence", exact: true })).toHaveCount(0);
    }
    await expect(quote.getByText("CANNOT SIGN / SEND", { exact: true })).toBeVisible();
    await expect(quote.getByText("NOT SHARED", { exact: true })).toBeVisible();
    await expect(quote.getByRole("listitem")).toHaveText(quoteFixture({ source }).disclosures.map(text => `— ${text}`));
    const handoff = quote.getByRole("link", { name: source === "onchain" ? /^OPEN UNISWAP FOR A NEW QUOTE/ : /^CONTINUE IN OFFICIAL UNISWAP/ });
    await expect(handoff).toHaveAttribute("href", expectedUrl);
    await expect(handoff).toHaveAttribute("target", "_blank");
    await expect(handoff).toHaveAttribute("rel", /noreferrer/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    if (process.env.QA_SCREENSHOTS === "1") {
      await page.screenshot({ path: `output/qa/swap-preview-${source}-desktop.png`, fullPage: true });
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `quote must reflow at ${width}px`).toBeLessThanOrEqual(1);
      await handoff.scrollIntoViewIfNeeded();
      await expect(handoff).toBeInViewport();
    }
    expect(calls()).toBe(1);
    expect(handoffs, "No venue request before an explicit click").toBe(0);
    const popupPromise = page.waitForEvent("popup");
    await handoff.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(expectedUrl);
    await expect(popup).toHaveTitle("Official handoff fixture");
    expect(handoffs).toBe(1);
    expect(calls()).toBe(1);
    await popup.close();
    await page.getByLabel("Wrapped Ether", { exact: true }).fill("0.02");
    await expect(quote).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^(OPEN UNISWAP FOR A NEW QUOTE|CONTINUE IN OFFICIAL UNISWAP)/ })).toHaveCount(0);
  });
}

for (const width of [1024, 1100, 1279, 1280]) {
  test(`Swap preview form and results remain separate while scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockQuote(page);
    await openPreview(page, "/swap");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "GET LIVE PREVIEW", exact: true }) });
    const result = form.locator("+ div");

    const expectSeparatePanels = async () => {
      await page.evaluate(() => window.scrollTo({ top: 750, behavior: "instant" }));
      await expect.poll(async () => {
        const formBox = await form.boundingBox();
        const resultBox = await result.boundingBox();
        if (!formBox || !resultBox) return false;
        return width < 1280
          ? formBox.y + formBox.height <= resultBox.y
          : formBox.x + formBox.width <= resultBox.x;
      }, { message: "The form must not overlap the result panel after scrolling" }).toBe(true);
      await expect(form).toHaveCSS("position", width < 1280 ? "static" : "sticky");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    };

    // Cover the empty panel as well as the taller, populated quote.
    await expectSeparatePanels();
    await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
    await expect(page.getByTestId("swap-quote")).toBeVisible();
    await expectSeparatePanels();
  });
}

test("expired data is never presented as a current quote", async ({ page }) => {
  await mockQuote(page, { stale: true });
  await page.clock.install();
  await openPreview(page, "/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

  await expect(page.getByText("PREVIEW EXPIRED — NOT A CURRENT QUOTE")).toBeVisible();
  await expect(page.getByRole("link", { name: /OPEN UNISWAP FOR A NEW QUOTE/i })).toBeVisible();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toHaveCount(0);
  // Also cover a current quote becoming expired after its provider lifetime.
  await mockQuote(page);
  await page.getByRole("button", { name: "GET LIVE PREVIEW", exact: true }).click();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.getByText("PREVIEW EXPIRED — NOT A CURRENT QUOTE", { exact: true })).toBeVisible();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^OPEN UNISWAP FOR A NEW QUOTE/ })).toHaveAttribute("href", quoteFixture().handoffUrl);
});

test("provider failure degrades to a clear official-app path on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockQuote(page, { fail: true });
  await openPreview(page, "/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();

  await expect(page.getByTestId("swap-error")).toContainText("cooling down for a minute");
  const fallback = page.getByRole("link", { name: /OPEN OFFICIAL UNISWAP FOR A NEW QUOTE/i });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("href", /^https:\/\/app\.uniswap\.org\/swap\?chain=robinhood&/);
  await expect(fallback).toHaveAttribute("href", quoteFixture().handoffUrl);
  await expect(page.getByTestId("swap-quote")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  if (process.env.QA_SCREENSHOTS === "1") {
    await page.screenshot({ path: "output/qa/swap-preview-mobile-fallback.png", fullPage: true });
  }
});

test("freshness is anchored to receipt time, not the user's wall clock", async ({ page }) => {
  await page.clock.install({ time: new Date("2099-12-31T12:00:00.000Z") });
  // An already-aged provider response has only five seconds remaining, even
  // though the browser's wall clock is decades ahead of the quote timestamps.
  await mockQuote(page, { freshForMs: 5_000 });
  await openPreview(page, "/swap");
  expect(await page.evaluate(() => new Date().getUTCFullYear())).toBe(2099);
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toBeVisible();
  await expect(page.getByText("PREVIEW EXPIRED — NOT A CURRENT QUOTE")).toHaveCount(0);
  await page.clock.fastForward(5_250);
  await expect(page.getByText("PREVIEW EXPIRED — NOT A CURRENT QUOTE", { exact: true })).toBeVisible();
  await expect(page.getByText(/LIVE PREVIEW ·/)).toHaveCount(0);
});

test("a limited generic preview is never described as a passed wallet simulation", async ({ page }) => {
  await mockQuote(page, { source: "uniswap-api", warning: true });
  await openPreview(page, "/swap");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
  await expect(page.getByText("Preview simulation limited — Uniswap rechecks")).toBeVisible();
  await expect(page.getByText("Provider route check passed")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^CONTINUE IN OFFICIAL UNISWAP/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^OPEN UNISWAP FOR A NEW QUOTE/ })).toHaveAttribute("href", quoteFixture().handoffUrl);
});

test("the You receive field resets on any edit after a quote", async ({ page }) => {
  await mockQuote(page, { source: "onchain" });
  await openPreview(page, "/swap");
  await page.getByLabel("Wrapped Ether").fill("0.01");
  await page.getByRole("button", { name: "GET LIVE PREVIEW" }).click();
  await expect(page.getByTestId("swap-receive-amount")).toHaveText("36.45");
  await page.getByLabel("Wrapped Ether").fill("0.02");
  await expect(page.getByTestId("swap-receive-amount")).toHaveText("Calculated live");
  await expect(page.getByTestId("swap-quote")).toHaveCount(0);
});
