import { test, expect, type Page } from "@playwright/test";
import { fixture, research } from "../apps/web/src/opsis/test-fixtures";
import {
  watchFixture,
  WATCH_TEST_ADDRESS,
  WATCH_TEST_TOKEN,
} from "../apps/web/src/watch/fixture";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
const TOKEN = fixture().input.contract;
const passphrase = "test-only-opsis-reports-passphrase";
const note = "PRIVATE-OPSIS-CONDITION-CANARY";
async function unlockReports(page: Page) {
  await page.getByLabel("History Vault passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock report history" }).click();
  await expect(
    page.getByRole("button", { name: "Lock history" }),
  ).toBeVisible();
}
test.describe("Opsis connected workflows", () => {
  test.skip(!enabled);
  test.beforeEach(async ({ page }) => {
    await page.route("**/v1/private/opsis/access", (r) =>
      r.fulfill({
        json: {
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          chainId: 4663,
          research: true,
          exitCheck: true,
          watch: true,
          rwa: false,
          observedTrades: false,
          perpExecution: false,
        },
      }),
    );
  });
  test("transaction evidence shows a bounded sourced view without inventing movements", async ({ page }) => {
    const hash = `0x${"b".repeat(64)}`;
    const blockHash = `0x${"c".repeat(64)}`;
    const payload = research();
    const citations = ["eth_getTransactionByHash", "eth_getTransactionReceipt"].map((method, index) => ({
      id: `rpc-${index + 1}`,
      provider: "robinhood-public-rpc",
      url: `https://robinhoodchain.blockscout.com/tx/${hash}`,
      fetchedAt: "2026-09-25T01:00:00.000Z",
      fieldsUsed: [index === 1 ? "result.logs" : "result.blockHash"],
      description: method,
    }));
    await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: {
      ...payload,
      entity: { ...payload.entity, type: "transaction", value: hash, facts: {
        hash, from: "0x0000000000000000000000000000000000000001",
        to: "0x0000000000000000000000000000000000000002",
        value: "0xde0b6b3a7640000", valueEth: "1", status: "0x1",
        blockNumber: "0x2a", blockHash, gasUsed: "0x5208",
        transactionEvidenceCoverage: "rpc_pair_block_matched", observationFinality: "current_not_final",
        receiptTransferCoverage: "complete",
        receiptTransferEvents: [
          { emitter: "0x0000000000000000000000000000000000000003", from: "0x0000000000000000000000000000000000000001", to: "0x0000000000000000000000000000000000000002", rawAmount: "900719925474099312345", logIndex: "3" },
          { emitter: "0xnot-an-address", from: "0x0000000000000000000000000000000000000001", to: "0x0000000000000000000000000000000000000002", rawAmount: "99", logIndex: "4" },
        ],
        tokenTransfers: [{ value: "777 token units" }],
      }, citations },
      answer: { ...payload.answer, answer: "A transaction was observed.", facts: {}, confirmedFacts: [], citations },
    } }));
    await page.goto(`/research?entity=${hash}`);
    await page.getByRole("button", { name: "Run research", exact: true }).click();
    const timeline = page.getByTestId("transaction-timeline");
    await expect(timeline).toBeVisible();
    await expect(timeline).toContainText("Current, not final");
    await expect(timeline).toContainText("42");
    await expect(timeline).toContainText("21000");
    await expect(timeline).toContainText(blockHash);
    await expect(timeline).not.toContainText("777 token units");
    const logs = page.getByTestId("receipt-transfer-observations");
    await expect(logs).toContainText("Receipt log observations");
    await expect(logs).toContainText("900719925474099312345");
    await expect(logs.getByText("99", { exact: true })).toHaveCount(0);
    await expect(logs).toContainText("They do not verify ERC-20 token movement");
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await expect(timeline).toContainText("当前观察，尚未最终确认");
    await expect(logs).toContainText("来源报告的 Transfer 形状日志观察");
    expect(await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
  test("receipt log coverage never turns partial or capped data into an absence claim", async ({ page }) => {
    const payload = research();
    const hash = `0x${"d".repeat(64)}`;
    let transferCoverage: "partial" | "capped" = "partial";
    await page.route("**/v1/private/analyze", (route) => route.fulfill({ json: {
      ...payload,
      entity: { ...payload.entity, type: "transaction", value: hash, facts: {
        ...payload.entity.facts, receiptTransferCoverage: transferCoverage,
        receiptTransferEvents: [], transactionEvidenceCoverage: "partial",
      } },
    } }));
    await page.goto(`/research?entity=${hash}`);
    await page.getByRole("button", { name: "Run research", exact: true }).click();
    const logs = page.getByTestId("receipt-transfer-observations");
    await expect(logs).toContainText("Some receipt logs could not be validated");
    await expect(logs).not.toContainText("No matching Transfer-shaped event");
    transferCoverage = "capped";
    await page.reload();
    await page.getByRole("button", { name: "Run research", exact: true }).click();
    await expect(page.getByTestId("receipt-transfer-observations")).toContainText("additional matching logs may be omitted");
    await expect(page.getByTestId("receipt-transfer-observations")).not.toContainText("No matching Transfer-shaped event");
  });
  test("saves research and checks encrypted, reopens only identity, and clears on lock", async ({
    page,
  }) => {
    test.setTimeout(45000);
    const bodies: string[] = [];
    page.on("request", (r) => bodies.push(r.url() + (r.postData() ?? "")));
    let analyses = 0,
      quotes = 0;
    await page.route("**/v1/private/analyze", (r) => {
      analyses++;
      return r.fulfill({ json: research() });
    });
    await page.route("**/v1/private/exit-check/quote", (r) => {
      quotes++;
      return r.fulfill({ json: fixture() });
    });
    await page.goto("/saved");
    await page.getByLabel("VAULT PASSPHRASE", { exact: true }).fill(passphrase);
    await page.getByLabel("CONFIRM PASSPHRASE").fill(passphrase);
    await page.getByRole("button", { name: "CREATE ENCRYPTED VAULT" }).click();
    await page.getByRole("button", { name: /I SAVED IT/i }).click();
    await page.getByRole("link", { name: "Research", exact: true }).click();
    await page.locator("#research-entity").fill(TOKEN);
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    await expect(page.getByTestId("opsis-research-result")).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Save research / open saved reports" })
      .click();
    await unlockReports(page);
    await page
      .getByLabel("Notes or conditions to revisit (optional)")
      .fill(note);
    await page
      .getByRole("button", { name: "Save observation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saved on this device" }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Open saved reports" }).click();
    await expect(page.getByText(note, { exact: false })).toHaveCount(0);
    await unlockReports(page);
    await page.getByRole("button", { name: /^Fixture Token/ }).click();
    await expect(
      page.getByText(`My notes / conditions: ${note}`, { exact: true }),
    ).toBeVisible();
    const fresh = page.getByRole("link", { name: "Run a new trade check" });
    await expect(fresh).toHaveAttribute("href", `/check?entity=${TOKEN}`);
    await fresh.click();
    await expect(page.getByLabel("Amount to check")).toHaveValue("");
    expect(quotes).toBe(0);
    await page.getByLabel("Amount to check").fill("1.5");
    await page
      .getByRole("button", { name: "Run a check", exact: true })
      .click();
    await expect(page.getByTestId("opsis-quote")).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Save this check / revisit conditions" })
      .click();
    await unlockReports(page);
    await page
      .getByRole("button", { name: "Save observation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saved on this device" }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Open saved reports" }).click();
    await page.reload();
    await unlockReports(page);
    await page
      .getByRole("button", { name: /^Trade Check · Robinhood Chain/ })
      .click();
    await expect(page.getByText(/Original expiry:/)).toContainText(
      "request a new quote",
    );
    await expect(page.getByText(/1.5 tokens →/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "output/opsis-wiring/saved-mobile.png",
      fullPage: true,
    });
    expect(
      await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    const encrypted = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const req = indexedDB.open("chainscout-private-vault");
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const r = db.transaction("records").objectStore("records").getAll();
            r.onsuccess = () => {
              resolve(JSON.stringify(r.result));
              db.close();
            };
            r.onerror = () => reject(r.error);
          };
        }),
    );
    for (const value of [note, passphrase, "1.5 tokens", "Fixture observation"])
      expect(encrypted).not.toContain(value);
    expect(bodies.join("\n")).not.toContain(note);
    expect(bodies.join("\n")).not.toContain(passphrase);
    expect(analyses).toBe(1);
    expect(quotes).toBe(1);
    await page.getByRole("button", { name: "Lock history" }).click();
    await expect(page.getByText(/1.5 tokens →/)).toHaveCount(0);
    await page.getByLabel("History Vault passphrase").fill("wrong-password");
    await page.getByRole("button", { name: "Unlock report history" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(/1.5 tokens →/)).toHaveCount(0);
  });
  test("Watch changes reopen a token check without sending balances or labels", async ({
    page,
  }) => {
    let count = 0,
      quotes = 0;
    await page.route("**/v1/private/watch/snapshot", (r) => {
      count++;
      return r.fulfill({ json: watchFixture(99 + count) });
    });
    await page.route("**/v1/private/exit-check/quote", (r) => {
      quotes++;
      return r.abort();
    });
    await page.goto("/watch");
    await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
    await page
      .getByLabel("Confirm passphrase", { exact: true })
      .fill(passphrase);
    await page
      .getByRole("button", { name: "Create encrypted watchlist" })
      .click();
    await page.getByRole("button", { name: "I saved my recovery key" }).click();
    const add = page.getByRole("region", { name: "Add a wallet to watch" });
    if (!(await add.getByLabel("Public Robinhood wallet address").isVisible()))
      await add.locator("summary").click();
    await add
      .getByLabel("Public Robinhood wallet address")
      .fill(WATCH_TEST_ADDRESS);
    await add.getByLabel("Private label (optional)").fill(note);
    await add.getByLabel("Allow this public-address lookup").check();
    await add.getByRole("button", { name: "Save wallet & check" }).click();
    await page
      .getByRole("button", { name: "Wallet details", exact: true })
      .click();
    const detail = page.getByRole("region", { name: "Latest saved check" });
    await expect(page.getByRole("heading", { name: note })).toBeVisible();
    await detail.getByLabel("Allow this public-address lookup").check();
    await detail.getByRole("button", { name: "Refresh public data" }).click();
    const link = page.getByRole("link", { name: "Check a new amount" }).first();
    await expect(link).toHaveAttribute(
      "href",
      `/check?entity=${WATCH_TEST_TOKEN}`,
    );
    await link.click();
    await expect(page.getByLabel("Token contract · chain 4663")).toHaveValue(
      WATCH_TEST_TOKEN,
    );
    await expect(page.getByLabel("Amount to check")).toHaveValue("");
    expect(quotes).toBe(0);
  });
  test("legacy routing, no-vault setup, and provider failures remain explicit", async ({
    page,
  }) => {
    await page.goto("/vault?view=portfolio&note=private&amount=99");
    await expect(page).toHaveURL(/\/saved\?view=portfolio$/);
    await page.goto(`/research?entity=${TOKEN}`);
    await page
      .locator("summary")
      .filter({ hasText: "Save research / open saved reports" })
      .click();
    await expect(
      page.getByRole("link", {
        name: "Create encrypted Vault to save reports",
      }),
    ).toBeVisible();
    await page.route("**/v1/private/analyze", (r) =>
      r.fulfill({
        status: 503,
        json: { error: { code: "PROVIDER_UNAVAILABLE" } },
      }),
    );
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Research unavailable");
    await expect(page.getByTestId("research-rpc-coverage")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save observation", exact: true }),
    ).toHaveCount(0);
    await page
      .locator("summary")
      .filter({ hasText: "More research tools" })
      .click();
    await page
      .getByRole("link", { name: "Detailed Explorer", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/research/details\\?entity=${TOKEN}$`),
    );
  });

  test("shows limited RPC coverage while keeping research controls available", async ({
    page,
  }) => {
    const address = `0x${"4".repeat(40)}`;
    await page.route("**/v1/private/analyze", (route) =>
      route.fulfill({
        json: {
          mode: "private",
          entity: {
            chainId: 4663,
            type: "contract",
            value: address,
            facts: {
              codePresent: true,
              nativeBalanceEth: "0",
              verified: null,
              activityCoverage: "unavailable",
              observation: "latest_rpc_sample",
              sourceCoverage: "unavailable",
            },
            citations: [],
            riskNotes: [],
          },
          answer: {
            answer: "The available evidence is partial.",
            summaryBullets: [],
            confirmedFacts: [],
            inferences: [],
            uncertainty: ["Metadata is unavailable."],
            riskNotes: [],
            citations: [],
            suggestedQuestions: [],
            suggestedFollowUps: [],
            facts: {
              codePresent: true,
              nativeBalanceEth: "0",
              verified: null,
              activityCoverage: "unavailable",
              observation: "latest_rpc_sample",
              sourceCoverage: "unavailable",
            },
          },
          privacy: {
            accountRequired: false,
            walletConnectionRequired: false,
            serverStorage: "none",
            browserStorage: "memory_only",
            clearsOnReload: true,
            modelProvider: "none",
            providerDestinations: ["blockscout", "robinhood-public-rpc"],
            disclosure: "Public identifier only.",
          },
        },
      }),
    );
    await page.goto(`/research?entity=${address}`);
    await page
      .getByRole("button", { name: "Run research", exact: true })
      .click();
    await expect(page.getByTestId("research-rpc-coverage")).toContainText(
      "LIMITED RPC COVERAGE",
    );
    await expect(
      page.getByText("Save research / open saved reports"),
    ).toBeVisible();
  });
});
