type Copy = [string, string];

const factLabels: Record<string, string> = {
  Address: "地址", Name: "名称", Symbol: "符号", Decimals: "小数位数", Type: "类型",
  Holders: "持有人", "Lifetime transfers": "累计转移次数", "Exchange rate": "汇率",
  Deployer: "部署者", Verified: "已验证", Proxy: "代理合约", "Proxy type": "代理类型",
  Implementations: "实现合约", "Holder coverage": "持有人覆盖", "Activity coverage": "活动覆盖",
  "Source coverage": "来源覆盖", "Token balance coverage": "代币余额覆盖",
  "Recent transfers": "近期转移", "Liquidity pool share": "流动性池占比", "Liquidity pools": "流动性池",
  "Top1 wallet share": "最大钱包占比", "Top5 wallet share": "前五大钱包占比", "Top10 wallet share": "前十大钱包占比",
  "Top holders": "主要持有人", "Holders analyzed": "已分析持有人", "Deployer still holds": "部署者仍持有",
  "Scam flagged holders": "被标记为诈骗的持有人", "Total supply tokens": "代币总供应量", "Burned share": "销毁占比",
  "Native balance eth": "ETH 原生余额", "Transactions fetched": "已读取交易", "Recent transactions": "近期交易",
  "Today activity": "今日活动", "Contracts interacted with": "交互合约", "Failed transactions": "失败交易",
  "High value movements": "大额变动", "Approval transactions": "授权交易", "Token transfers": "代币转移",
  "Internal transactions": "内部交易", "Token balances": "代币余额", "Unusual activity": "异常活动",
  "Has token transfers": "存在代币转移", "Has tokens": "存在代币", "Is contract": "是否为合约",
  "Transaction outcome": "交易结果", From: "发送方", To: "接收方", "Value eth": "ETH 金额",
  "Block number": "区块高度", "Block hash": "区块哈希", "Gas used": "已用 Gas", Hash: "哈希",
  "Proxy implementation": "代理实现", "Explorer reputation": "浏览器信誉标记", "Explorer observed at": "浏览器观察时间",
  Observation: "观察类型", "Observation finality": "观察最终性", "Decode coverage": "解码覆盖",
  "Source verified": "来源已验证", "Contract name": "合约名称", "Deployed at": "部署时间",
  "Token balance contracts checked": "已检查余额的代币合约", "Top10 contract count": "前十大持有人中的合约数量",
  "Transaction evidence coverage": "交易证据覆盖", "Receipt transfer coverage": "收据转移覆盖",
  "Receipt transfer events": "收据转移事件", "Decoded actions": "已解码操作", Status: "状态", Value: "金额",
  Timestamp: "时间戳", Method: "方法", "Method id": "方法标识", "Transaction hash": "交易哈希",
};
const values: Record<string, string> = {
  yes: "是", no: "否", unknown: "未知", unavailable: "不可用", success: "成功", failed: "失败", pending: "待处理",
  top_holders: "主要持有人", indexed_window: "索引窗口", explorer_metadata: "浏览器元数据",
  rpc_sample_only: "仅 RPC 采样", reviewed_asset_sample: "已审核资产采样",
};

/** Translate Opsis's generated labels, keeping provider names and values verbatim. */
export function researchFactCopy(fact: string): Copy {
  const separator = fact.indexOf(": ");
  const label = fact.slice(0, separator);
  if (separator < 0 || !factLabels[label]) return [fact, fact];
  const value = fact.slice(separator + 2);
  const isData = ["Name", "Symbol", "Type", "Proxy type", "Method", "Method id"].includes(label);
  const translated = isData ? value : values[value] ?? value.replace(/^(\d+) items? returned$/, "返回 $1 项");
  return [fact, `${factLabels[label]}：${translated}`];
}

export function researchSeverityCopy(severity: string): Copy {
  return [severity, ({ info: "信息", low: "低", medium: "中", high: "高" } as Record<string, string>)[severity] ?? severity];
}

const notes: Record<string, string> = {
  "Transaction may have failed. The source data indicates a failed or unsuccessful transaction status. This is a data-based note, not a judgment about intent.": "交易可能失败。来源数据显示交易状态为失败或未成功。这是基于数据的提示，并非对意图的判断。",
  "An internal call may have failed. The transaction source reports an error in at least one internal call. Review the internal-call evidence for context.": "内部调用可能失败。交易来源报告至少一次内部调用发生错误。请查看内部调用证据以了解背景。",
  "Method is not decoded. The available provider data did not identify the called method. This can limit interpretation of the transaction intent.": "方法未解码。现有提供商数据未识别所调用的方法。这可能限制对交易意图的解读。",
  "Proxy contract detected. The available explorer metadata indicates proxy behavior. Review the current implementation contract when interpreting source code.": "检测到代理合约。现有区块浏览器元数据显示代理行为。解读源代码时，请查看当前的实现合约。",
  "Token contract is not verified in available source data. The explorer data did not report verified source code for this token contract. This is a review signal, not a scam verdict.": "现有来源数据未验证此代币合约。区块浏览器未报告此代币合约具有已验证的源代码。这是核查提示，并非诈骗判定。",
  "Contract is not verified in available source data. Unverified contracts are harder to inspect. Treat this as a review signal, not proof of malicious behavior.": "现有来源数据未验证此合约。未验证的合约较难检查。这是核查提示，并非恶意行为的证据。",
  "Token metadata is incomplete. The provider did not return basic token metadata. This can happen for new or unsupported tokens.": "代币元数据不完整。提供商未返回基本代币元数据。新代币或不受支持的代币可能出现这种情况。",
  "Recently deployed contract. The available deployment timestamp is within the last 30 days. Recency is a review signal, not evidence of malicious behavior.": "近期部署的合约。现有部署时间戳在过去 30 天内。部署时间较近是核查提示，并非恶意行为的证据。",
};
const noteTemplates: [RegExp, string][] = [
  [/^Supply is concentrated in a few holders\. The ten largest holders hold ([\d.]+)% of supply, excluding trading pools and burn addresses\. Widely held tokens are usually under 25%\. A group this size can move the price on its own\.(.*)$/, "供应量集中于少数持有人。前十大持有人持有供应量的 $1%，不含交易池和销毁地址。广泛持有的代币通常低于 25%。如此规模的群体可独自影响价格。$2"],
  [/^Supply is somewhat concentrated\. The ten largest holders hold ([\d.]+)% of supply, excluding trading pools and burn addresses\. That is above the ~25% typical of widely held tokens\.(.*)$/, "供应量有一定集中度。前十大持有人持有供应量的 $1%，不含交易池和销毁地址。这高于广泛持有代币通常约 25% 的水平。$2"],
  [/^One contract holds a large share\. The largest holder is a contract(.*?) holding ([\d.]+)% of supply\. A contract can hold tokens for many users, such as a lending market, or for one party, such as a team multisig; the explorer data does not say which\.$/, "单个合约持有较大份额。最大持有人是合约$1，持有供应量的 $2%。合约可能为多个用户持有代币（如借贷市场），也可能为单一主体持有（如团队多签）；区块浏览器数据未说明属于哪种情况。"],
  [/^One wallet holds a large share\. The largest single wallet holds ([\d.]+)% of supply\. A sale from one address that size would be felt by everyone else\.$/, "单个钱包持有较大份额。最大单一钱包持有供应量的 $1%。如此规模的地址出售代币会影响其他持有人。"],
  [/^Little of the supply is in recognised trading pools\. Pools the explorer names as trading pools hold ([\d.]+)% of supply\. Pools it does not name are not counted, so trading liquidity may be larger; thin liquidity would mean modest trades move the price sharply\.$/, "已识别交易池中的供应量较少。区块浏览器标记的交易池持有供应量的 $1%。未被标记的池未计入，因此实际交易流动性可能更多；流动性较薄时，较小交易也可能大幅影响价格。"],
  [/^The deployer still holds a position\. The wallet that created this token still holds ([\d.]+)% of supply\. That is not wrongdoing by itself, but it is a position that could be sold\.$/, "部署者仍持有仓位。创建此代币的钱包仍持有供应量的 $1%。这本身并非不当行为，但这些代币可能被出售。"],
  [/^A holder is flagged by the explorer\. (\d+) address\(es\) among the largest holders carry a scam flag in explorer metadata\. Treat that as a prompt to look closer, not a verdict\.$/, "区块浏览器标记了持有人。主要持有人中有 $1 个地址在浏览器元数据中带有诈骗标记。这是进一步核查的提示，并非定论。"],
  [/^Active unlimited token approval found\. (\d+) unlimited approval\(s\) remain active according to the latest read-only allowance call\.$/, "发现当前无限额代币授权。根据最新只读额度调用，仍有 $1 项无限额授权有效。"],
  [/^Token approval activity found\. (\d+) approval transaction or active approval record\(s\) appear in the fetched evidence\. Review the spender and current allowance state\.$/, "发现代币授权活动。已读取证据中有 $1 项授权交易或有效授权记录。请核查支出方和当前额度状态。"],
  [/^Historical broad token approval found\. (\d+) unlimited or operator-wide approval transaction\(s\) appear in the fetched activity window, but current allowance state was not available\.$/, "发现历史广泛代币授权。已读取活动窗口中有 $1 笔无限额或全局操作授权交易，但当前额度状态不可用。"],
  [/^Repeated transaction failures\. (\d+) failed transactions appear in the fetched activity window\. This can indicate contract errors, insufficient gas, or repeated unsuccessful attempts\.$/, "多次交易失败。已读取活动窗口中有 $1 笔失败交易。这可能表示合约错误、Gas 不足或重复失败的尝试。"],
  [/^High-value native movement found\. (\d+) transaction\(s\) met the disclosed one-native-token review threshold\. Value alone does not imply risk\.$/, "发现大额原生代币变动。$1 笔交易达到已披露的一个原生代币核查阈值。金额本身不代表风险。"],
  [/^Frequent contract interaction\. The fetched window includes interactions with (\d+) distinct contracts\. This is an activity observation, not a risk verdict\.$/, "频繁合约交互。已读取窗口包含与 $1 个不同合约的交互。这是活动观察，并非风险判定。"],
  [/^Transaction may have failed\. The source data indicates an unsuccessful transaction: (.*)\.$/, "交易可能失败。来源数据显示交易未成功，原始信息：$1。"],
  // Earlier responses can remain in tab memory while the interface language changes.
  [/^Supply is concentrated in a few wallets\. The ten largest private wallets hold ([\d.]+)% of supply, excluding any trading pool\. Widely held tokens are usually under 25%\. A group this size can move the price on its own\.$/, "供应量集中于少数钱包。前十大私人钱包持有供应量的 $1%，不含交易池。广泛持有的代币通常低于 25%。如此规模的群体可独自影响价格。"],
  [/^Very little of the supply is tradeable\. Only ([\d.]+)% of supply sits in a trading pool\. Thin liquidity means even modest trades move the price sharply, and large positions can be hard to exit\.$/, "可交易供应量很少。仅有 $1% 的供应量位于交易池中。流动性较薄意味着较小交易也会大幅影响价格，大额仓位可能难以退出。"],
];
export function researchNoteCopy(note: string): Copy {
  if (notes[note]) return [note, notes[note]];
  for (const [pattern, replacement] of noteTemplates) {
    if (pattern.test(note)) return [note, note.replace(pattern, replacement)
      .replace(/ One of them is a contract, such as a lending market, vault or multisig wallet, which can hold tokens for many users rather than one owner\./, "其中一个是合约（如借贷市场、保险库或多签钱包），可能为多个用户持有代币，而非仅为单一所有者。")
      .replace(/ (\d+) of them are contracts, such as a lending market, vault or multisig wallet, which can hold tokens for many users rather than one owner\./, "其中 $1 个是合约（如借贷市场、保险库或多签钱包），可能为多个用户持有代币，而非仅为单一所有者。")];
  }
  return [note, note];
}

export function researchPrivacyCopy(disclosure: string): Copy {
  const match = /^Only the public chain identifier is user-supplied to the listed data providers\. When indexer balances are unavailable, the (.+?) may also receive Opsis's fixed 12-contract reviewed sample in one read-only balance call\.( dRPC is a paid gateway that may route each read to an independent node operator in its network\.)? Your question is not sent to providers or to a model provider\.(?: Public token data read from Blockscout may be reused for up to (\d+) minutes and is kept without any visitor identifier\.)?$/.exec(disclosure);
  if (!match) return [disclosure, disclosure];
  return [disclosure, `用户仅向列出的数据提供商提交公开链上标识符。当索引器余额不可用时，${match[1]} 也可能在一次只读余额调用中收到 Opsis 固定的 12 个已审核合约采样。${match[2] ? "dRPC 是付费网关，可能将每次读取路由至其网络中的独立节点运营商。" : ""}您的问题不会发送给数据提供商或模型提供商。${match[3] ? `从 Blockscout 读取的公开代币数据最多可复用 ${match[3]} 分钟，保存时不附带任何访客标识符。` : ""}`];
}
