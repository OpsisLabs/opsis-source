export const feed = {
  "feed.views": "观察列表视图",
  "feed.walletDetails": "钱包详情",
  "feed.open": "动态汇总",
  "feed.badge": "你的观察列表 · 一个动态视图",
  "feed.title": "所有钱包，一目了然。",
  "feed.intro":
    "集中查看所关注钱包的已保存交易。筛选你关心的内容，再打开链上证据。浏览此视图不会发起额外查询。",
  "feed.transactions": "去重后的已保存交易",
  "feed.wallets": "已关注钱包",
  "feed.coverage": "来自已保存检查，并非实时动态",
  "feed.limits":
    "汇总每个钱包最近三次检查，每次最多包含 10 笔交易。同一交易仅显示一次，并保留各钱包的观察视角。不同钱包的检查时间可能不同；旧检查轮换后，相应记录可能移出此视图。请在钱包详情中手动刷新；后台不会轮询。转账不等于买入或卖出，空列表也不能证明没有活动。区块尚未最终确认。",
  "feed.walletFilter": "按钱包筛选",
  "feed.typeFilter": "按资产类型筛选",
  "feed.allWallets": "所有关注的钱包",
  "feed.kind.all": "所有交易",
  "feed.kind.native": "ETH 变动",
  "feed.kind.tokens": "代币变动",
  "feed.kind.nfts": "NFT 变动",
  "feed.search": "搜索代币、合约或交易",
  "feed.showing": "显示 {total} 笔匹配交易中的 {count} 笔",
  "feed.reset": "清除筛选",
  "feed.empty": "此视图暂无可显示的内容。",
  "feed.noMatch":
    "尝试其他钱包或资产类型，或清除搜索。筛选仅检查已保存的解码证据。",
  "feed.noEvidence":
    "添加钱包或刷新已有钱包，以保存可用的公开活动。数据缺失不代表没有活动。",
  "feed.timeUnknown": "时间不可用",
  "feed.seenIn": "{count} 个钱包视角",
  "feed.conflict":
    "已保存的观察结果对这笔交易或区块存在分歧。请先检查来源；这可能由链重组或数据源不一致引起。",
  "feed.discovery.baseline": "已存在于最早保留的检查中",
  "feed.discovery.later": "在后续检查中首次发现 · 位于其上次区块之后",
  "feed.discovery.older": "在后续检查中发现的较早交易",
  "feed.failed": "交易失败。不据此推断资产成功转移；仍可能产生网络费用。",
  "feed.noMovements": "此交易未返回已解码的资产变动。",
  "feed.details": "详情与完整标识符",
  "feed.captured": "最后观察于 {time} · 检查区块 {block}",
  "feed.partial":
    "此观察结果的资产变动或数据源覆盖不完整。显示的变动可能无法解释整笔交易。",
  "feed.partialShort": "已保存证据不完整 · 查看详情",
  "feed.more": "再显示 12 笔交易",
} as const;
