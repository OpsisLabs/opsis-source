import { expect, test } from "@playwright/test";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";
import { fixture } from "../apps/web/src/opsis/test-fixtures";
const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test("opsis preview exit curve sends explicit opt-in and supports point selection", async ({
  page,
}) => {
  test.skip(!enabled);
  await mockPublicOpsisAccess(page);
  const base = fixture();
  let body: unknown;
  let calls = 0;
  const point = (
    amount: string,
    rawAmount: string,
    out: string,
    display: string,
    fee: string,
    feeDisplay: string,
  ) => ({
    ...base.quote,
    amount,
    rawAmount,
    status: "ok",
    amountOut: out,
    amountOutDisplay: display,
    spotAmountOut: out,
    spotAmountOutDisplay: display,
    feeAmount: fee,
    feeAmountDisplay: feeDisplay,
  });
  await page.route("**/v1/private/exit-check/quote", (r) => {
    body = r.request().postDataJSON();
    calls++;
    return r.fulfill(
      calls > 1
        ? {
            status: 503,
            json: {
              error: { code: "EXIT_CHECK_UNAVAILABLE", message: "Unavailable" },
            },
          }
        : {
            json: {
              ...base,
              curve: {
                requestedAmount: "1.5",
                scope: {
                  strategy: "selected_pool",
                  pool: base.quote.pool,
                },
                points: [
                  point(
                    "0.75",
                    "750000",
                    "260000000000",
                    "0.00000026",
                    "2250",
                    "0.00225",
                  ),
                  point(
                    "1.5",
                    "1500000",
                    "500000000000",
                    "0.0000005",
                    "4500",
                    "0.0045",
                  ),
                  point(
                    "3",
                    "3000000",
                    "900000000000",
                    "0.0000009",
                    "9000",
                    "0.009",
                  ),
                ],
              },
            },
          },
    );
  });
  await page.goto(`/check?entity=${base.input.contract}`);
  await page.getByLabel("Amount to check").fill("1.5");
  await page.getByLabel(/Also quote a size curve/).check();
  await expect(page.getByText(/half rounded down/)).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Run a check", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Exit size curve", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/selected 0\.3% fee pool/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const receipt = page.getByTestId("opsis-quote");
  await expect(receipt).toContainText("You send");
  await expect(receipt).toContainText("You’d receive about");
  await expect(receipt).toContainText("Gas not included");
  await expect(receipt).toContainText("Estimate, not an executable quote.");
  await expect(receipt.locator(".opsis-curve")).toHaveCount(0);
  await expect(page.locator(".opsis-check-curve table")).toContainText(
    "0.0000009 WETH",
  );
  await expect(
    page
      .locator(".opsis-check-handoff")
      .getByRole("link", { name: "Open Uniswap ↗", exact: true }),
  ).toBeVisible();
  expect(body).toEqual({
    token: base.input.contract,
    amount: "1.5",
    outputToken: "WETH",
    curve: true,
  });
  await page.getByRole("button", { name: "3", exact: true }).click();
  await expect(page.getByText(/Selected point: 3 →/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.locator("html").evaluate((el) => el.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Run a check", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Quote unavailable");
  await expect(
    page.getByRole("heading", { name: "Exit size curve", exact: true }),
  ).toHaveCount(0);
});
