import { expect, test } from "@playwright/test";

const address = process.env.E2E_WALLET_ADDRESS ?? "0x9c34Fb7b54f05eba5D28Af3fF18f8dD9D66f7292";

test("local user asks Ollama about a live wallet", async ({ page, request }) => {
  const ollama = await request.get("http://127.0.0.1:11434/api/tags");
  expect(ollama.ok(), "Ollama must be running on port 11434").toBe(true);
  const tags = await ollama.json() as { models?: Array<{ name?: string }> };
  expect(tags.models?.some((model) => model.name === "qwen3:4b"), "qwen3:4b must be installed").toBe(true);

  await page.goto("/register");
  await page.getByLabel("Email").fill(`browser-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("local-browser-password");
  await page.getByRole("button", { name: "Create an account" }).click();

  await expect(page.getByLabel("Wallet, token, contract, or transaction")).toBeVisible();
  await page.getByLabel("Wallet, token, contract, or transaction").fill(address);
  await page.getByLabel("Question").fill("What does the source data confirm about this wallet?");
  await page.getByRole("button", { name: "Ask AI with citations" }).click();

  await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
  await expect(page.locator(".answerText")).not.toBeEmpty();
  await expect(page.locator(".sourceList a").first()).toBeVisible();
  await expect(page.getByText(/deterministic fallback/i)).toHaveCount(0);
});
