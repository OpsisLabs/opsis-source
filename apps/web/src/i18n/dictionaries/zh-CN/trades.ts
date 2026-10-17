export const trades: Record<string, string> = {
  "trades.metadata.title": "大额交易",
  "trades.metadata.description":
    "在有限的区块窗口内，观察一个工厂验证矿池中最大的近期已签名 Uniswap V3 Swap 金额。",

  "trades.page.eyebrow": "大额交易",
  "trades.page.title": "大额交易",
  "trades.page.intro":
    "选择默认 WETH/USDG 交易对或一个代币合约。点击后，Opsis 从 dRPC Robinhood Chain 网关读取一个有限的近期区块窗口，并对该单一矿池的已签名 Uniswap V3 Swap 金额排序。不会自动抓取，也不会连接钱包。",

  "trades.form.tokenLabel": "代币合约（可选）",
  "trades.form.tokenPlaceholder": "0x… — 留空即为 WETH/USDG",
  "trades.form.tokenHint": "有效地址将与 WETH 配对。WETH/USDG 为默认交易对。",
  "trades.form.feeLabel": "已验证矿池费率",
  "trades.form.feeAuto": "首个工厂验证费率档",
  "trades.form.feeOption": "费率 {fee}（{pct}%）",
  "trades.form.windowLabel": "近期窗口",
  "trades.form.windowOption": "最近 {blocks} 个区块",

  "trades.consent.title": "公共地址披露",
  "trades.consent.body":
    "点击一次即将公共代币合约、工厂派生的矿池地址及有限区块窗口发送至 dRPC Robinhood Chain 网关。dRPC 是付费网关，可能会将每次读取路由到其网络中的独立节点运营方。不会发送钱包、金库、备注或 AI 数据。Opsis 不会在你点击前抓取，也绝不签名或交易。",
  "trades.consent.button": "观察近期交易",
  "trades.consent.loading": "正在观察…",

  "trades.disabled.title": "大额交易不可用",
  "trades.disabled.body": "此构建已关闭已观察交易功能。未发起任何请求，也未调用任何提供方。",

  "trades.error.title": "观察未能完成",
  "trades.error.generic": "有限的观察失败，请重试。",
  "trades.error.retry": "重试",

  "trades.empty.title": "此窗口内没有匹配的 Swap",
  "trades.empty.body":
    "该已验证矿池在所观察的区块范围内没有 Swap 事件。这是空窗口，不是零价值交易，也不是全天总计。",

  "trades.result.pairLabel": "已观察交易对",
  "trades.result.poolLabel": "工厂验证矿池",
  "trades.result.windowLabel": "精确窗口（区块 {from}–{to}）",
  "trades.result.windowValue": "{fromTime} → {toTime}",
  "trades.result.scannedLabel": "已扫描 / 匹配日志",
  "trades.result.scannedValue": "已扫描 {scanned} · 已匹配 {matched} · 上限 {cap}",
  "trades.result.methodLabel": "分类方式",
  "trades.result.methodValue": "仅使用已签名的 Uniswap V3 Swap 金额 — 未使用代币转账。",
  "trades.result.rpcLabel": "已用 RPC 单位",
  "trades.result.notes": "窗口说明",
  "trades.summary.observed": "已观察 {count} 笔 Swap，按金额从大到小。",
  "trades.summary.empty": "此窗口内没有已观察的 Swap。",

  "trades.table.caption": "已观察 Swap，按报价名义金额从大到小",
  "trades.table.side": "方向",
  "trades.table.base": "基础资产金额",
  "trades.table.quote": "报价资产金额",
  "trades.table.notional": "报价名义金额",
  "trades.table.tx": "交易",
  "trades.table.sender": "交易发送方",
  "trades.table.eventSender": "事件发送方（不一定是所有者）",
  "trades.table.eventRecipient": "事件接收方（不一定是交易者）",
  "trades.table.follow": "关注此公共地址",
  "trades.table.viewTx": "查看交易",
  "trades.table.viewAddress": "查看地址",

  "trades.side.buy": "买入基础资产",
  "trades.side.sell": "卖出基础资产",
  "trades.sender.eoa": "已验证 EOA",
  "trades.sender.contract": "合约地址",
  "trades.sender.unknown": "未分类",

  "trades.limitations.title": "此处不作何主张",
  "trades.privacy.label": "隐私回执",

  "product.feature.biggest-trades.label": "大额交易",
  "product.feature.biggest-trades.shortLabel": "大额交易",
  "product.feature.biggest-trades.helpLabel": "关于大额交易",
  "product.feature.biggest-trades.eyebrow": "有限窗口 · 单一验证矿池",
  "product.feature.biggest-trades.navHint": "比较最大的已观察 Swap",
  "product.feature.biggest-trades.summary":
    "在有限的近期区块窗口内，观察一个工厂验证矿池中最大的近期已签名 Uniswap V3 Swap 金额。",
  "product.feature.biggest-trades.bestFor":
    "查看某一精确矿池中实际发生的 Swap，而不作全链、全场所或全天主张。",
  "product.feature.biggest-trades.privacy":
    "点击后仅发送公共代币合约、工厂派生矿池及有限区块窗口。不发送钱包、金库或 AI 数据。",
  "product.feature.biggest-trades.boundary":
    "有限的观察窗口，不是实时数据流、价格、人物排名或盈利信号。每一行都是一个已签名 Swap 事件，可能与闪电贷和多跳路由并存。",
  "product.feature.biggest-trades.step.1":
    "保留默认 WETH/USDG 交易对，或粘贴一个代币合约。",
  "product.feature.biggest-trades.step.2":
    "阅读公共地址披露，然后点击一次进行观察。",
  "product.feature.biggest-trades.step.3":
    "查看精确窗口时间戳、扫描数量以及最大的已签名买入/卖出。",
  "product.feature.biggest-trades.step.4":
    "仅对已验证的公共 EOA 发送方使用 观察 交接。",
  "trades.limitations.1": "仅观察一个经工厂验证的 Uniswap V3 池；这不是全链或所有交易场所的排名。",
  "trades.limitations.2": "窗口仅为有限的近期区块范围，并非 UTC 全天，也不代表完整覆盖。缺失日志绝不视为零。",
  "trades.limitations.3": "每行是此池中的一个带符号 V3 Swap 事件，仅根据 amount0/amount1 分类，绝不根据代币转账分类。",
  "trades.limitations.4": "单笔交易可包含多个 Swap、闪电贷或多跳路由；一行不代表交易者的净头寸、利润、身份或协同行为。",
  "trades.limitations.5": "事件发送方和接收方是池事件中的地址。交易发送方是为该笔交易付费的账户，未必是真实个人或实际受益所有者。",
  "trades.limitations.6": "此处不提供安全结论、价格、建议或聪明钱信号。",
  "trades.result.narrowedNote": "所请求范围的日志数量超过 RPC 提供方的返回上限，因此 Opsis 改为观察较小但完整的窗口，而非不完整的较大窗口。",
  "trades.privacy.disclosure": "你点击后，请求将公共代币合约、工厂派生的池地址和有限区块范围发送至 {destination}，该提供方返回公开 Swap 日志和所显示行的交易数据。交易密集的区块可能连同其全部公开交易一并返回；系统核对其哈希以确保一致性，仅用显示的交易标记行，不保留未使用的交易数据。可能会读取所显示行的公共发送方地址和账户代码。这些是公共链标识符，不是你的钱包。未发送私人钱包、金库、标签、备注、所有权或 AI 数据。",
  "trades.privacy.routing": " dRPC 是付费网关，可能会将每次读取路由至其网络中的独立节点运营方。",
  "trades.result.fee": "费率 {fee}",
  "trades.table.blockLog": "区块 {block} · 日志 {log}",
};
