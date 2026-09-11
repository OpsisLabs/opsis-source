export const overlap = {
  "overlap.open": "共同持仓",
  "overlap.badge": "精确合约 · 共同持仓",
  "overlap.title": "关注的钱包持有哪些相同代币？",
  "overlap.intro":
    "选择观察列表中的钱包，查看哪些代币在至少两个钱包的最近一次已保存检查中余额大于零，无需再次查询。",
  "overlap.shared": "共同持有的代币合约",
  "overlap.selected": "已选钱包",
  "overlap.boundary":
    "已保存检查的时间可能不同。共同持仓不能证明买入、协同行为、相同所有者或代币质量。",
  "overlap.partial":
    "部分检查的覆盖范围有限。未列出的代币或钱包不代表已确认零余额。",
  "overlap.choose": "选择要比较的钱包",
  "overlap.selectAll": "选择所有钱包",
  "overlap.clear": "清除选择",
  "overlap.search": "搜索共同代币或精确合约",
  "overlap.count": "{count} 个匹配的共同代币合约",
  "overlap.needTwo": "请选择至少两个已保存钱包。",
  "overlap.needTwoBody":
    "在钱包详情中添加钱包并保存检查，再选择你想比较的钱包。",
  "overlap.empty": "这些检查中未发现共同代币。",
  "overlap.emptyBody":
    "仅比较所选检查中返回且余额大于零的 ERC20 代币。数据源覆盖限制可能导致共同持仓未显示，不能据此证明不存在。",
  "overlap.noMatch": "请尝试其他代币名称或合约，或清除搜索。",
  "overlap.heldBy": "{total} 个已选钱包中有 {count} 个持有",
  "overlap.incompatible":
    "这些观察结果的代币精度或同高度区块哈希存在分歧。数量按保存时显示，不会合并；请检查来源并刷新后再比较。",
  "overlap.change.changed": "余额变动",
  "overlap.change.unchanged": "两次检查之间未变",
  "overlap.change.baseline": "首次检查 · 暂无对比",
  "overlap.change.missing": "上次未返回 · 变动未知",
  "overlap.change.metadata": "精度已变 · 无法比较",
  "overlap.since": "对比检查时间：{time}",
  "overlap.how": "此比较如何工作",
  "overlap.method":
    "仅匹配 Robinhood Chain 上的精确 ERC20 合约，不按名称或符号匹配。不包含原生 ETH 或 NFT。使用每个已选钱包最近一次已保存检查（最多 10 条代币记录），并在可用时与上次检查比较精确数量。缺失代币不会被当作零余额。不会跨钱包汇总数量，也不会计算为利润。请在钱包详情中逐个刷新。区块尚未最终确认；标签和检查仍加密保存在此设备。",
} as const;
