import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PerpScenario from "./PerpScenario";
import type { Capabilities } from "./model";

// The Node runner can inspect the real presentation with explicit component state.
const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  locale: "en",
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.index++;
      return [
        harness.states[index] === undefined ? initial : harness.states[index],
        () => {},
      ];
    },
  };
});
vi.mock("../i18n", () => ({ useI18n: () => ({ locale: harness.locale }) }));
const capabilities: Capabilities = {
  expiresAt: "2026-10-16T12:00:00Z",
  chainId: 4663,
  research: false,
  exitCheck: false,
  watch: false,
  rwa: false,
  observedTrades: false,
  perpExecution: false,
  perpHandoff: false,
};
const values = {
  quantity: "2",
  entry: "100",
  exit: "110",
  entryFeeBps: "5",
  exitFeeBps: "10",
  funding: "1",
  otherCosts: "0.5",
};
function markup() {
  harness.index = 0;
  return renderToStaticMarkup(<PerpScenario capabilities={capabilities} />);
}
beforeEach(() => {
  harness.states = [];
  harness.locale = "en";
});
describe("Perp scenario presentation", () => {
  it.each(["en", "zh-CN"])(
    "groups existing inputs into three numbered panels in %s",
    (locale) => {
      harness.locale = locale;
      const html = markup();
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain(locale === "en" ? "Position</h2>" : "仓位</h2>");
      expect(html).toContain(locale === "en" ? "Costs</h2>" : "成本</h2>");
      expect(html).toContain(locale === "en" ? "Exit</h2>" : "平仓</h2>");
      expect(html).toContain('href="#perp-result-title"');
      expect(html).toContain(
        locale === "en" ? "Complete the assumptions" : "补全假设",
      );
      expect(html).not.toContain("opsis-check-bar-track");
    },
  );
  it.each(["en", "zh-CN"])(
    "mirrors proportional bars with exact values and keeps liquidation assumptions in %s",
    (locale) => {
      harness.locale = locale;
      harness.states[3] = "50";
      harness.states[4] = "500";
      harness.states[7] = values;
      const html = markup();
      expect(html).toContain("18.18000000");
      expect(html).toContain("78.94736843");
      expect(html).toContain(
        locale === "en" ? "Gross price P&amp;L" : "价格变动毛损益",
      );
      expect(html).toContain("20.00000000");
      expect(html).toContain("0.10000000");
      expect(html).toContain("0.22000000");
      expect(html).toContain("1.00000000");
      expect(html.match(/class="opsis-check-bar-track"/g)).toHaveLength(5);
      expect(html).toContain('style="width:100%"');
      expect(html).toContain(
        locale === "en"
          ? "Your venue&#x27;s own liquidation price governs."
          : "以您场所自身的清算价格为准。",
      );
      expect(html).not.toMatch(/NaN|Infinity/);
    },
  );
  it("shows signed funding and a short loss without changing the model", () => {
    harness.states[0] = "short";
    harness.states[7] = { ...values, funding: "-1" };
    const html = markup();
    expect(html).toContain("-19.82000000");
    expect(html).toContain("-1.00000000");
    expect(html).not.toMatch(/width:-|NaN|Infinity/);
  });
});

it.each(["en", "zh-CN"])(
  "names every focusable result table and groups disclosures in %s",
  (locale) => {
    harness.locale = locale;
    harness.states[3] = "50";
    harness.states[4] = "500";
    harness.states[7] = values;
    const html = markup();
    expect(
      html.match(/tabindex="0" role="region" aria-label="[^"]+"/g),
    ).toHaveLength(3);
    expect(html).toContain('class="opsis-panel opsis-perp-disclosures"><aside');
  },
);

it.each(["en", "zh-CN"])(
  "associates an invalid fee with an actionable message in %s",
  (locale) => {
    harness.locale = locale;
    harness.states[7] = { ...values, entryFeeBps: "-1" };
    const html = markup();
    expect(html).toMatch(
      /aria-label="[^"]+"[^>]+aria-invalid="true" aria-describedby="[^"]+"/,
    );
    expect(html).toContain(
      locale === "en"
        ? "Enter a fee from 0 to 10000"
        : "请输入 0 至 10000 基点的费用",
    );
    expect(html).toContain(
      locale === "en" ? "Correct the highlighted inputs" : "请更正标记的输入",
    );
    expect(html).not.toContain(
      locale === "en" ? "Complete the assumptions" : "补全假设",
    );
  },
);

it("identifies a malformed custom shock beside the field even before completing the scenario", () => {
  harness.states[2] = "letters";
  const html = markup();
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain("Enter a shock from -95% to +500%");
  expect(html.indexOf('id="perp-custom-shock-error"')).toBeLessThan(
    html.indexOf('id="perp-custom-shock-help"'),
  );
});
