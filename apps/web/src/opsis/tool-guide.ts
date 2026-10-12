import { isWatchEnabled } from "../product/availability";
import type { Capabilities } from "./model";
type Copy = [string, string];
export type ToolGuide = {
  path: string;
  name: Copy;
  audience: Copy;
  input: Copy;
  outcome: Copy;
  enabled: (c: Capabilities) => boolean;
};
export const toolGuides: ToolGuide[] = [
  {
    path: "/research",
    name: ["Research", "研究"],
    audience: [
      "Newcomers, token traders & investigators",
      "新用户、代币交易者和调查者",
    ],
    input: [
      "Paste a public token, wallet or transaction",
      "粘贴公开代币、钱包地址或交易哈希",
    ],
    outcome: [
      "An explanation with dated sources and coverage limits",
      "带日期来源和覆盖限制的解释",
    ],
    enabled: (c) => c.research,
  },
  {
    path: "/check",
    name: ["Trade Check", "交易核查"],
    audience: ["Token traders checking an exit", "核查退出成本的代币交易者"],
    input: ["Choose a token and the amount to sell", "选择代币和卖出数量"],
    outcome: [
      "Estimated pool output, fees and price impact at that size",
      "该数量的资金池预估输出、费用和价格影响",
    ],
    enabled: (c) =>
      c.exitCheck && import.meta.env.VITE_EXIT_CHECK_ENABLED === "true",
  },
  {
    path: "/watch",
    name: ["Watch", "观察"],
    audience: ["Holders & active traders", "持有者和活跃交易者"],
    input: [
      "Enter a public wallet; unlock encrypted storage to save checks",
      "输入公开钱包；解锁加密存储以保存核查",
    ],
    outcome: [
      "Changes between checks you request; no background alerts",
      "您主动请求的核查之间的变化；无后台提醒",
    ],
    enabled: (c) =>
      c.watch && isWatchEnabled(),
  },
  {
    path: "/lab",
    name: ["Quant Lab", "量化实验室"],
    audience: [
      "Data explorers, researchers & quant traders",
      "数据探索者、研究者和量化交易者",
    ],
    input: [
      "Choose captured pools or a shock surface; import daily prices, funding, or paired mark/index records for local experiments",
      "选择历史资金池或冲击曲面；导入日价格、资金费或成对标记价／指数价记录进行本地实验",
    ],
    outcome: [
      "Captured comparisons, seeded scenarios, manual reference gaps, realized funding totals and observed basis",
      "历史比较、种子情景、手动参考价差、已实现资金费总额及观察基差",
    ],
    enabled: () => true,
  },
  {
    path: "/check/perp-scenario",
    name: ["Perp cost scenario", "永续成本情景"],
    audience: [
      "Perp traders checking manual assumptions",
      "核查手动假设的永续交易者",
    ],
    input: [
      "Quantity, entry/exit prices, fees and total funding; optional funding rate/holding period, collateral and maintenance",
      "数量、开平价格、费用及资金费总额；可选资金费率／持有期、抵押品及维持保证金",
    ],
    outcome: [
      "Hypothetical holding cost, funding and estimated liquidation from your own numbers; no perp trading. When switched on, the directory lists venues by your stated region; the venue's own figure governs",
      "以您的数字建立假设持仓成本、资金费及清算估算；不提供永续交易。目录开启时按您声明的地区列出场所；以场所自身的数值为准",
    ],
    enabled: () => true,
  },
  {
    path: "/saved",
    name: ["Saved", "已保存"],
    audience: ["Holders keeping private records", "保留私人记录的持有者"],
    input: [
      "Create or unlock your encrypted local vault",
      "创建或解锁本地加密保险库",
    ],
    outcome: [
      "Your saved research, holdings, notes and allocation views",
      "您的已保存研究、持仓、笔记及分配视图",
    ],
    enabled: () => true,
  },
  {
    path: "/swap",
    name: ["Swap preview", "兑换预览"],
    audience: ["Traders checking swap costs", "核查兑换成本的交易者"],
    input: [
      "Choose the supported pair and an input amount",
      "选择支持的交易对和输入数量",
    ],
    outcome: [
      "A route and cost preview before an official-app handoff",
      "前往官方应用前的路线与成本预览",
    ],
    enabled: (c) => Boolean(c.swapPreview),
  },
  {
    path: "/simulate",
    name: ["Trade scenarios", "交易情景"],
    audience: [
      "Traders comparing a hypothetical trade",
      "比较假设交易的交易者",
    ],
    input: [
      "Enter quantities and request a supported quote",
      "输入数量并请求支持的报价",
    ],
    outcome: [
      "Before/after quantities and portfolio assumptions",
      "交易前后的数量及投资组合假设",
    ],
    enabled: (c) =>
      Boolean(c.swapPreview) &&
      import.meta.env.VITE_TRADE_SIMULATOR_ENABLED === "true",
  },
  {
    path: "/stress-test",
    name: ["Portfolio shocks", "投资组合冲击"],
    audience: [
      "Holders & traders testing downside scenarios",
      "测试下行情景的持有者与交易者",
    ],
    input: [
      "Enter holdings or try the labeled example; change a shock",
      "输入持仓或试用标明的示例，调整冲击",
    ],
    outcome: [
      "How those assumptions change portfolio value",
      "这些假设如何改变投资组合价值",
    ],
    enabled: () =>
      import.meta.env.VITE_PORTFOLIO_STRESS_TEST_ENABLED === "true",
  },
  {
    path: "/rwa",
    name: ["Stock-token check", "股票代币核查"],
    audience: [
      "Researchers checking asset-backing claims",
      "核查资产支持声明的研究者",
    ],
    input: [
      "Paste the exact supported token contract",
      "粘贴支持的确切代币合约",
    ],
    outcome: [
      "Identity, backing and redemption evidence with gaps shown",
      "身份、支持资产和赎回证据，以及缺失之处",
    ],
    enabled: (c) => c.rwa,
  },
  {
    path: "/biggest-trades",
    name: ["Big trades", "大额交易"],
    audience: ["Investigators & market researchers", "调查者和市场研究者"],
    input: [
      "Choose a token or public wallet and a bounded window",
      "选择代币或公开钱包及有限时间窗口",
    ],
    outcome: [
      "Observed swap amounts and public transaction sources",
      "已观察兑换数量和公开交易来源",
    ],
    enabled: (c) =>
      c.observedTrades &&
      import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true",
  },
  {
    path: "/research/events",
    name: ["World & markets", "世界与市场"],
    audience: [
      "Researchers comparing news and market context",
      "比较新闻与市场背景的研究者",
    ],
    input: [
      "Choose a captured event or the ETH market brief",
      "选择历史事件或 ETH 市场简报",
    ],
    outcome: [
      "Dated reports beside captured prices; not a live news feed",
      "带日期报道及历史价格；非实时新闻流",
    ],
    enabled: () => import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true",
  },
  {
    path: "/research/details",
    name: ["Detailed research", "详细研究"],
    audience: [
      "Investigators following a public record",
      "追溯公开记录的调查者",
    ],
    input: [
      "Paste an exact public address or transaction",
      "粘贴确切的公开地址或交易哈希",
    ],
    outcome: [
      "A deeper source-linked record and question-specific answers",
      "更详细的来源记录及针对问题的回答",
    ],
    enabled: (c) => c.research,
  },
];
export const audiences: {
  id: string;
  name: Copy;
  task: Copy;
  paths: string[];
}[] = [
  {
    id: "new",
    name: ["I'm new here", "我是新用户"],
    task: ["Understand a token, wallet or transaction", "理解代币、钱包或交易"],
    paths: ["/research"],
  },
  {
    id: "token",
    name: ["I trade tokens", "我交易代币"],
    task: [
      "Research a token, then check an exit at my size",
      "研究代币，然后核查我的数量对应的退出情况",
    ],
    paths: ["/research", "/check"],
  },
  {
    id: "active",
    name: ["I trade actively", "我经常交易"],
    task: [
      "Inspect costs and compare trade assumptions",
      "检查成本并比较交易假设",
    ],
    paths: ["/check", "/simulate", "/watch"],
  },
  {
    id: "holder",
    name: ["I'm holding assets", "我持有资产"],
    task: [
      "Keep private records and check what changed",
      "保留私人记录并核查变化",
    ],
    paths: ["/watch", "/saved", "/stress-test"],
  },
  {
    id: "investigator",
    name: ["I'm tracing a transaction", "我在追查交易"],
    task: ["Follow public records and their sources", "追溯公开记录及其来源"],
    paths: ["/research/details", "/biggest-trades"],
  },
  {
    id: "researcher",
    name: ["I research or publish", "我研究或发布内容"],
    task: [
      "Check claims and compare dated evidence",
      "核查声明并比较带日期证据",
    ],
    paths: ["/research", "/rwa", "/research/events"],
  },
  {
    id: "quant",
    name: ["I explore data & scenarios", "我探索数据与情景"],
    task: [
      "Inspect pools, validate daily data and run reproducible local experiments",
      "检查资金池、验证日数据并运行可重现的本地实验",
    ],
    paths: ["/lab", "/stress-test"],
  },
  {
    id: "perp",
    name: ["I trade perpetuals", "我交易永续合约"],
    task: [
      "Model hypothetical holding cost, funding and estimated liquidation from your own numbers; Opsis has no perp trading. A directory by your stated region appears only when switched on",
      "以您的数字建立假设持仓成本、资金费及清算估算；Opsis 不提供永续交易。按您声明的地区列出的目录仅在开启时显示",
    ],
    paths: [],
  },
];
