export const docs: Record<string, string> = {
  "docs.nav.aria": "技术文档章节",
  "docs.nav.onThisPage": "本页目录",
  "docs.nav.architecture": "架构",
  "docs.nav.vault": "已保存",
  "docs.nav.evidence": "证据流水线",
  "docs.nav.adapters": "功能适配器",
  "docs.nav.security": "安全边界",
  "docs.nav.token": "代币设计",

  "docs.header.eyebrow": "技术参考 · ROBINHOOD CHAIN 4663",
  "docs.title.line1": "Opsis",
  "docs.title.line2": "究竟如何运作。",
  "docs.header.description":
    "Opsis 是一个只读的资产情报层，外加一个浏览器加密的所有权层。它解析精确的公开标识符，规范化有边界的证据，标注不确定性，并将让某项资产真正属于你的私密上下文留在服务器之外。",
  "docs.header.viewSource": "查看源代码",
  "docs.header.readFaq": "阅读常见问题",

  "docs.label.input": "输入",
  "docs.label.path": "路径",
  "docs.label.storage": "存储",
  "docs.label.process": "处理",
  "docs.label.output": "输出",
  "docs.label.boundary": "边界",

  "docs.architecture.eyebrow": "01 · 数据路径",
  "docs.architecture.title": "三种模式，三条不同的边界。",
  "docs.architecture.intro":
    "Opsis 将未保存的公开查询，与主动选择加入的加密本地历史及所有权记录区分开来。云端研究推迟到未来的更新，并非发布所依赖的功能。",
  "docs.architecture.mode.ephemeral.name": "临时查询",
  "docs.architecture.mode.ephemeral.input": "公开标识符",
  "docs.architecture.mode.ephemeral.path": "同源 API",
  "docs.architecture.mode.ephemeral.storage": "无服务器历史",
  "docs.architecture.mode.ephemeral.copy":
    "未保存的结果会在刷新时清除。具名提供商仅接收该次查询所需的、已披露的公开字段。已保存的对话记录不会作为上下文上传。",
  "docs.architecture.mode.vault.name": "本地保险库 + 对话",
  "docs.architecture.mode.vault.input": "主动选择加入的历史与所有权",
  "docs.architecture.mode.vault.path": "Web Crypto + IndexedDB",
  "docs.architecture.mode.vault.storage": "加密的浏览器记录",
  "docs.architecture.mode.vault.copy":
    "先解锁，再提问以自动保存问题、答案和来源。记录版本 5 将对话绑定到现有的 AES-GCM 保险库密钥。备份会验证并还原对话及资产记录。仅限同一浏览器配置文件和来源；浏览器删除或数据被清除时仍需依赖备份。",
  "docs.architecture.mode.cloud.name": "云端 · 未来更新",
  "docs.architecture.mode.cloud.input": "发布时未启用",
  "docs.architecture.mode.cloud.path": "独立的未来工作区",
  "docs.architecture.mode.cloud.storage": "不承诺云端留存",
  "docs.architecture.mode.cloud.copy":
    "在已配置的情况下，现有的账户恢复/导出路由仍然可用。本地对话历史或保险库不需要云端研究。",
  "docs.architecture.pipeline.eyebrow": "公开查询流水线",
  "docs.architecture.pipeline.browser.name": "浏览器",
  "docs.architecture.pipeline.browser.note": "严格输入",
  "docs.architecture.pipeline.origin.name": "同源",
  "docs.architecture.pipeline.origin.note": "/v1 私有路由",
  "docs.architecture.pipeline.adapters.name": "适配器",
  "docs.architecture.pipeline.adapters.note": "固定提供商",
  "docs.architecture.pipeline.normalized.name": "已规范化",
  "docs.architecture.pipeline.normalized.note": "来源 + 限制",

  "docs.vault.eyebrow": "02 · 本地加密",
  "docs.vault.title": "保险库在存储之前就已加密。",
  "docs.vault.keyLifecycle.title": "密钥生命周期",
  "docs.vault.keyLifecycle.item1":
    "在 Web Crypto 中生成随机的 256 位数据加密密钥。",
  "docs.vault.keyLifecycle.item2":
    "使用 PBKDF2-HMAC-SHA-256、随机盐和 600,000 次迭代，从规范化后的口令派生包装密钥。",
  "docs.vault.keyLifecycle.item3":
    "使用 AES-256-GCM 包装数据密钥。解锁后，使用不可导出的会话密钥。",
  "docs.vault.keyLifecycle.item4":
    "锁定会移除应用对明文状态和会话密钥的引用；重新加载后回到锁定状态。",
  "docs.vault.integrity.title": "记录完整性",
  "docs.vault.integrity.item1": "每条记录都使用全新的 96 位 AES-GCM IV。",
  "docs.vault.integrity.item2":
    "认证数据绑定保险库 ID、记录 ID 和记录版本，因此密文无法被悄悄移动或重新标记。",
  "docs.vault.integrity.item3":
    "修订检查可防止陈旧的标签页覆盖较新的本地状态。",
  "docs.vault.integrity.item4":
    "加密备份在替换现有保险库之前，会验证清单及混合的记录版本。",
  "docs.vault.warning.title": "这并不能保护什么",
  "docs.vault.warning.body":
    "当保险库处于解锁状态时，受损的浏览器、恶意扩展、敌对的同源代码、屏幕录制、键盘记录器或接触设备的攻击者都可能看到数据。浏览器存储也可能被清除或回收。请将加密备份及其对应的口令或恢复码分开存放在别处。",
  "docs.vault.visual.eyebrow": "本地可视化层",
  "docs.vault.visual.body":
    "Apache ECharts 在已解锁的保险库内渲染 SVG。记录构成图表使用加密的记录数量；收藏品历史使用精确的购买批次，外加最多 20 条由所有者输入的有日期参考；投资组合配置使用明确输入的参考值，并保持各币种相互独立。JavaScript 数字仅在精确字符串运算之后用作绘图坐标。源值仍可在相邻的无障碍表格中查看，且没有任何图表库或图表 API 会通过网络接收这些值。",

  "docs.evidence.eyebrow": "03 · 规范化",
  "docs.evidence.title": "一个来源并不自动等于事实。",
  "docs.evidence.intro":
    "每个适配器都会将提供商特定的响应转换为更小的内部模型。该界面旨在揭示某个陈述为何出现——而不只是打印 API 返回的任何内容。",
  "docs.evidence.identity.title": "规范身份",
  "docs.evidence.identity.copy":
    "在附加数据之前，先匹配完整的链、合约、交易、卡牌/系列、产品或资金池标识符。",
  "docs.evidence.exactValues.title": "精确数值",
  "docs.evidence.exactValues.copy":
    "将代币 ID 和大整数保留为字符串。本地到手成本计算使用十进制系数，而非 JavaScript 浮点数。",
  "docs.evidence.freshness.title": "新鲜度",
  "docs.evidence.freshness.copy":
    "返回抓取时间和有界的新鲜度时长。当前、陈旧、有效为空、部分可用和不可用是彼此不同的状态。",
  "docs.evidence.reconciliation.title": "直接对账",
  "docs.evidence.reconciliation.copy":
    "索引发现用于寻找候选项；当功能需要链上所有权或状态时，以直接的链上读取为准。",
  "docs.evidence.provenance.title": "来源溯源",
  "docs.evidence.provenance.copy":
    "规范化后的行保留人类可读的来源链接，以及足够的身份上下文，以便审计实际观测到的内容。",
  "docs.evidence.failClosed.title": "失效关闭",
  "docs.evidence.failClosed.copy":
    "格式错误、过大、被重定向、受速率限制、超出预算或身份冲突的响应，都不会成为干净的事实。",

  "docs.adapters.eyebrow": "04 · 功能契约",
  "docs.adapters.title": "不同的资产需要不同的证明。",
  "docs.adapters.introEnabled":
    "当前创始人测试版构建中，研究、兑换预览、投资组合、股票代币核查和收藏品目录已启用。市场与库存、开放数据和重放操作即将推出。",
  "docs.adapters.introGated":
    "当前创始人测试版构建中，研究、兑换预览、投资组合、股票代币核查已启用。收藏品目录、市场与库存、开放数据和重放操作即将推出。",
  "docs.adapters.comingSoon": "即将推出",
  "docs.adapters.privateExplorer.name": "研究",
  "docs.adapters.privateExplorer.input":
    "一个公开的钱包、交易、代币或合约",
  "docs.adapters.privateExplorer.process":
    "有边界的提供商解析 + 确定性解释",
  "docs.adapters.privateExplorer.output":
    "附来源链接的事实、覆盖范围、风险和通俗说明",
  "docs.adapters.privateExplorer.limit":
    "默认不保存；可选加密的本地对话历史",
  "docs.adapters.swapPreview.name": "兑换预览",
  "docs.adapters.swapPreview.input": "WETH/USDG 方向与确切金额",
  "docs.adapters.swapPreview.process":
    "使用固定非用户预览地址的只读 Uniswap 路径",
  "docs.adapters.swapPreview.output":
    "最低接收量、价格影响、模拟、路径成本、官方交接",
  "docs.adapters.swapPreview.limit": "Opsis 绝不签名或广播",
  "docs.adapters.portfolio.name": "已保存",
  "docs.adapters.portfolio.input": "一个已批准的 Robinhood Chain 地址",
  "docs.adapters.portfolio.process":
    "捕获当前区块，核对直接读取结果，重新校验区块哈希",
  "docs.adapters.portfolio.output":
    "有边界的持仓、活动、变动、授权、覆盖范围",
  "docs.adapters.portfolio.limit":
    "当前锚点并非最终值；部分数据会保持标注",
  "docs.adapters.rwaVerify.name": "股票代币核查",
  "docs.adapters.rwaVerify.input": "一个公开的代币或保险库合约",
  "docs.adapters.rwaVerify.process":
    "合约优先的身份、预言机、角色、保险库和来源检查",
  "docs.adapters.rwaVerify.output":
    "已确认、不可用、陈旧和所有者报告的证据",
  "docs.adapters.rwaVerify.limit":
    "证据并非真实性、赎回或估值",
  "docs.adapters.collectibles.name": "收藏品",
  "docs.adapters.collectibles.input":
    "英文卡牌名称、编号和可选系列",
  "docs.adapters.collectibles.process":
    "按字段选取的 TCGdex 元数据 + 可选的低分辨率 asset-CDN 图像",
  "docs.adapters.collectibles.output":
    "卡牌/系列身份和净化后的加密缩略图；所有者声明保留在本地",
  "docs.adapters.collectibles.limit":
    "不提供市场定价、评级、真实性或库存声明",
  "docs.adapters.marketInventory.name": "市场与库存",
  "docs.adapters.marketInventory.input":
    "确切的公开合约或经审核的商家映射",
  "docs.adapters.marketInventory.process":
    "有边界的 DEX 观测或选择加入的商家可用性",
  "docs.adapters.marketInventory.output":
    "新鲜度、身份、来源、可用性、本地到手成本",
  "docs.adapters.marketInventory.limit":
    "无执行、抓取、完整库存或卖家评分",
  "docs.adapters.openData.name": "开放数据 V1",
  "docs.adapters.openData.input":
    "一次经审核的支持注册表读取，或一个公开的 EVM 地址",
  "docs.adapters.openData.process":
    "静态 Opsis 元组或确定性的语法规范化",
  "docs.adapters.openData.output":
    "带版本的注解、限制和人工验证链接",
  "docs.adapters.openData.limit":
    "两条路由；不调用提供商、无搜索、无实时状态、无 API 密钥、无批量数据",
  "docs.adapters.replayActions.name": "重放操作",
  "docs.adapters.replayActions.input":
    "一个完整的本地变动模式，或一份刚审核过的报价",
  "docs.adapters.replayActions.process":
    "严格的本地模式检查 + 必须提供新的方向/金额或当前报价",
  "docs.adapters.replayActions.output":
    "最新报价或官方产品页面的交接",
  "docs.adapters.replayActions.limit":
    "不复用旧的调用数据、授权、金额、购物车、订单或结账信息",

  "docs.security.eyebrow": "05 · 纵深防御",
  "docs.security.title": "隐私由一道道边界组成。",
  "docs.security.noSigner.title": "无签名方",
  "docs.security.noSigner.copy":
    "Opsis 绝不索要助记词，也不批准、签名、路由、提交或广播交易。",
  "docs.security.networkReceipts.title": "明确的网络凭据",
  "docs.security.networkReceipts.copy":
    "敏感的公开关联只在界面指明目的地和字段后才会发送。涉及保险库状态时，已批准的尝试会先被加密。",
  "docs.security.sameOrigin.title": "同源浏览器 API",
  "docs.security.sameOrigin.copy":
    "浏览器调用始终停留在 Opsis 来源上。Nginx 代理到 API；匿名私有路由会省略凭据。",
  "docs.security.boundedDestinations.title": "有界目的地",
  "docs.security.boundedDestinations.copy":
    "提供商主机、方法、字段、响应大小、重试、并发和预算都按适配器加以约束。",
  "docs.security.lowData.title": "低数据运营",
  "docs.security.lowData.copy":
    "没有被动分析或第三方字体。请求日志使用路由模板；公开的滥用控制键经过假名化处理。",
  "docs.security.killSwitches.title": "终止开关",
  "docs.security.killSwitches.copy":
    "提供商功能带有开关和共享的支出/请求预算。当关键防护不可用时，生产路径会失效关闭。",
  "docs.security.footer":
    "开源有助于人们审查这些选择；它本身并不是安全保证。发布门禁结合了类型化构建、单元与浏览器故障测试、精确提交暂存、终止开关演练以及不可变的发布候选版本。",

  "docs.token.eyebrow": "06 · 设计实验室 · 尚未上线",
  "docs.token.title": "在不污染产品的前提下设计代币用途。",
  "docs.token.proposal.title": "提案，并非已发布的代币经济模型",
  "docs.token.proposal.body":
    "Opsis 代币计划通过 Robinhood Chain 上的 pons v2 启动。产品用途、供应量、分配、归属、计价资产、费用、创作者税、回购设置、合约和启动 URL 在存在并在链上公开验证之前，均不在此声明为最终条款。",
  "docs.token.candidates.betaAccess.label": "最低复杂度",
  "docs.token.candidates.betaAccess.title": "测试版访问通行证",
  "docs.token.candidates.betaAccess.copy":
    "可选的钱包证明或许能在公开发布前解锁实验性模块。核心隐私、保险库访问和安全说明应当无需代币即可使用。",
  "docs.token.candidates.apiQuota.label": "不在 V1 中",
  "docs.token.candidates.apiQuota.title": "公共 API 配额提升",
  "docs.token.candidates.apiQuota.copy":
    "开放数据 v1 没有密钥或代币权益。后续版本可以考虑有界的更高配额，但全局 $0 支出上限和滥用限制仍将优先。",
  "docs.token.candidates.partnerPerks.label": "合作方资助 · 后续",
  "docs.token.candidates.partnerPerks.title": "可选的合作方权益",
  "docs.token.candidates.partnerPerks.copy":
    "选择加入的商家或协议可以提供范围清晰界定的持有者权益。由合作方出资并履行；Opsis 标注条款，绝不保证可用性、价值或持续性。",
  "docs.token.candidates.sourceCuration.label": "仅供参考",
  "docs.token.candidates.sourceCuration.title": "咨询性的来源策展",
  "docs.token.candidates.sourceCuration.copy":
    "代币持有者可以提议集成，或表明哪些公开来源值得审查。投票绝不能取代 Opsis 的独立验证，也不能让某个事实变成真的。",
  "docs.token.good.title": "良好的代币设计",
  "docs.token.good.item1": "可选、精确、可审计的权益",
  "docs.token.good.item2":
    "有用的产品权益，而非被动投机",
  "docs.token.good.item3":
    "全局隐私、安全和提供商预算限制仍然优先",
  "docs.token.good.item4": "官方合约是规范身份",
  "docs.token.bad.title": "不要构建",
  "docs.token.bad.item1": "以代币作为门槛的隐私、保险库访问或基本安全事实",
  "docs.token.bad.item2":
    "暗示股权、收入分成、收益或保证回报",
  "docs.token.bad.item3": "付费排名来源、资产或“已验证”声明",
  "docs.token.bad.item4":
    "隐藏的发行、分配、管理员权限或可变的经济模型",
  "docs.token.pons.title": "pons v2 是启动轨道，而非本应用。",
  "docs.token.pons.body":
    "官方 pons v2 文档描述了一种由钱包签名的联合曲线启动，随后毕业进入一个流动性头寸被锁定的 Uniswap v4 资金池。Opsis 不在该曲线内运行，不将保险库数据存储在 pons 中，也不把毕业视为产品质量。每一项最终启动条款都必须从已部署的链上记录中读取。",
  "docs.token.pons.link": "官方 PONS V2 文档",
};
