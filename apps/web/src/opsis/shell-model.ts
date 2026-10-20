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
  "/docs": ["Documentation", "文档"],
  "/whitepaper": ["Whitepaper", "白皮书"],
  "/status": ["Data status", "数据状态"],
  "/community": ["Community", "社区"],
  "/privacy": ["Privacy", "隐私"],
  "/terms": ["Terms", "条款"],
  "/verify": ["Verify a receipt", "验证收据"],
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

export type ShellTool = {
  path: string;
  name: readonly [string, string];
  purpose: readonly [string, string];
  icon: import("./shell/icons").ToolIconName;
};
export type ToolGroup = {
  id: "lookup" | "trade" | "watch" | "data";
  name: readonly [string, string];
  heading: readonly [string, string];
  tools: ShellTool[];
};
const groups: ToolGroup[] = [
  {
    id: "lookup",
    name: ["Look up", "查询"],
    heading: ["Start with the facts.", "从事实开始。"],
    tools: [
      {
        path: "/research",
        name: routeNames["/research"],
        purpose: [
          "Token, wallet, contract or transaction",
          "代币、钱包、合约或交易",
        ],
        icon: "research",
      },
      {
        path: "/rwa",
        name: routeNames["/rwa"],
        purpose: ["Check the backing", "核查支持资产"],
        icon: "stock",
      },
      {
        path: "/biggest-trades",
        name: routeNames["/biggest-trades"],
        purpose: ["Compare observed swaps", "比较已观察的兑换"],
        icon: "trades",
      },
      {
        path: "/research/events",
        name: routeNames["/research/events"],
        purpose: ["Put moves in context", "理解变动的背景"],
        icon: "world",
      },
    ],
  },
  {
    id: "trade",
    name: ["Before you trade", "交易之前"],
    heading: ["Know what comes out.", "了解输出数量。"],
    tools: [
      {
        path: "/check",
        name: routeNames["/check"],
        purpose: ["What comes out at your size", "您的数量对应的输出"],
        icon: "check",
      },
      {
        path: "/check/perp-scenario",
        name: routeNames["/check/perp-scenario"],
        purpose: ["Compare holding costs", "比较持仓成本"],
        icon: "perp",
      },
      {
        path: "/stress-test",
        name: routeNames["/stress-test"],
        purpose: ["Test a market move", "测试市场变动"],
        icon: "shocks",
      },
    ],
  },
  {
    id: "watch",
    name: ["Keep watch", "持续关注"],
    heading: ["See what changed.", "查看变化。"],
    tools: [
      {
        path: "/watch",
        name: routeNames["/watch"],
        purpose: ["What changed in a wallet", "钱包发生了什么变化"],
        icon: "watch",
      },
      {
        path: "/saved",
        name: routeNames["/saved"],
        purpose: ["Encrypted on this device", "在此设备上加密"],
        icon: "saved",
      },
    ],
  },
  {
    id: "data",
    name: ["Explore data", "探索数据"],
    heading: ["Look for a pattern.", "寻找规律。"],
    tools: [
      {
        path: "/lab",
        name: routeNames["/lab"],
        purpose: ["Pool atlas, surface, experiments", "资金池图谱、曲面、实验"],
        icon: "lab",
      },
    ],
  },
];
export function toolGroups(
  capabilities: Capabilities,
  flags = toolFlags,
): ToolGroup[] {
  const available = new Set([
    ...researchToolPaths(capabilities, flags).filter(
      (path) => path !== "/research" || capabilities.research,
    ),
    ...tradeToolPaths(capabilities, flags).filter(
      (path) =>
        path !== "/check" ||
        (capabilities.exitCheck &&
          import.meta.env.VITE_EXIT_CHECK_ENABLED === "true"),
    ),
    ...(capabilities.watch && isWatchEnabled() ? ["/watch"] : []),
    "/saved",
    "/lab",
  ]);
  return groups.map((group) => ({
    ...group,
    tools: group.tools.filter((tool) => available.has(tool.path)),
  }));
}
export function toolIsActive(path: string, current: string): boolean {
  return (
    path === current ||
    (path === "/research" && current === "/research/details") ||
    (path === "/check" && ["/swap", "/simulate"].includes(current))
  );
}
export function toolPathCopy(
  path: string,
): readonly [string, string] | undefined {
  const group = groups.find((group) =>
    group.tools.some((tool) => toolIsActive(tool.path, path)),
  );
  const name = routeNames[path];
  return group && name
    ? [`${group.name[0]} / ${name[0]}`, `${group.name[1]} / ${name[1]}`]
    : undefined;
}
