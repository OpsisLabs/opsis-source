import type { CapabilityId } from "./model";

export const statusDetails: Record<
  CapabilityId,
  {
    label: [string, string];
    scope: [string, string];
    origin: [string, string];
    freshness: [string, string];
    coverage: [string, string];
    limits: [string, string];
  }
> = {
  contractFacts: {
    label: ["Contract facts", "合约事实"],
    scope: ["Blockscout contract metadata", "Blockscout 合约元数据"],
    origin: ["Existing explorer documents on request", "按请求读取现有区块浏览器文档"],
    freshness: ["Original read time; follows the token cache window", "保留原始读取时间；遵循代币缓存期限"],
    coverage: ["Reported verification, compiler and proxy fields", "已报告的验证、编译器与代理字段"],
    limits: ["Missing or malformed evidence stays unknown. Verification does not establish contract behaviour.", "缺失或格式错误的证据保持未知。源代码验证不能证明合约行为。"],
  },
  networkPulse: {
    label: ["Network now", "网络现况"],
    scope: ["Robinhood Chain 4663", "Robinhood Chain 4663"],
    origin: ["Read-only RPC and on-chain Chainlink ETH/USD", "只读 RPC 与链上 Chainlink ETH/USD"],
    freshness: ["15-second server cache; refreshes every 30 seconds while visible", "服务器缓存 15 秒；面板可见时每 30 秒刷新"],
    coverage: ["Latest and safe blocks, gas price, ETH/USD round and RPC read latency", "最新区块、safe 区块、Gas 价格、ETH/USD 轮次与 RPC 读取延迟"],
    limits: ["Four independent batched reads; current, not final. No network-wide uptime claim.", "四次独立读取，合并为一批；当前数据，非最终确认。不代表全网在线率。"],
  },
  linkedWallets: {
    label: ["Wallets linked by funding", "资金关联钱包"],
    scope: ["Top 100 explorer holders", "区块浏览器前 100 名持有人"],
    origin: ["Explorer lists and anchored RPC reads on request", "按请求读取浏览器列表与锚定 RPC 数据"],
    freshness: ["Original observation time; cached up to 60 minutes", "保留原始观察时间；缓存最长 60 分钟"],
    coverage: ["First funding and launch-window links; bounded reads", "首次入金与开盘窗口关联；读取有上限"],
    limits: ["Funding inferences only. Hubs excluded. Not investment advice.", "仅为资金关系推断。排除枢纽地址。非投资建议。"],
  },
  claimCheck: {
    label: ["Claim Check", "声明核查"], scope: ["Published deterministic token claims", "已公布的确定性代币声明"],
    origin: ["On explicit request", "按明确请求"], freshness: ["Current and optional post-time blocks", "当前及可选的发布时区块"],
    coverage: ["Published types; missing evidence stays unknown", "已公布类型；缺失证据保持未知"],
    limits: ["Address confirmation required. Explorer evidence is current-only. No AI or link fetching.", "须确认地址。浏览器数据仅限当前。无 AI 或链接抓取。"],
  },
  alerts: {
    label: ["Opt-in alerts in Telegram", "自愿启用的 Telegram 提醒"],
    scope: ["Telegram rules with 30-day expiry", "30 天到期的 Telegram 规则"],
    origin: ["Bounded block follower", "有限区块跟踪"],
    freshness: ["Selected block tag; provider and polling lag apply", "所选区块标签；受数据源和轮询延迟影响"],
    coverage: ["Transfers, approvals, pool swaps and multiplier changes", "转账、授权、流动池兑换及乘数变动"],
    limits: ["Opt-in Redis storage. Alerts can be lost if the store resets; re-create them. Not investment advice.", "自愿启用后存储于 Redis。存储重置可能导致提醒丢失；可重新创建。非投资建议。"],
  },
  openDataSql: {
    label: ["Browser SQL", "浏览器 SQL"],
    scope: ["SQL over your own CSV files", "对自己的 CSV 文件运行 SQL"],
    origin: ["Files picked from this device", "从此设备选择的文件"],
    freshness: ["User-supplied files", "用户提供的文件"],
    coverage: ["Up to four CSV files", "最多四个 CSV 文件"],
    limits: ["50 MB each, 100 MB total. Files and queries never leave this device.", "每个 50 MB，总计 100 MB。文件和查询不会离开此设备。"],
  },
  openDataDatasets: {
    label: ["Published Opsis datasets", "Opsis 已发布数据集"],
    scope: ["Published Opsis datasets", "Opsis 已发布数据集"],
    origin: ["Same-origin static files", "同源静态文件"],
    freshness: ["Dataset generation time", "数据集生成时间"],
    coverage: ["Reviewed published files only", "仅经审查的已发布文件"],
    limits: ["Not available.", "不可用。"],
  },
  launchCards: {
    label: ["Launch facts and Launch Radar", "发行事实与发行雷达"],
    scope: ["Robinhood Chain reviewed launch events", "Robinhood Chain 已查阅的发行事件"],
    origin: ["RPC and Chainlink USD conversion on request", "按请求读取 RPC 及 Chainlink 美元换算"],
    freshness: ["Block-anchored cards and bounded recent feed", "锚定区块的卡片及有限近期列表"],
    coverage: ["Versioned rules, capped scans and synthetic sell simulations", "版本化规则、受限扫描与合成卖出模拟"],
    limits: ["Unknown stays unknown. Simulated behaviour can change. Not investment advice.", "未知保持未知。模拟行为可能变化。非投资建议。"],
  },
  stockDesk: {
    label: ["Stock Token Desk", "股票代币数据台"],
    scope: ["Desk facts and reviewed-sample index", "数据台事实与已审阅样本索引"],
    origin: ["On explicit request", "按明确请求"],
    freshness: ["Independent source times and anchors", "各来源独立时间与锚点"],
    coverage: ["Ten reviewed Stock Tokens", "十种已审阅股票代币"],
    limits: ["Data, not advice. USDG units are not dollars.", "数据，非建议。USDG 单位不等于美元。"],
  },
  publicCards: {
    label: ["Public token cards", "公开代币卡片"],
    scope: ["Token cards as JSON and image embeds", "以 JSON 和图片嵌入提供的代币卡片"],
    origin: ["On explicit request", "按明确请求"],
    freshness: ["Independent source times and anchors", "各数据源有独立时间及锚点"],
    coverage: ["Partial coverage", "部分覆盖"],
    limits: [
      "Not investment advice. Provider and tool budgets apply.",
      "非投资建议。受数据源及工具预算限制。",
    ],
  },
  publicMcp: {
    label: ["Read-only MCP", "只读 MCP"],
    scope: ["Read-only tools for agents and bots", "面向智能体和机器人的只读工具"],
    origin: ["On explicit request", "按明确请求"],
    freshness: ["Independent source times and anchors", "各数据源有独立时间及锚点"],
    coverage: ["Partial coverage", "部分覆盖"],
    limits: [
      "Not investment advice. Provider and tool budgets apply.",
      "非投资建议。受数据源及工具预算限制。",
    ],
  },
  telegramBot: {
    label: ["Telegram token cards", "Telegram 代币卡片"],
    scope: ["Token cards in Telegram chats", "Telegram 聊天中的代币卡片"],
    origin: ["On explicit request", "按明确请求"],
    freshness: ["Independent source times and anchors", "各数据源有独立时间及锚点"],
    coverage: ["Partial coverage", "部分覆盖"],
    limits: [
      "Not investment advice. Provider and tool budgets apply.",
      "非投资建议。受数据源及工具预算限制。",
    ],
  },
  receipts: {
    label: ["Computation receipts", "计算凭据"],
    scope: ["Signed block-anchored computation receipts", "签名且锚定区块的计算凭据"],
    origin: ["On explicit request", "按明确请求生成"],
    freshness: ["Issued per request", "每次请求时签发"],
    coverage: ["Token controls reference integration only", "仅标准合约控制参考集成"],
    limits: [
      "Does not establish correctness or Bitcoin attestation.",
      "不证明结论正确或比特币证明有效。",
    ],
  },
  savedCheckComparisons: {
    label: ["Saved-check comparisons", "已保存核查对比"],
    scope: [
      "Local saved token Research and Trade Check comparisons",
      "本地已保存的代币研究和交易核查对比",
    ],
    origin: ["Encrypted browser records", "浏览器加密记录"],
    freshness: ["Historical observation times", "历史观测时间"],
    coverage: ["Matching typed evidence only", "仅限相匹配的结构化证据"],
    limits: [
      "No automatic lookup; different inputs or missing coverage are not market changes.",
      "不自动查询；输入不同或覆盖缺失不代表市场变化。",
    ],
  },
  research: {
    label: ["Research", "研究"],
    scope: [
      "Robinhood Chain public-identifier research",
      "Robinhood Chain 公开标识符研究",
    ],
    origin: ["Live on request", "按请求实时查询"],
    freshness: ["Checked per request", "每次请求时检查"],
    coverage: [
      "Bounded by upstream source coverage",
      "受上游数据源覆盖范围限制",
    ],
    limits: [
      "Provider health and complete coverage are unknown until each lookup.",
      "每次查询前，提供商运行状况和完整覆盖情况均未知。",
    ],
  },
  tokenControls: {
    label: ["Standard contract controls", "标准合约控制"],
    scope: [
      "Robinhood Chain standard contract controls",
      "Robinhood Chain 标准合约控制",
    ],
    origin: ["Live RPC on request", "按请求实时 RPC 查询"],
    freshness: ["Block-anchored per request", "每次请求锚定区块"],
    coverage: [
      "Owner, pause responses and three proxy slots only",
      "仅包括所有者、暂停响应和三个代理槽位",
    ],
    limits: [
      "Mint privileges, custom roles, transfer taxes and concentration are not inferred.",
      "不会推断铸造权限、自定义角色、转账税或持仓集中度。",
    ],
  },
  exitCheck: {
    label: ["Trade Check", "交易核查"],
    scope: [
      "Robinhood Chain official Uniswap V3 standard fee tiers",
      "Robinhood Chain 官方 Uniswap V3 标准费率层",
    ],
    origin: ["Live RPC on request", "按请求实时 RPC 查询"],
    freshness: ["Block-anchored per quote", "每份报价锚定区块"],
    coverage: [
      "Bounded pools and configured RPC quota",
      "受限流动池及配置的 RPC 配额",
    ],
    limits: [
      "Does not prove transferability, sellability or execution.",
      "不证明资产可转移、可出售或可成交。",
    ],
  },
  watch: {
    label: ["Watch snapshots", "观察快照"],
    scope: [
      "Robinhood Chain user-triggered wallet snapshots",
      "Robinhood Chain 用户触发的钱包快照",
    ],
    origin: ["Captured on user request", "按用户请求捕获"],
    freshness: [
      "Snapshot timestamp; no background monitoring",
      "显示快照时间；不在后台监控",
    ],
    coverage: [
      "Supported assets and upstream discovery coverage",
      "受支持资产和上游发现覆盖范围",
    ],
    limits: [
      "Not continuous monitoring; missing upstream data stays unknown.",
      "不提供持续监控；缺失的上游数据保持为未知。",
    ],
  },
  rwa: {
    label: ["Stock-token check", "股票代币核查"],
    scope: [
      "Existing source-backed stock-token checks",
      "现有有来源依据的股票代币核查",
    ],
    origin: ["Live on request", "按请求实时查询"],
    freshness: ["Checked per request", "每次请求时检查"],
    coverage: [
      "Bounded to supported sources and configured RPC quota",
      "受支持数据源及配置的 RPC 配额限制",
    ],
    limits: [
      "Not an appraisal, eligibility decision or proof of tradability.",
      "不是估值、资格决定或可交易性证明。",
    ],
  },
  perpHandoff: {
    label: ["Perp venue directory", "永续合约场所目录"],
    scope: [
      "Reviewed directory of perpetual-futures venues by stated region; no orders and no eligibility verification",
      "按自述居住地区提供经查阅的永续合约场所目录；无订单或资格核验",
    ],
    origin: [
      "Static review, checked 2026-10-12",
      "静态查阅，核查日期 2026-10-12",
    ],
    freshness: ["Re-review due within 120 days", "120 天内需再次查阅"],
    coverage: ["United States and Canada only", "仅限美国和加拿大"],
    limits: [
      "Each venue's own pages govern; Opsis verifies no identity or eligibility",
      "以各场所自己的页面为准；Opsis 不核验身份或资格",
    ],
  },
  swapPreview: {
    label: ["Swap preview", "兑换预览"],
    scope: [
      "Robinhood Chain WETH/USDG single-pool estimate through official Uniswap V3 QuoterV2",
      "通过官方 Uniswap V3 QuoterV2 估算 Robinhood Chain WETH/USDG 单池报价",
    ],
    origin: ["On-chain RPC and Chainlink ETH / USD on request", "按请求读取链上 RPC 和 Chainlink ETH / USD"],
    freshness: [
      "Block-anchored quote; Uniswap independently requotes",
      "锚定区块的报价；Uniswap 独立重新报价",
    ],
    coverage: ["WETH/USDG standard V3 fee tiers; single pool only", "WETH/USDG 标准 V3 费率层；仅限单池"],
    limits: [
      "Uniswap's app may route differently. User-paid network and LP costs apply. Opsis never signs or broadcasts.",
      "Uniswap 应用可能采用不同路径。网络费与 LP 费用由用户支付。Opsis 从不签名或广播。",
    ],
  },
  observedTrades: {
    label: ["Big trades", "大额交易"],
    scope: [
      "Robinhood Chain decoded Uniswap V3 Swap logs",
      "Robinhood Chain 解码的 Uniswap V3 Swap 日志",
    ],
    origin: ["Live scan on request", "按请求实时扫描"],
    freshness: ["Anchored to captured block window", "锚定已捕获的区块范围"],
    coverage: ["Configured block and log caps", "受配置的区块和日志上限限制"],
    limits: [
      "Observed swaps only; gaps and partial windows remain explicit; transfers are not trades.",
      "仅表示观察到的兑换；缺口和不完整范围会明确显示；转账不代表交易。",
    ],
  },
};
