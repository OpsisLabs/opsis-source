import { expect, it, afterEach, vi } from "vitest";
import type { Capabilities } from "./model";
import { landingTools, researchToolPaths, routeTitle, tradeToolPaths } from "./shell-model";

const capabilities: Capabilities = {
  expiresAt: "2026-10-12T12:00:00Z", chainId: 4663,
  research: true, exitCheck: true, watch: true, rwa: true,
  observedTrades: true, swapPreview: false, perpExecution: false,
};
const flags = { simulator: true, stress: true, world: true, trades: true };
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["/research", "Research", "研究"],
  ["/research/details", "Detailed research", "详细研究"],
  ["/check", "Trade Check", "交易核查"],
  ["/swap", "Swap preview", "兑换预览"],
  ["/simulate", "Trade scenarios", "交易情景"],
  ["/check/perp-scenario", "Perp cost scenario", "永续成本情景"],
  ["/stress-test", "Portfolio shocks", "投资组合冲击"],
  ["/rwa", "Stock-token check", "股票代币核查"],
  ["/biggest-trades", "Big trades", "大额交易"],
  ["/research/events", "World & markets", "世界与市场"],
  ["/watch", "Watch", "观察"],
  ["/saved", "Saved", "已保存"],
  ["/lab", "Quant Lab", "量化实验室"],
  ["/guide", "Find your tool", "选择工具"],
  ["/status", "Data status", "数据状态"],
  ["/community", "Community", "社区"],
  ["/privacy", "Privacy", "隐私"],
  ["/terms", "Terms", "条款"],
])("localizes the canonical title of %s", (path, english, chinese) => {
  expect(routeTitle(path, "en")).toBe(`Opsis · ${english}`);
  expect(routeTitle(path, "zh-CN")).toBe(`Opsis · ${chinese}`);
});
it("titles the front door and unknown or parked paths", () => {
  for (const locale of ["en", "zh-CN"]) expect(routeTitle("/", locale)).toBe("Opsis — See the bigger picture.");
  for (const path of ["/missing", "/deals", "/collectibles"]) {
    expect(routeTitle(path, "en")).toBe("Opsis · Not found");
    expect(routeTitle(path, "zh-CN")).toBe("Opsis · 未找到");
  }
});
it("omits switched-off trade links and preserves the canonical tab order", () => {
  expect(tradeToolPaths(capabilities, flags)).toEqual(["/check", "/check/perp-scenario", "/stress-test"]);
  expect(tradeToolPaths({ ...capabilities, swapPreview: undefined }, flags)).not.toContain("/swap");
  expect(tradeToolPaths({ ...capabilities, swapPreview: true }, flags)).toEqual([
    "/check", "/swap", "/simulate", "/check/perp-scenario", "/stress-test",
  ]);
  expect(tradeToolPaths({ ...capabilities, swapPreview: true }, { ...flags, simulator: false, stress: false })).toEqual([
    "/check", "/swap", "/check/perp-scenario",
  ]);
  expect(researchToolPaths(capabilities, flags)).toEqual(["/research", "/rwa", "/biggest-trades", "/research/events"]);
  expect(researchToolPaths({ ...capabilities, rwa: false, observedTrades: false }, { ...flags, world: false })).toEqual(["/research"]);
});
it("passes only enabled front-door tools and never enables execution", () => {
  vi.stubEnv("VITE_EXIT_CHECK_ENABLED", "true");
  vi.stubEnv("VITE_WATCH_ENABLED", "true");
  expect(landingTools(capabilities, flags)).toEqual(["research", "check", "watch", "rwa", "quant", "world", "saved", "guide"]);
  expect(landingTools({ ...capabilities, swapPreview: true }, flags)).toContain("swap");
  expect(landingTools({ ...capabilities, research: false, exitCheck: false, watch: false, rwa: false }, { ...flags, world: false })).toEqual(["quant", "saved", "guide"]);
});

it("keeps the four D25 groups and tool order, with only enabled tools", async () => {
  const { toolGroups, toolIsActive, toolPathCopy } = await import("./shell-model");
  vi.stubEnv("VITE_EXIT_CHECK_ENABLED", "true");
  vi.stubEnv("VITE_WATCH_ENABLED", "true");
  const groups = toolGroups(capabilities, flags);
  expect(groups.map((group) => group.id)).toEqual(["lookup", "trade", "watch", "data"]);
  expect(groups.map((group) => group.name[0])).toEqual(["Look up", "Before you trade", "Keep watch", "Explore data"]);
  expect(groups.map((group) => group.tools.map((tool) => tool.path))).toEqual([
    ["/research", "/rwa", "/biggest-trades", "/research/events"],
    ["/check", "/check/perp-scenario", "/stress-test"], ["/watch", "/saved"], ["/lab"],
  ]);
  const disabled = toolGroups({ ...capabilities, research: false, exitCheck: false, watch: false, rwa: false, observedTrades: false }, { ...flags, world: false, stress: false });
  expect(disabled.map((group) => group.tools.map((tool) => tool.path))).toEqual([[], ["/check/perp-scenario"], ["/saved"], ["/lab"]]);
  expect(toolIsActive("/research", "/research/details")).toBe(true);
  expect(toolIsActive("/check", "/check/perp-scenario")).toBe(false);
  expect(toolPathCopy("/rwa")).toEqual(["Look up / Stock-token check", "查询 / 股票代币核查"]);
});
