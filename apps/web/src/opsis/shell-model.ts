import { isWatchEnabled } from "../product/availability";
import type { Capabilities } from "./model";

export const routeNames: Record<string, readonly [string, string]> = {
  "/research": ["Research", "研究"],
  "/research/details": ["Detailed research", "详细研究"],
  "/check": ["Trade Check", "交易核查"],
  "/swap": ["Swap preview", "兑换预览"],
  "/simulate": ["Trade scenarios", "交易情景"],
  "/check/perp-scenario": ["Perp cost scenario", "永续成本情景"],
  "/stress-test": ["Portfolio shocks", "投资组合冲击"],
  "/rwa": ["Stock-token check", "股票代币核查"],
  "/biggest-trades": ["Big trades", "大额交易"],
  "/research/events": ["World & markets", "世界与市场"],
  "/watch": ["Watch", "观察"],
  "/saved": ["Saved", "已保存"],
  "/lab": ["Quant Lab", "量化实验室"],
  "/guide": ["Find your tool", "选择工具"],
  "/status": ["Data status", "数据状态"],
  "/community": ["Community", "社区"],
  "/privacy": ["Privacy", "隐私"],
  "/terms": ["Terms", "条款"],
};
export function routeName(path: string, locale: string): string {
  return (routeNames[path] ?? ["Not found", "未找到"])[locale === "zh-CN" ? 1 : 0];
}
export function routeTitle(path: string, locale: string): string {
  return path === "/" ? "Opsis — See the bigger picture." : `Opsis · ${routeName(path, locale)}`;
}

export type ToolFlags = { simulator: boolean; stress: boolean; world: boolean; trades: boolean };
export const toolFlags: ToolFlags = {
  simulator: import.meta.env.VITE_TRADE_SIMULATOR_ENABLED === "true",
  stress: import.meta.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true",
  world: import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true",
  trades: import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true",
};
export function tradeToolPaths(capabilities: Capabilities, flags = toolFlags): string[] {
  return [
    "/check",
    ...(capabilities.swapPreview ? ["/swap", ...(flags.simulator ? ["/simulate"] : [])] : []),
    "/check/perp-scenario",
    ...(flags.stress ? ["/stress-test"] : []),
  ];
}
export function researchToolPaths(capabilities: Capabilities, flags = toolFlags): string[] {
  return ["/research", ...(capabilities.rwa ? ["/rwa"] : []),
    ...(capabilities.observedTrades && flags.trades ? ["/biggest-trades"] : []),
    ...(flags.world ? ["/research/events"] : [])];
}
export function landingTools(capabilities: Capabilities, flags = toolFlags): string[] {
  return [
    ...(capabilities.research ? ["research"] : []),
    ...(capabilities.exitCheck && import.meta.env.VITE_EXIT_CHECK_ENABLED === "true" ? ["check"] : []),
    ...(capabilities.watch && isWatchEnabled() ? ["watch"] : []),
    ...(capabilities.rwa ? ["rwa"] : []),
    "quant", ...(flags.world ? ["world"] : []), "saved", "guide",
    ...(capabilities.swapPreview ? ["swap"] : []),
  ];
}
