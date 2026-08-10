import { expect, test, type Page } from "@playwright/test";

const address = "0x0000000000000000000000000000000000000001";
const sampleTransaction = "0x79ec8bb466286ee463d7e2a91b714a5e09e24d24f9e6cd4a474887b88e27d4df";
const answerText = "The supplied evidence shows two recent wallet transactions.";
const timestamp = "2026-07-11T00:00:00.000Z";

type MockOptions = { createDelayMs?: number; messageDelayMs?: number; failCreate?: boolean };

async function mockApi(page: Page, options: MockOptions = {}) {
  let createCalls = 0;
  let messageCalls = 0;
  let entityCalls = 0;
  let sessions: Array<Record<string, unknown>> = [];
  let messages: Array<Record<string, unknown>> = [];

  const answer = {
    answer: answerText,
    facts: {
      address,
      explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
      transactionsFetched: 2,
      tokenBalances: [],
    },
    summaryBullets: ["Two recent transactions were found."],
    confirmedFacts: [{ fact: "Two recent transactions", sourceIds: ["source-1"] }],
    inferences: [],
    uncertainty: ["Provider indexing can lag."],
    riskNotes: [],
    citations: [{
      id: "source-1",
      provider: "blockscout",
      url: `https://robinhoodchain.blockscout.com/api/v2/addresses/${address}`,
      description: "Wallet activity evidence",
      fetchedAt: timestamp,
      fieldsUsed: ["items[].hash"],
    }],
    suggestedQuestions: ["Summarize recent activity."],
  };

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === "/v1/auth/me") {
      await route.fulfill({ json: { user: { id: "e2e-user", username: "browser-user", walletAddress: null } } });
      return;
    }

    if (path === "/v1/chat/sessions" && method === "POST") {
      createCalls += 1;
      if (options.createDelayMs) await new Promise((resolve) => setTimeout(resolve, options.createDelayMs));
      if (options.failCreate) {
        await route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND", message: "That transaction could not be found." } },
        });
        return;
      }
      const session = {
        id: "e2e-session",
        title: address,
        createdAt: timestamp,
        updatedAt: timestamp,
        activeEntity: { type: "wallet", value: address },
      };
      sessions = [session];
      await route.fulfill({
        json: { session, entity: { type: "wallet", chainId: 4663, id: address } },
      });
      return;
    }

    if (path === "/v1/chat/sessions/e2e-session/messages" && method === "POST") {
      messageCalls += 1;
      if (options.messageDelayMs) await new Promise((resolve) => setTimeout(resolve, options.messageDelayMs));
      const userMessage = { id: `user-${messageCalls}`, role: "USER", content: address, createdAt: timestamp };
      const assistantMessage = {
        id: `assistant-${messageCalls}`,
        role: "ASSISTANT",
        content: answerText,
        aiResponseJson: answer,
        createdAt: timestamp,
      };
      messages = [userMessage, assistantMessage];
      await route.fulfill({ json: { answer, message: assistantMessage } });
      return;
    }

    if (path === "/v1/chat/sessions/e2e-session/messages" && method === "GET") {
      await route.fulfill({ json: { messages } });
      return;
    }

    if (path === "/v1/chat/sessions" && method === "GET") {
      await route.fulfill({ json: { sessions } });
      return;
    }

    if (path === "/v1/usage/me") {
      await route.fulfill({
        json: {
          periodStart: "2026-07-01T00:00:00.000Z",
          periodEnd: "2026-08-01T00:00:00.000Z",
          aiMessages: messageCalls,
          chainLookups: messageCalls,
          quota: { aiMessages: 500, chainLookups: 5000 },
        },
      });
      return;
    }

    if (path === `/v1/wallets/${address}/summary`) {
      entityCalls += 1;
      await route.fulfill({
        json: {
          entity: {
            chainId: 4663,
            type: "wallet",
            value: address,
            facts: { address, transactionsFetched: 2, tokenBalances: [] },
            citations: answer.citations,
            riskNotes: [],
          },
        },
      });
      return;
    }

    await route.fulfill({
      status: 500,
      json: { error: { code: "UNHANDLED_TEST_REQUEST", message: `Unhandled browser request: ${method} ${path}` } },
    });
  });

  return {
    createCalls: () => createCalls,
    messageCalls: () => messageCalls,
    entityCalls: () => entityCalls,
  };
}

test("wallet analysis opens before enrichment, is single-submit, and does not replay after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  const calls = await mockApi(page, { createDelayMs: 250, messageDelayMs: 1_100 });

  await page.goto("/cloud");
  const search = page.getByLabel("Wallet, token, contract, or transaction");
  await search.fill(address);
  await search.press("Enter");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/cloud\/chat\/e2e-session$/);
  await expect(page.getByTestId("resolving-answer-card")).toBeVisible();
  expect(await page.getByTestId("resolving-answer-card").locator(".decode-reel").count()).toBeGreaterThan(10);
  await expect(page.getByText("RESOLVING ENTITY")).toBeVisible();
  await expect(page.getByText("FETCHING LIVE CHAIN DATA…")).toBeVisible();
  await page.waitForTimeout(350);
  const resolvingTop = (await page.getByTestId("active-response-anchor").boundingBox())?.y;
  await expect(page.getByTestId("answer-prose")).toHaveAttribute("data-streaming", "true");
  await expect(page.getByText(answerText)).toBeVisible();
  await expect(page.getByTestId("answer-prose")).toHaveAttribute("data-streaming", "false");
  await expect(page.getByTestId("resolving-answer-card")).toHaveCount(0);
  await page.waitForTimeout(600);
  const answerTop = (await page.getByTestId("answer-card").boundingBox())?.y;
  expect(resolvingTop).toBeDefined();
  expect(answerTop).toBeDefined();
  expect(Math.abs(answerTop! - resolvingTop!)).toBeLessThan(80);
  expect(calls.createCalls()).toBe(1);
  expect(calls.messageCalls()).toBe(1);
  expect(calls.entityCalls()).toBe(0);

  await page.reload();
  await expect(page.getByText(answerText)).toBeVisible();
  await expect(page.getByTestId("answer-prose")).toHaveAttribute("data-streaming", "false");
  await page.waitForTimeout(300);
  expect(calls.messageCalls()).toBe(1);
  expect(calls.entityCalls()).toBe(0);
  await expect(page.getByRole("link", { name: "Open in Blockscout" })).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/address/${address}`,
  );

  await page.getByRole("button", { name: /1 sources/i }).click();
  await expect(page.getByRole("link", { name: "Verify src_1 on Blockscout" })).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/address/${address}`,
  );
});

test("sample transaction is valid and resolve failures are visible", async ({ page }) => {
  const calls = await mockApi(page, { failCreate: true });

  await page.goto("/cloud");
  await page.getByRole("button", { name: "SAMPLE TX" }).click();
  const search = page.getByLabel("Wallet, token, contract, or transaction");
  await expect(search).toHaveValue(sampleTransaction);
  await search.press("Enter");

  await expect(page.getByRole("alert")).toHaveText("That transaction could not be found.");
  await expect(page.getByRole("button", { name: /inspect/i })).toBeEnabled();
  expect(calls.createCalls()).toBe(1);
});

test("malformed entity input is rejected before session creation", async ({ page }) => {
  const calls = await mockApi(page);

  await page.goto("/cloud");
  const search = page.getByLabel("Wallet, token, contract, or transaction");
  await search.fill("0xbad");
  await search.press("Enter");

  await expect(page.getByRole("alert")).toHaveText(
    "Enter a complete wallet or contract address, or a complete transaction hash.",
  );
  await expect(page).toHaveURL(/\/cloud$/);
  expect(calls.createCalls()).toBe(0);
  expect(calls.messageCalls()).toBe(0);
});

test("saved-session navigation clears stale entity details and invalid legacy answers", async ({ page }) => {
  const walletSession = {
    id: "wallet-session",
    title: "Wallet session",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeEntity: { type: "wallet", value: address },
  };
  const transactionSession = {
    id: "transaction-session",
    title: "Transaction session",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeEntity: { type: "transaction", value: sampleTransaction },
  };
  const invalidSession = {
    id: "invalid-session",
    title: "0xbad",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeEntity: null,
  };
  const answerFor = (facts: Record<string, unknown>) => ({
    answer: "Grounded answer.",
    facts,
    summaryBullets: [],
    confirmedFacts: [],
    inferences: [],
    uncertainty: [],
    riskNotes: [],
    citations: [],
    suggestedQuestions: [],
  });
  const messages = {
    "wallet-session": [{
      id: "wallet-answer",
      role: "ASSISTANT",
      content: "Grounded answer.",
      aiResponseJson: answerFor({
        address,
        explorerUrl: `https://robinhoodchain.blockscout.com/address/${address}`,
        nativeBalanceEth: "1",
        tokenBalances: [],
      }),
      createdAt: timestamp,
    }],
    "transaction-session": [{
      id: "transaction-answer",
      role: "ASSISTANT",
      content: "Grounded answer.",
      aiResponseJson: answerFor({
        hash: sampleTransaction,
        explorerUrl: `https://robinhoodchain.blockscout.com/tx/${sampleTransaction}`,
        gasUsed: "198476",
        valueEth: "0",
      }),
      createdAt: timestamp,
    }],
    "invalid-session": [{
      id: "invalid-answer",
      role: "ASSISTANT",
      content: "No activity exists.",
      aiResponseJson: answerFor({
        value: "0xbad",
        explorerUrl: "https://robinhoodchain.blockscout.com/address/0xbad",
      }),
      createdAt: timestamp,
    }],
  } as const;

  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/me") {
      await route.fulfill({ json: { user: { id: "e2e-user", username: "browser-user", walletAddress: null } } });
      return;
    }
    if (path === "/v1/chat/sessions") {
      await route.fulfill({ json: { sessions: [walletSession, transactionSession, invalidSession] } });
      return;
    }
    const match = path.match(/^\/v1\/chat\/sessions\/([^/]+)\/messages$/);
    if (match) {
      if (match[1] === "transaction-session") await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ json: { messages: messages[match[1] as keyof typeof messages] } });
      return;
    }
    if (path === "/v1/usage/me") {
      await route.fulfill({
        json: {
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-09-01T00:00:00.000Z",
          aiMessages: 3,
          chainLookups: 3,
          quota: { aiMessages: 500, chainLookups: 5000 },
        },
      });
      return;
    }
    await route.fulfill({ status: 500, json: { error: { code: "UNHANDLED_TEST_REQUEST" } } });
  });

  await page.goto("/cloud/chat/wallet-session");
  const summaryLink = page.getByRole("link", { name: "Open in Blockscout" });
  await expect(summaryLink).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/address/${address}`,
  );

  await page.getByRole("link", { name: /Transaction session/ }).click();
  await expect(page).toHaveURL(/\/cloud\/chat\/transaction-session$/);
  await expect(summaryLink).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in Blockscout" })).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/tx/${sampleTransaction}`,
  );

  await page.getByRole("link", { name: /^0xbad/ }).click();
  await expect(page.getByText(/saved session contains an invalid entity identifier/i)).toBeVisible();
  await expect(page.getByText("No activity exists.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in Blockscout" })).toHaveCount(0);
});

test("an expired cookie session rotates once and never exposes tokens to JavaScript", async ({ page }) => {
  let refreshCalls = 0;
  let refreshed = false;
  const session = {
    id: "refreshed-session",
    title: "Recovered session",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeEntity: null,
  };

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/v1/auth/me") {
      if (!refreshed) {
        await route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } });
      } else {
        await route.fulfill({ json: { user: { id: "e2e-user", username: "browser-user", walletAddress: null } } });
      }
      return;
    }

    if (path === "/v1/auth/refresh") {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      refreshed = true;
      await route.fulfill({ json: { user: { id: "e2e-user", username: "browser-user", walletAddress: null } } });
      return;
    }

    if (path === "/v1/chat/sessions") {
      await route.fulfill({ json: { sessions: [session] } });
      return;
    }
    if (path === "/v1/usage/me") {
      await route.fulfill({
        json: {
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-09-01T00:00:00.000Z",
          aiMessages: 3,
          chainLookups: 9,
          quota: { aiMessages: 500, chainLookups: 5000 },
        },
      });
      return;
    }

    await route.fulfill({ status: 500, json: { error: { code: "UNHANDLED_TEST_REQUEST" } } });
  });

  await page.goto("/cloud");
  await expect(page.getByRole("link", { name: /Recovered session/ })).toBeVisible();
  await expect(page.getByText("3/500")).toBeVisible();
  await expect(page.getByText("9/5000")).toBeVisible();
  expect(refreshCalls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("rh_auth"))).toBeNull();
  expect(await page.evaluate(() => document.cookie)).not.toContain("chainscout_access");
});

test("a late 401 does not rotate or clear an already refreshed session", async ({ page }) => {
  let refreshCalls = 0;
  let usageCalls = 0;
  const session = {
    id: "late-response-session",
    title: "Recovered session",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeEntity: null,
  };

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/v1/auth/me") {
      await route.fulfill({ json: { user: { id: "e2e-user", username: "browser-user", walletAddress: null } } });
      return;
    }

    if (path === "/v1/auth/refresh") {
      refreshCalls += 1;
      await route.fulfill({ json: { user: { id: "e2e-user", username: "browser-user", walletAddress: null } } });
      return;
    }

    if (path === "/v1/chat/sessions") {
      await route.fulfill({ json: { sessions: [session] } });
      return;
    }
    if (path === "/v1/usage/me") {
      usageCalls += 1;
      if (usageCalls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED", message: "Late stale response" } } });
        return;
      }
      await route.fulfill({
        json: {
          periodStart: "2026-08-01T00:00:00.000Z",
          periodEnd: "2026-09-01T00:00:00.000Z",
          aiMessages: 3,
          chainLookups: 9,
          quota: { aiMessages: 500, chainLookups: 5000 },
        },
      });
      return;
    }
    await route.fulfill({ status: 500, json: { error: { code: "UNHANDLED_TEST_REQUEST" } } });
  });

  await page.goto("/cloud");
  await expect(page.getByRole("link", { name: /Recovered session/ })).toBeVisible();
  await expect(page.getByText("9/5000")).toBeVisible();
  expect(refreshCalls).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("rh_auth"))).toBeNull();
});

test("a rejected refresh exits the stale authenticated shell", async ({ page }) => {
  let refreshCalls = 0;

  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/refresh") {
      refreshCalls += 1;
      await route.fulfill({
        status: 401,
        json: { error: { code: "INVALID_REFRESH_TOKEN", message: "Invalid refresh token" } },
      });
      return;
    }
    await route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHORIZED", message: "Expired access token" } },
    });
  });

  await page.goto("/cloud");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(refreshCalls).toBe(1);
});
