import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { docs, whitepaper } from "../apps/web/src/opsis/publications/content";
import { syntheticPublicContract } from "./fixtures/public-contract.synthetic";
import { mockPublicOpsisAccess } from "./opsis-test-helpers";

const enabled =
  process.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" &&
  process.env.VITE_OPSIS_PUBLIC_ACCESS_ENABLED === "true";
test.describe("opsis public documentation", () => {
  test.skip(!enabled);
  for (const path of ["/docs", "/whitepaper"]) {
    for (const width of [375, 1180, 1440]) {
      test(`${path} is readable without providers at ${width}px in both languages and themes`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const requests: string[] = [];
        await page.route("**/v1/**", (route) => {
          requests.push(route.request().url());
          return route.abort();
        });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          path === "/docs" ? "Documentation" : "Whitepaper",
        );
        await expect(
          page.getByLabel("CA · Contract address", { exact: true }),
        ).toHaveValue("0x75cb4182Db44f816d80e946F0b84dBC29e5cf58A");
        await expect(
          page.getByRole("button", { name: "Copy CA" }).first(),
        ).toBeEnabled();
        await expect(page).toHaveTitle(
          path === "/docs" ? "Opsis · Documentation" : "Opsis · Whitepaper",
        );
        await expect(page.locator(".publication-contract")).toBeInViewport();
        await expect(
          page.getByText("Check the address and chain together.", { exact: true }),
        ).toBeVisible();
        await expect(page.locator(".publication-flow")).toBeVisible();
        if (width > 700) {
          await expect(page.locator(".opsis-desktop-rail")).toHaveCSS(
            "width",
            "200px",
          );
          await expect(page.locator(".opsis-desktop-rail")).toHaveCSS(
            "background-color",
            "rgb(6, 74, 242)",
          );
          const index = await page.locator(".publication-index").boundingBox();
          const reading = await page
            .locator(".publication-reading")
            .boundingBox();
          const dock = await page.locator(".publication-dock").boundingBox();
          expect(index!.x + index!.width).toBeLessThan(reading!.x);
          expect(reading!.x + reading!.width).toBeLessThan(dock!.x);
        }
        for (const theme of ["light", "dark"]) {
          if (theme === "dark") {
            if (width === 375)
              await page.getByRole("button", { name: "Open menu" }).click();
            await page
              .getByRole("button", { name: "Theme: Light", exact: true })
              .click();
            if (width === 375)
              await page.getByRole("button", { name: "Close menu" }).click();
          }
          for (const locale of ["en", "zh-CN"]) {
            if (locale === "zh-CN")
              await page
                .getByRole("button", { name: "中文", exact: true })
                .click();
            await expect(page.locator(".opsis-publication")).toHaveAttribute(
              "data-theme",
              theme,
            );
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(
              locale === "en"
                ? path === "/docs"
                  ? "Documentation"
                  : "Whitepaper"
                : path === "/docs"
                  ? "文档"
                  : "白皮书",
            );
            const content = path === "/docs" ? docs : whitepaper;
            const language = locale === "en" ? 0 : 1;
            const rendered = await page
              .locator(".publication-reading .publication-section")
              .evaluateAll((sections) =>
                sections.map((section) => ({
                  title: section.querySelector("h2")?.textContent,
                  paragraphs: Array.from(
                    section.querySelectorAll(".publication-section-body > p"),
                    (p) => p.textContent,
                  ),
                  items: Array.from(
                    section.querySelectorAll(".publication-notes > section"),
                    (item) => ({
                      title: item.querySelector("h3")?.textContent,
                      body: item.querySelector("p")?.textContent,
                    }),
                  ),
                })),
              );
            expect(rendered).toEqual(
              content.map((section) => ({
                title: section.title[language],
                paragraphs: section.paragraphs.map((p) => p[language]),
                items: (section.items ?? []).map((item) => ({
                  title: item.title[language],
                  body: item.body[language],
                })),
              })),
            );
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
              ),
            ).toBe(true);
            const audit = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            expect(audit.violations).toEqual([]);
            if (locale === "zh-CN")
              await page
                .getByRole("button", { name: "English", exact: true })
                .click();
          }
        }
        if (width === 375)
          await page.locator(".publication-index summary").click();
        await page
          .getByRole("navigation", { name: "On this page" })
          .getByRole("link", { name: "Contract address" })
          .click();
        await expect(page).toHaveURL(`${path}#contract`);
        await expect(page.locator("#contract-title")).toBeInViewport();
        expect(requests).toEqual([]);
        await page.screenshot({
          path: `output/publications-${path.slice(1)}-${width}.png`,
          fullPage: true,
        });
      });
    }
  }

  test("keyboard navigation connects both pages and preserves language", async ({
    page,
    browserName,
  }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("heading", { name: "Documentation", exact: true }),
    ).toBeVisible();
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#publication-content")).toBeFocused();
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page
      .getByRole("navigation", { name: "出版物" })
      .getByRole("link", { name: "白皮书", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("白皮书");
    await expect(page.locator("#abstract-title")).toHaveText("摘要");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("白皮书");
  });

  test("landing links leave the film and its CA field shows the published contract", async ({
    page,
  }) => {
    await mockPublicOpsisAccess(page, [{}]);
    await page.goto("/");
    const film = page.frameLocator(".opsis-original-film");
    await expect(
      film.getByLabel("CA · Contract address", { exact: true }),
    ).toHaveValue("0x75cb4182Db44f816d80e946F0b84dBC29e5cf58A");
    await expect(
      film.getByRole("button", { name: "Copy CA", exact: true }),
    ).toBeEnabled();
    await expect(
      film.getByRole("button", { name: "Copy contract address", exact: true }),
    ).toBeEnabled();
    await film
      .getByRole("navigation", { name: "About OPSIS" })
      .getByRole("link", { name: "Docs", exact: true })
      .click();
    await expect(page).toHaveURL("/docs");
    await expect(
      page.getByRole("heading", { name: "Documentation" }),
    ).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  for (const fail of [false, true]) {
    test(`configured fixture handles clipboard ${fail ? "failure" : "success"} without a request`, async ({
      page,
    }) => {
      const requests: string[] = [];
      await page.route("**/v1/**", (route) => {
        requests.push(route.request().url());
        return route.abort();
      });
      const { address, chain } = syntheticPublicContract;
      await page.route(
        /\/src\/opsis\/publications\/public-contract\.ts(?:\?.*)?$/,
        async (route) => {
          const response = await route.fetch();
          const body = (await response.text()).replace(
            "import.meta.env.VITE_PUBLIC_CONTRACT_ADDRESS",
            JSON.stringify(address),
          );
          expect(body).toContain(JSON.stringify(address));
          await route.fulfill({
            response,
            body: body.replace(
              "import.meta.env.VITE_PUBLIC_CONTRACT_CHAIN",
              JSON.stringify(chain),
            ),
          });
        },
      );
      await page.addInitScript(
        ({ fail }) => {
          Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
              writeText: async (text: string) => {
                if (fail) throw new Error("denied");
                document.documentElement.dataset.copied = text;
              },
            },
          });
        },
        { fail },
      );
      await page.goto("/docs#contract");
      const field = page.getByLabel("CA · Contract address", { exact: true });
      await expect(field).toHaveValue(address);
      await page.getByRole("button", { name: "Copy CA", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(
        fail
          ? "Copy unavailable. Select the address and copy it manually."
          : "Address copied.",
      );
      if (!fail)
        await expect(page.locator("html")).toHaveAttribute(
          "data-copied",
          address,
        );
      await expect(field).toHaveValue(address);
      await expect(page.locator(".opsis-ca-chain")).toContainText(
        "Robinhood Chain · 4663",
      );
      expect(requests).toEqual([]);
    });
  }
});
