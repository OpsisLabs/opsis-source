import { expect, test, type Page } from "@playwright/test";

const address = "0x0000000000000000000000000000000000000001";
const sampleTransaction = "0x79ec8bb466286ee463d7e2a91b714a5e09e24d24f9e6cd4a474887b88e27d4df";
const answerText = "The supplied evidence shows two recent wallet transactions.";
const timestamp = "2026-07-11T00:00:00.000Z";

type MockOptions = { createDelayMs?: number; failCreate?: boolean };

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("rh_auth", JSON.stringify({
      accessToken: "e2e-access-token",
      refreshToken: "e2e-refresh-token",
      user: { id: "e2e-user", username: "browser-user", walletAddress: null },
    }));
  });
}

async function mockApi(page: Page, options: MockOptions = {}) {
  let createCalls = 0;
  let messageCalls = 0;
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
          chainLookups: createCalls + messageCalls,
          quota: { aiMessages: 500, chainLookups: 5000 },
        },
      });
      return;
    }

    if (path === `/v1/wallets/${address}/summary`) {
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
  };
}

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("wallet analysis is single-submit and does not replay after reload", async ({ page }) => {
  const calls = await mockApi(page, { createDelayMs: 250 });

  await page.goto("/app");
  const search = page.getByLabel("Wallet, token, contract, or transaction");
  await search.fill(address);
  await search.press("Enter");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/app\/chat\/e2e-session$/);
  await expect(page.getByText(answerText)).toBeVisible();
  expect(calls.createCalls()).toBe(1);
  expect(calls.messageCalls()).toBe(1);

  await page.reload();
  await expect(page.getByText(answerText)).toBeVisible();
  await page.waitForTimeout(300);
  expect(calls.messageCalls()).toBe(1);

  await page.getByRole("button", { name: /1 sources/i }).click();
  await expect(page.getByRole("link", { name: "Verify src_1 on Blockscout" })).toHaveAttribute(
    "href",
    `https://robinhoodchain.blockscout.com/address/${address}`,
  );
});

test("sample transaction is valid and resolve failures are visible", async ({ page }) => {
  const calls = await mockApi(page, { failCreate: true });

  await page.goto("/app");
  await page.getByRole("button", { name: "SAMPLE TX" }).click();
  const search = page.getByLabel("Wallet, token, contract, or transaction");
  await expect(search).toHaveValue(sampleTransaction);
  await search.press("Enter");

  await expect(page.getByRole("alert")).toHaveText("That transaction could not be found.");
  await expect(page.getByRole("button", { name: /resolve/i })).toBeEnabled();
  expect(calls.createCalls()).toBe(1);
});
