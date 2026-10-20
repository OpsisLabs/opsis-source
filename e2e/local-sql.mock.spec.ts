import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Run both projects: pnpm exec playwright test --config playwright.open-data-sql.config.ts
// Kept out of the normal flag-off development-server suite.
test.skip(
  process.env.OPSIS_SQL_E2E !== "1",
  "Needs the dedicated production-CSP SQL harness",
);
test("local CSV query and manifest replay under production CSP", async ({
  page,
}, testInfo) => {
  const fixture = resolve("e2e/fixtures/local-sql.csv");
  const content = readFileSync(fixture, "utf8");
  const requests: { url: string; body: string; headers: string }[] = [];
  const errors: string[] = [];
  page.on("request", (r) =>
    requests.push({
      url: r.url(),
      body: r.postData() ?? "",
      headers: JSON.stringify(r.headers()),
    }),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    document.cookie = "opsis_onboarding_seen=1; path=/; SameSite=Lax";
  });
  await page.route("**/v1/**", (route) =>
    route.request().url().endsWith("/private/opsis/access")
      ? route.fulfill({
          json: {
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            chainId: 4663,
            research: true,
            exitCheck: true,
            watch: true,
            rwa: false,
            observedTrades: false,
            perpExecution: false,
            openDataSql: true,
            openDataDatasets: false,
          },
        })
      : route.abort(),
  );
  const response = await page.goto("/lab?view=research");
  expect(response?.headers()["content-security-policy"]).toContain(
    "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'",
  );
  await page
    .getByRole("button", { name: "SQL on your own files", exact: true })
    .click();
  const workspace = page.getByRole("region", {
    name: "SQL on your own files",
    exact: true,
  });
  // No roadmap claims about features that are not live.
  await expect(workspace.getByText(/datasets: next/i)).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await workspace.getByLabel("Choose CSV files", { exact: true }).click();
  await (await chooser).setFiles(fixture);
  await expect(workspace.getByText("local_sql", { exact: true })).toBeVisible();
  expect(requests.some((r) => /duckdb.*(?:wasm|worker)/.test(r.url))).toBe(
    false,
  );
  await workspace
    .getByLabel("SQL query", { exact: true })
    .fill("SELECT count(*), sum(x) FROM local_sql");
  await workspace
    .getByRole("button", { name: "Run locally", exact: true })
    .click();
  await expect(workspace.getByRole("table").locator("tbody tr")).toHaveText(
    "36",
  );
  await expect(
    workspace.getByRole("heading", { name: "local_sql · 3 rows", exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await workspace
    .getByRole("button", { name: "Export run manifest", exact: true })
    .click();
  const manifestPath = testInfo.outputPath("run.json");
  await (await downloadEvent).saveAs(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  expect(manifest.datasets).toEqual([
    {
      kind: "local",
      name: "local-sql.csv",
      bytes: Buffer.byteLength(content),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  ]);
  for (const changed of [false, true]) {
    await workspace
      .getByLabel("Import a run manifest and replay locally", { exact: true })
      .setInputFiles(manifestPath);
    const replayFiles = workspace.getByLabel(
      "Pick the same CSV files, in the original order, to replay",
      { exact: true },
    );
    await expect(replayFiles).toBeVisible();
    await replayFiles.setInputFiles(
      changed
        ? {
            name: "local-sql.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(content.replace("3,third", "9,third")),
          }
        : fixture,
    );
    if (changed)
      await expect(workspace.getByRole("alert")).toContainText(
        "Replay refused.",
      );
    else
      await expect(
        workspace.getByText("Replay matches the exported result.", {
          exact: true,
        }),
      ).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(requests.some((r) => /\/data\/opsis\//.test(r.url))).toBe(false);
  for (const request of requests) {
    const wire = JSON.stringify(request);
    expect(wire).not.toContain("local-sql.csv");
    expect(wire).not.toContain("first");
    expect(wire).not.toContain("SELECT count");
    expect(request.body).not.toContain(content);
  }
  expect(requests.some((r) => /duckdb-eh.*\.wasm/.test(r.url))).toBe(true);
});
