export const market: Record<string, string> = {
  "market.common.notSupplied": "未提供",
  "market.common.notSpecified": "未指定",
  "market.common.unknown": "未知",
  "market.common.current": "当前",
  "market.common.stale": "已过期",
  "market.common.ownerEntered": "本人录入",
  "market.common.providerOffer": "提供商报价",

  "market.header.title": "市场与库存",
  "market.header.dealsTitle": "收藏品寻宝",
  "market.hero.title": "只比较真正可比的东西。",
  "market.hero.body":
    "精确合约的加密资产背景、已选择加入的商家库存、私密到手成本计算，以及仅点击的各大市场搜索。无抓取、无结账、无货币换算、无隐藏税费估算，也无付费提供商路径。",
  "market.hero.bodyDeals":
    "精确卡片搜索与私密到手成本比较。实时商家库存需要经批准且已选择加入的来源。无结账、无隐藏税费估算，也无自动市场抓取。",

  "market.crypto.eyebrow": "实时公开背景",
  "market.crypto.title": "Robinhood 代币池",
  "market.crypto.description":
    "DEX Screener 为交易对的基础代币定价。被搜索的合约可能是报价代币，因此 Opsis 会明确显示实际定价的地址，绝不悄悄反转。",
  "market.crypto.contractLabel": "代币合约",
  "market.crypto.contractPlaceholder": "0x…",
  "market.crypto.review": "查看精确合约查询",
  "market.crypto.summaryOpsis": "Robinhood Chain 4663 · {contract}",
  "market.crypto.summaryProvider": "Robinhood 代币交易对查询 · {contract}",
  "market.crypto.disclosure":
    "确切的公开链 ID 和代币合约会临时发送给 Opsis 和 DEX Screener。所有权、批次、成本、标签、备注、照片、其他资产、Cookie、钱包连接和 AI 均被排除。",

  "market.cryptoObs.eyebrow": "加密观测记录",
  "market.cryptoObs.title": "已索引的资金池背景",
  "market.cryptoObs.currentWindow": "当前参考窗口",
  "market.cryptoObs.staleWindow": "已过期 · 刷新以更新",
  "market.cryptoObs.windowStatus":
    "{state} · 观测于 {observed} · {seconds} 秒窗口",
  "market.cryptoObs.openSource": "打开 DEX SCREENER 来源",
  "market.cryptoObs.baseTokenPriced": "{dex} · 基础代币定价",
  "market.cryptoObs.pricedAddress": "定价地址 {address}",
  "market.cryptoObs.pairId": "交易对 ID {id}",
  "market.cryptoObs.baseQuote": "基础 {base} · 报价 {quote}",
  "market.cryptoObs.baseUsd": "基础 USD {usd} · 按报价计价 {quote}",
  "market.cryptoObs.stats":
    "流动性 {liquidity} · 24 小时成交量 {volume} · 24 小时涨跌 {change}",
  "market.cryptoObs.pairCreated": "交易对创建于 {created}",
  "market.cryptoObs.empty":
    "有效空结果 · DEX Screener 在此受限响应中未返回精确合约交易对。这并不证明其他地方不存在资金池。",
  "market.cryptoObs.showing":
    "此精简视图显示 {total} 条加密的精确合约资金池观测中的 6 条。打开来源以查看更完整的索引列表。",
  "market.cryptoObs.truncated":
    "提供商返回的集合已达到 Opsis 观测到的安全上限；可能省略了其他资金池。",

  "market.merchant.eyebrow": "仅限选择加入的商家",
  "market.merchant.title": "经审核的 Woo 库存",
  "market.merchant.description":
    "只有在已选择加入的商店及其精确的简单商品映射经过代码审核后，实时查询才会生效。未经批准的 Shopify 路径保持关闭；受支持的公开平台仍为仅点击搜索。",
  "market.merchant.loadStores": "加载已批准商店",
  "market.merchant.mappingsAria": "已批准的商家映射",
  "market.merchant.idLabel": "商家 ID",
  "market.merchant.idPlaceholder": "已批准的 ID",
  "market.merchant.assetLabel": "规范资产 ID",
  "market.merchant.assetPlaceholder": "tcgdex:en:…",
  "market.merchant.permissionEvidence": "商家授权证据",
  "market.merchant.mappingEvidence": "精确映射证据",
  "market.merchant.review": "查看商家查询",
  "market.merchant.approvedMerchant": "已批准商家 {merchant}",
  "market.merchant.summaryOpsis":
    "商家 ID {merchant} · 规范资产 {asset} · 已审核 SKU {sku} · 预期商品 ID {productId} · 映射审核于 {reviewedAt}",
  "market.merchant.summaryProvider":
    "确切的已审核 SKU {sku} · 预期商品 ID {productId}",
  "market.merchant.disclosure":
    "公开的规范资产 ID、已批准商家 ID、已审核 SKU、预期商品 ID 和映射审核日期会临时发送给 Opsis。只有已审核 SKU 和预期商品 ID 会发送给该选择加入的商家。所有权、批次、成本、标签、备注、照片、其他资产、Cookie、钱包连接和 AI 均被排除。",
  "market.merchant.returnNotSupplied": "未提供商家退货政策",

  "market.merchantObs.eyebrow": "经审核的商家观测记录",
  "market.merchantObs.title": "精确映射的简单商品",
  "market.merchantObs.noOffer": "{merchant} · 未返回精确映射的商品",
  "market.merchantObs.validEmpty": "有效空结果 · {state}",
  "market.merchantObs.observedLine": "{id} · 观测于 {observed}",
  "market.merchantObs.mappingLine":
    "SKU {sku} · 商品 ID {productId} · 映射审核于 {reviewedAt}",
  "market.merchantObs.openMapping": "打开映射证据",
  "market.merchantObs.exactMapping":
    "精确的已审核简单商品映射 · {merchant}",
  "market.merchantObs.openSource": "打开商品来源",
  "market.merchantObs.mappedVariant": "映射版本",
  "market.merchantObs.publishedPrice": "公布价格",
  "market.merchantObs.providerAvailability": "提供商可用性",
  "market.merchantObs.exactQuantity": "精确数量",
  "market.merchantObs.productRating": "商品评分 · 非卖家信誉",
  "market.merchantObs.ratingValue": "{average}/5 · {count} 条评价",
  "market.merchantObs.sellerReputation": "卖家信誉",
  "market.merchantObs.sellerReputationValue": "此适配器未提供",
  "market.merchantObs.observed": "观测时间",
  "market.merchantObs.mappingReviewed": "映射审核时间",
  "market.merchantObs.exactSku": "精确 SKU",
  "market.merchantObs.expectedProductId": "预期商品 ID",
  "market.merchantObs.freshness": "新鲜度",
  "market.merchantObs.freshnessCurrent": "当前观测窗口",
  "market.merchantObs.freshnessStale": "已过期 · 比较前请刷新",
  "market.merchantObs.reviewedMappingEvidence": "已审核的映射证据",

  "market.inventory.providerAvailable": "提供商有货",
  "market.inventory.providerLowStock": "提供商库存不足",
  "market.inventory.providerUnavailable": "提供商无货",
  "market.inventory.ownerAvailable": "本人有货",
  "market.inventory.unknown": "未知",

  "market.confidence.exactProviderMapping": "精确的提供商映射",
  "market.confidence.ownerLinked": "本人关联",
  "market.confidence.candidate": "候选",

  "market.comparison.eyebrow": "加密本地计算",
  "market.comparison.title": "添加到手成本比较",
  "market.comparison.description":
    "留空表示未知。成本明确为零时请输入 0。Opsis 从不估算税费、关税、运费或汇率。",
  "market.comparison.providerLocked":
    "商家身份、品相、单价、货币和可用性已锁定为经审核的响应。只有数量和本地成本字段可以更改。",
  "market.comparison.linkedAsset": "关联资产",
  "market.comparison.candidateOption": "候选 / 未关联",
  "market.comparison.ownerEnteredSource": "本人录入来源",
  "market.comparison.offerLabel": "报价标签",
  "market.comparison.sourceName": "来源名称",
  "market.comparison.sourceUrl": "来源 URL",
  "market.comparison.condition": "品相 / 版本",
  "market.comparison.region": "地区",
  "market.comparison.unitPrice": "单价",
  "market.comparison.quantity": "数量",
  "market.comparison.currency": "货币",
  "market.comparison.shipping": "运费",
  "market.comparison.tax": "税费",
  "market.comparison.duty": "关税",
  "market.comparison.fees": "手续费",
  "market.comparison.discount": "折扣",
  "market.comparison.blankUnknown": "留空 = 未知",
  "market.comparison.providerAvailability": "提供商可用性",
  "market.comparison.ownerAvailability": "本人可用性",
  "market.comparison.ownerAvailable": "本人称有货",
  "market.comparison.returnNotes": "退货说明",
  "market.comparison.submit": "加密并添加比较",

  "market.results.eyebrow": "本地结果",
  "market.results.title": "可比到手成本",
  "market.results.meta": "{confidence} · {inventory} · {freshness}",
  "market.results.freshWindow": "有效窗口",
  "market.results.providerRegion": "{provider} · 地区 {region}",
  "market.results.returnNotesInline": "退货说明：{notes}",
  "market.results.merchantMapping":
    "商家 {merchant} · SKU {sku} · 商品 {productId} · 审核于 {reviewedAt}",
  "market.results.sourceObserved": "来源 · 观测于 {observed}",
  "market.results.breakdown":
    "{unitPrice} × {quantity} + 运费 {shipping} + 税费 {tax} + 关税 {duty} + 手续费 {fees} − 折扣 {discount}",
  "market.results.landedTotal": "到手总计",
  "market.results.notRanked": "未参与排名",
  "market.results.localRank": "本地排名",
  "market.results.comparableExplanation":
    "同本人关联标识、品相、货币、数量、地区、明确成本、当前会话确认及可用状态。",
  "market.results.reconfirm": "重新确认我的输入",
  "market.results.remove": "删除",
  "market.results.disclaimer":
    "排名是在同一个本人关联的本地比较组内，按输入的最低到手总计排列。本人关联并非独立的身份验证。它不是全市场最低价、推荐、估价、税费报价或商家信誉评分。",

  "market.dialog.eyebrow": "精确网络凭据",
  "market.dialog.title": "确认此公开查询",
  "market.dialog.cancelAria": "取消市场查询",
  "market.dialog.sentToOpsis": "发送至 OPSIS",
  "market.dialog.sentToProviders": "发送至 {providers}",
  "market.dialog.disclosureTail":
    "加密的授权尝试会在请求之前保存。已索引的市场信息并非可执行报价、完整库存、估价或推荐。",
  "market.dialog.cancel": "取消",
  "market.dialog.confirm": "保存凭据并查询",

  "market.notice.noMerchant":
    "目前尚未启用任何商家。在商店明确选择加入且其精确商品映射经过审核之前，实时库存保持关闭。",
  "market.notice.cryptoPairsOne":
    "已加密保存 {count} 条精确合约资金池观测。这些是索引参考，并非可执行报价。",
  "market.notice.cryptoPairsOther":
    "已加密保存 {count} 条精确合约资金池观测。这些是索引参考，并非可执行报价。",
  "market.notice.cryptoEmpty":
    "DEX Screener 返回了有效的空交易对集合。这并不证明其他地方不存在资金池。",
  "market.notice.merchantOffer":
    "经审核的价格和保守的可用性已锁定到编辑器中。请输入你自己的数量和明确的本地成本，然后加密该比较。未提供精确库存数量和商家信誉。",
  "market.notice.merchantEmpty":
    "该选择加入的商家返回了有效的精确 SKU 空结果。该带日期的空观测取代了其先前的当前状态；较早的比较仍保持加密但已过期。",
  "market.notice.comparisonProvider":
    "经审核的商家观测和你的本地成本已加密保存。只有原始提供商的新鲜度窗口仍然开放时，它才会参与排名。",
  "market.notice.comparisonOwner":
    "本人录入的报价已加密保存。在此解锁会话中，它只会与具有相同关联身份、货币、品相、数量和地区的完整比较进行排名。",
  "market.notice.comparisonRemoved": "所选的本地比较已从加密保险库中删除。",
  "market.notice.reconfirmed":
    "你已为当前解锁会话重新确认此本人录入的报价。Opsis 未联系其来源。",

  "market.error.directoryLoad": "无法加载已批准的商家目录。",
  "market.error.receiptSave":
    "无法保存加密的授权凭据。{message} Opsis 未联系任何市场提供商。",
  "market.error.providerLocalSave":
    "提供商返回了结果，且已发送经批准的公开标识符，但{reason} 结果未持久化；先前加密的观测保持不变。",
  "market.error.requestFailed":
    "市场请求在授权后失败。公开标识符可能已被发送；先前加密的观测保持不变。",
  "market.error.localSave": "本地加密保存失败。",

  "market.math.reasonCandidate": "身份或版本只是候选匹配。",
  "market.math.reasonCondition": "缺少品相或版本。",
  "market.math.reasonAvailability": "可用性未知或不可用。",
  "market.math.reasonStale": "观测已过期，请刷新或重新确认。",
  "market.math.reasonMissingCosts":
    "请输入运费、税费、关税、手续费和折扣；允许明确填写零。",
  "market.math.reasonDiscountExceeds": "折扣超过了输入的到手成本。",

  "market.handoff.eyebrow": "不支持的平台",
  "market.handoff.title": "精确的仅点击搜索",
  "market.handoff.description":
    "这些链接仅包含公开的卡牌身份。Opsis 不会从目标站点抓取、预加载、排名或声称其库存。打开前请核对确切的查询内容。",
  "market.handoff.collectibleLabel": "加密收藏品",
  "market.handoff.chooseCollectible": "选择目录匹配的收藏品",
  "market.handoff.searchOnly": "仅搜索 · 无实时数据",
  "market.handoff.openDestination": "打开目标站点",
  "market.handoff.ebay": "eBay 搜索",
  "market.handoff.tcgplayer": "TCGplayer 搜索",
  "market.handoff.cardmarket": "Cardmarket 搜索",
};
