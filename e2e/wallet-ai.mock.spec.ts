import { expect, test } from "@playwright/test";

const address = "0x0000000000000000000000000000000000000001";
const answerText = "The supplied evidence shows two recent wallet transactions.";

test("user asks about a wallet and receives a cited answer", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("rh-chain-explorer-auth", JSON.stringify({
      accessToken: "e2e-access-token",
      refreshToken: "e2e-refresh-token",
      user: { id: "e2e-user", email: "browser@example.com", role: "USER", status: "ACTIVE" }
    }));
  });
  await page.route("http://localhost:4000/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/v1/chat/sessions" && method === "POST") {
      await route.fulfill({ json: {
        session: { id: "e2e-session", title: address, updatedAt: "2026-07-11T00:00:00.000Z" }
      } });
      return;
    }
    if (path === "/v1/chat/sessions/e2e-session/messages" && method === "POST") {
      await route.fulfill({ json: {
        answer: {
          answer: answerText,
          facts: { transactionsFetched: 2 },
          uncertainty: ["Provider indexing can lag."],
          riskNotes: [],
          citations: [{
            id: "source-1",
            provider: "blockscout",
            url: "https://example.test/address",
            description: "Wallet activity evidence",
            fetchedAt: "2026-07-11T00:00:00.000Z"
          }],
          suggestedQuestions: ["Summarize recent activity."]
        },
        message: {
          id: "assistant-1",
          role: "ASSISTANT",
          content: answerText,
          createdAt: "2026-07-11T00:00:01.000Z"
        }
      } });
      return;
    }
    if (path === "/v1/chat/sessions/e2e-session/messages" && method === "GET") {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    if (path === "/v1/chat/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (path === "/v1/usage/me") {
      await route.fulfill({ json: {
        aiMessages: 0,
        chainLookups: 0,
        quota: { aiMessages: 500, chainLookups: 5000 }
      } });
      return;
    }
    await route.fulfill({ status: 500, json: { error: { message: `Unhandled browser request: ${method} ${path}` } } });
  });

  await page.goto("/app");
  await page.getByLabel("Wallet, token, contract, or transaction").fill(address);
  await page.getByLabel("Question").fill("What has this wallet done recently?");
  await page.getByRole("button", { name: "Ask AI with citations" }).click();

  await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
  await expect(page.locator(".answerText")).toHaveText(answerText);
  await expect(page.getByText("Wallet activity evidence")).toBeVisible();
  await expect(page.getByText("Provider indexing can lag.")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/chat\/e2e-session$/);
});
