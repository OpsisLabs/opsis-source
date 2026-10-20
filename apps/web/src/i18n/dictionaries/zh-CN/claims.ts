export const claims = {
  "claims.title": "声明核查",
  "claims.intro": "按明确区块的链上证据核查代币声明。非投资建议。",
  "claims.privacy":
    "文本留在此浏览器中。模式匹配前移除账号标识和网址。仅发送已确认地址、结构化声明和发布时间。",
  "claims.paste": "帖子文本",
  "claims.find": "查找声明",
  "claims.pattern": "由模式发现",
  "claims.manual": "按类型添加",
  "claims.add": "添加声明",
  "claims.remove": "移除",
  "claims.type": "声明类型",
  "claims.address": "合约地址",
  "claims.reminder": "同名代币很常见。运行前请确认准确的合约地址。",
  "claims.confirm": "确认此合约地址",
  "claims.confirmed": "地址已确认",
  "claims.time": "发布时间（可选，本地时间）",
  "claims.run": "运行声明核查",
  "claims.busy": "核查中…",
  "claims.error": "核查不可用。请检查地址、参数与预算后重试。",
  "claims.expected": "声明状态",
  "claims.yes": "存在",
  "claims.no": "不存在",
  "claims.percent": "百分比",
  "claims.comparison": "比较",
  "claims.under": "低于",
  "claims.over": "高于",
  "claims.equal": "等于",
  "claims.buy": "买入税 %",
  "claims.sell": "卖出税 %",
  "claims.current": "当前，尚未最终确认",
  "claims.post": "发布时间",
  "claims.unknownBlock": "区块不可用",
  "claims.agrees": "一致",
  "claims.differs": "有差异",
  "claims.can't check": "无法核查",
  "claims.ownership": "所有权已放弃",
  "claims.paused": "合约暂停／未暂停",
  "claims.lpBurned": "LP 已销毁",
  "claims.top10": "前 10 持有人占比",
  "claims.deployer": "部署者占比",
  "claims.launchpad": "发行平台",
  "claims.verified": "合约源码已验证",
  "claims.tax": "买卖税",
  "claims.unsupported": "其他声明",
  "claims.launcher":
    "Uniswap Liquidity Launcher（包括 pools.trade 和其他前端）",
  "claims.reason": "原因",
  "claims.definition": "定义",
  "claims.evidence": "证据",
  "claims.definition.ownership":
    "所有权已放弃指 owner() 读取为零地址，且 ERC-1967 管理员槽为零。任一读取不可用则无法核查。",
  "claims.definition.paused":
    "合约暂停／未暂停指标准 paused() 读取与所声明状态一致。读取不可用则无法核查。",
  "claims.definition.lpBurned":
    "LP 已销毁指发行事实能观察到的每个 LP 仓位由零地址或 0x000000000000000000000000000000000000dEaD 持有。接收方覆盖未知或不完整则无法核查。初始接收方记录本身不证明当前持有状态。",
  "claims.definition.top10":
    "前 10 持有人低于／高于／等于 X% 指浏览器报告的占比满足严格比较或精确相等。流动池和销毁地址按浏览器报告计入。浏览器仅支持当前数据；历史或缺失证据无法核查。",
  "claims.definition.deployer":
    "部署者低于／高于／等于 X% 指指定区块的 balanceOf(deployer) / totalSupply 满足比较。部署者来自发行事实。缺少发行事实、余额或正总供应量则无法核查。",
  "claims.definition.launchpad":
    "在某平台发行指发行事实匹配该注册表适配器。Uniswap Liquidity Launcher 包含 pools.trade 和其他前端；匹配不识别前端。缺少证据则无法核查。",
  "claims.definition.verified":
    "合约源码已验证指浏览器标志与所声明状态一致。浏览器仅支持当前数据；历史或不可用证据无法核查。",
  "claims.definition.tax":
    "此版本无法核查买卖税 X%／无税。",
  "claims.definition.unsupported": "此版本无法核查已公布列表之外的声明类型。",
  "claims.detail.Source evidence unavailable at the stated block":
    "指定区块的来源证据不可用",
  "claims.detail.Evidence unavailable": "证据不可用",
  "claims.detail.Owner or ERC-1967 admin read unavailable":
    "所有者或 ERC-1967 管理员读取不可用",
  "claims.detail.Pause read unavailable": "暂停状态读取不可用",
  "claims.detail.LP recipients unavailable": "LP 接收方不可用",
  "claims.detail.Supply share unavailable or invalid": "供应占比不可用或无效",
  "claims.detail.Tax claims can't be checked in this version":
    "此版本无法核查税费声明",
  "claims.detail.Claim type outside the published list":
    "声明类型不在已公布列表中",
  "claims.detail.Post time is after the captured current block":
    "发布时间晚于捕获的当前区块",
  "claims.detail.Post time precedes the first available block":
    "发布时间早于首个可用区块",
  "claims.detail.Launch registry match is missing": "发行注册表匹配缺失",
  "claims.detail.LP recipient coverage is unknown or partial, or only an initial non-burn recipient is available":
    "LP 接收方覆盖未知或不完整，或仅有初始非销毁接收方记录",
  "claims.detail.Launch facts do not identify a deployer":
    "发行事实未确定部署者",
  "claims.detail.Explorer evidence is current-only and cannot be read at the post-time block":
    "浏览器证据仅限当前，无法读取发布时区块的数据",
  "claims.detail.Explorer holder share unavailable": "浏览器持有人占比不可用",
  "claims.detail.Explorer verification flag unavailable":
    "浏览器验证标志不可用",
  "claims.detail.Explorer current sample; not block-pinned. Pools and burn addresses included as reported.":
    "浏览器当前样本；未锚定区块。按报告计入流动池和销毁地址。",
  "claims.detail.Launch facts recorded the burn recipient; other position transfers are not indexed":
    "发行事实记录的销毁接收方；其他仓位转移未建立索引",
  "claims.detail.paused": "已暂停",
  "claims.detail.not paused": "未暂停",
  "claims.detail.verified": "已验证",
  "claims.detail.not verified": "未验证",
  "claims.detail.Robinhood Chain RPC": "Robinhood Chain RPC",
  "claims.evidenceKey.source": "来源",
  "claims.evidenceKey.coverage": "覆盖范围",
  "claims.evidenceKey.block": "区块",
  "claims.evidenceKey.timestamp": "时间",
  "claims.evidenceKey.owner": "所有者",
  "claims.evidenceKey.admin": "管理员",
  "claims.evidenceKey.paused": "暂停状态",
  "claims.evidenceKey.numerator": "持有量（原始单位）",
  "claims.evidenceKey.denominator": "总供应量（原始单位）",
  "claims.evidenceKey.adapter": "注册表适配器",
  "claims.evidenceKey.recipients": "接收方",
  "claims.evidenceKey.method": "方法版本",
  "claims.evidenceKey.observedAt": "观测时间",
  "claims.evidenceKey.deployer": "部署者",
  "claims.evidenceKey.verified": "源码验证状态",
} as const;
