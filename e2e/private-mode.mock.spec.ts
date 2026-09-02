import { expect, test, type Page } from "@playwright/test";
import { APP_ORIGIN } from "./support/origin";

const address = "0x0000000000000000000000000000000000000042";
const timestamp = "2026-08-10T12:00:00.000Z";

async function installWalletCanary(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("rh_auth", JSON.stringify({
      accessToken: "legacy-access-canary",
      refreshToken: "legacy-refresh-canary"
    }));
    (window as Window & { __walletCalls?: string[]; ethereum?: unknown }).__walletCalls = [];
    (window as Window & { __walletCalls?: string[]; ethereum?: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as Window & { __walletCalls?: string[] }).__walletCalls?.push(method);
        return [];
      },
      on: () => undefined,
      removeListener: () => undefined
    };
  });
}

test("Private Mode needs no account or wallet, renders citations, and clears on reload", async ({ page }) => {
  await installWalletCanary(page);
  const apiPaths: string[] = [];
  const externalOrigins = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/")) apiPaths.push(url.pathname);
    if (url.origin !== APP_ORIGIN) externalOrigins.add(url.origin);
  });
  await page.route("**/v1/private/analyze", async (route) => {
    expect(route.request().headers()["x-chainscout-csrf"]).toBe("1");
    expect(route.request().postDataJSON()).toMatchObject({ entity: address, entityType: "unknown" });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      json: {
        mode: "private",
        entity: {
          chainId: 4663,
          type: "wallet",
          value: address,
          facts: {
            address,
            explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
            nativeBalanceEth: "0.25",
            transactionsFetched: 2,
            tokenBalances: []
          },
          citations: [{
            id: "private-source-1",
            provider: "blockscout",
            url: `https://robinhoodchain.blockscout.com/address/${address}`,
            description: "Public wallet activity",
            fetchedAt: timestamp,
            fieldsUsed: ["transactionsFetched"]
          }],
          riskNotes: []
        },
        answer: {
          answer: "This wallet has two recent public transactions on Robinhood Chain.",
          facts: {
            address,
            explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
            nativeBalanceEth: "0.25",
            transactionsFetched: 2,
            tokenBalances: []
          },
          summaryBullets: ["2 transactions — a small public activity sample."],
          confirmedFacts: [],
          inferences: [],
          uncertainty: ["Provider indexing can lag."],
          riskNotes: [],
          citations: [{
            id: "private-source-1",
            provider: "blockscout",
            url: `https://robinhoodchain.blockscout.com/address/${address}`,
            description: "Public wallet activity",
            fetchedAt: timestamp,
            fieldsUsed: ["transactionsFetched"]
          }],
          suggestedQuestions: []
        },
        privacy: {
          accountRequired: false,
          walletConnectionRequired: false,
          serverStorage: "none",
          browserStorage: "memory_only",
          clearsOnReload: true,
          modelProvider: "none",
          providerDestinations: ["blockscout"],
          disclosure: "Only the public chain identifier was sent to Blockscout. The question was not sent to a model provider."
        }
      }
    });
  });

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Leave no profile behind/i })).toBeVisible();
  expect(apiPaths).toEqual([]);
  expect(await page.evaluate(() => (window as Window & { __walletCalls?: string[] }).__walletCalls)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("rh_auth"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect([...externalOrigins].filter((origin) => origin.includes("google") || origin.includes("gstatic"))).toEqual([]);

  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByTestId("resolving-answer-card")).toBeVisible();
  await expect(page.getByText("This wallet has two recent public transactions on Robinhood Chain.")).toBeVisible();
  await expect(page.getByText("DETERMINISTIC ANSWER · CITED")).toBeVisible();
  await expect(page.getByTestId("privacy-receipt")).toContainText("BLOCKSCOUT");
  expect(apiPaths).toEqual(["/v1/private/analyze"]);
  expect(await page.evaluate(() => document.cookie)).not.toContain("chainscout_");

  await page.reload();
  await expect(page.getByText("THIS VIEW IS EPHEMERAL")).toBeVisible();
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  expect(apiPaths).toEqual(["/v1/private/analyze"]);
});

test("Private Mode validates locally and shows bounded provider failures on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let calls = 0;
  await page.route("**/v1/private/analyze", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 503,
      json: { error: { code: "PRIVATE_MODE_DISABLED", message: "Private Mode is temporarily unavailable" } }
    });
  });

  await page.goto("/app");
  await page.getByLabel("Public chain identifier").fill("0xbad");
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByRole("alert")).toContainText("one complete wallet or contract address");
  expect(calls).toBe(0);

  await page.getByLabel("Public chain identifier").fill(address);
  await page.getByRole("button", { name: /EXPLAIN PRIVATELY/i }).click();
  await expect(page.getByRole("alert")).toContainText("Private Mode is paused right now");
  expect(calls).toBe(1);
});
