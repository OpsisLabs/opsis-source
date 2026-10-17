import { afterEach, describe, expect, it, vi } from "vitest";
import { detailedWidgets } from "./detailedWidgets";
import type { ResearchFacts } from "./api";
import { holderShares } from "../opsis/explorer-facts";
import pons from "../opsis/fixtures/research-pons-token.json";

const address = `0x${"1".repeat(40)}`;
const other = `0x${"2".repeat(40)}`;
const burn = "0x000000000000000000000000000000000000dEaD";
const transfer = { from: address, to: other, tokenSymbol: "PONS", formattedValue: "3051.092649036413974024", rawValue: "3051092649036413974024", timestamp: "2026-10-17T12:00:00Z", nativeValue: "8" };

afterEach(() => vi.unstubAllGlobals());

for (const chinese of [false, true]) {
  describe(chinese ? "Chinese detailed widgets" : "English detailed widgets", () => {
    const widgets = (facts: ResearchFacts) => {
      vi.stubGlobal("document", { cookie: `opsis_locale_v1=${chinese ? "zh-CN" : "en"}` });
      return detailedWidgets(facts, "token");
    };
    it("shows token quantities with units and exact values instead of native ETH", () => {
      const result = widgets({ symbol: "PONS", decimals: "18", recentTransfers: [transfer] });
      const largest = result.at(-1)!;
      expect(largest.note).toBe(chinese ? "代币数量；悬停查看精确值" : "Token amounts; exact values on hover");
      expect(largest.rows?.[0]).toMatchObject({ value: "3,051.09… PONS", exactValue: "3,051.092649036413974024 PONS", sub: transfer.timestamp });
      expect(JSON.stringify(largest)).not.toContain("ETH");
    });
    it("scales raw quantities with known decimals, uses the token symbol, and never assumes 18 decimals", () => {
      const row = { from: address, to: other, rawValue: "1234500" };
      expect(widgets({ symbol: "FIX", decimals: 6, recentTransfers: [row] }).at(-1)?.rows?.[0].value).toBe("1.23… FIX");
      expect(widgets({ recentTransfers: [row] })).toEqual([]);
      const unknown = widgets({ recentTransfers: [{ ...row, formattedValue: "2" }] }).at(-1)!;
      expect(unknown.rows?.[0].value).toBe(chinese ? "2 代币单位（符号未知）" : "2 token units (symbol unknown)");
    });
    it("separates burn-flagged and known burn addresses from other owners", () => {
      const result = widgets({
        liquidityPoolShare: 2.2, top10WalletShare: 21.2, burnedShare: 32.52,
        topHolders: [{ address: burn, share: 30 }, { address, isBurn: true, share: 2.52 }],
      });
      const supply = result.find((w) => w.kind === "donut")!;
      expect(supply.segments).toContainEqual({ label: chinese ? "已销毁供应量" : "Burned supply", pct: 32.52 });
      expect(supply.segments?.at(-1)?.pct).toBeCloseTo(44.08);
      expect(supply.segments?.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100);
      const holders = result.find((w) => w.rows?.some((r) => r.pivot === burn))!;
      expect(holders.rows?.every((r) => r.sub === (chinese ? "销毁地址" : "Burn address"))).toBe(true);
    });
    it("reuses the legacy-response concentration correction from main Research", () => {
      const result = widgets(pons.entity.facts);
      const supply = result.find((w) => w.kind === "donut")!;
      const shares = holderShares(pons.entity.facts);
      expect(supply.segments).toContainEqual({ label: chinese ? "已销毁供应量" : "Burned supply", pct: shares.burned });
      expect(supply.segments?.some((s) => s.pct === pons.entity.facts.top10WalletShare)).toBe(false);
    });
  });
}

it("ranks large token quantities exactly even when floating point values tie", () => {
  const result = detailedWidgets({ recentTransfers: [
    { ...transfer, formattedValue: "9007199254740992.01" },
    { ...transfer, formattedValue: "9007199254740992.02", to: address },
  ] }, "token");
  expect(result.at(-1)?.rows?.[0].pivot).toBe(address);
});

it("does not invent a complete ownership breakdown from unavailable shares", () => {
  const result = detailedWidgets({ topHolders: [{ address: burn, share: 32.52 }] }, "token");
  const remainder = result.find((w) => w.kind === "donut")?.segments?.at(-1);
  expect(remainder?.label).toBe("Unclassified supply");
  expect(remainder?.pct).toBeCloseTo(67.48);
  const inconsistent = detailedWidgets({ topHolders: [{ address: burn }], burnedShare: 80, top10WalletShare: 30 }, "token");
  expect(inconsistent.some((w) => w.kind === "donut")).toBe(false);
});
