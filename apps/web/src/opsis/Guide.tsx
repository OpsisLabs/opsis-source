import { Link } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
export default function Guide({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const tools = [
    {
      to: "/research",
      title: c("Follow the evidence", "追溯证据"),
      body: c(
        "Paste a public identity. Choose a question. Select a finding to inspect its dated sources.",
        "粘贴公开标识并选择问题，选中发现以查看注明日期的来源。",
      ),
      enabled: capabilities.research,
    },
    {
      to: "/check",
      title: c("Compare an exit", "比较退出报价"),
      body: c(
        "Compare the observed outputs of V3 pools for one entered size. Fees, failed pools and expiry stay visible.",
        "比较同一输入数量下 V3 池的观察输出，查看费用、失败池和到期时间。",
      ),
      enabled: capabilities.exitCheck,
    },
    {
      to: "/watch",
      title: c("See what changed", "查看变化"),
      body: c(
        "Save public wallets in your encrypted local Vault. Compare retained checks and inspect activity, overlap and coverage.",
        "在本地加密保险库中保存公开钱包，比较保留的核查、活动、重叠及覆盖范围。",
      ),
      enabled: capabilities.watch,
    },
    {
      to: "/lab",
      title: c("Explore in three dimensions", "三维探索"),
      body: c(
        "Rotate a captured pool atlas, compare tokens and adjust a hypothetical portfolio shock surface.",
        "旋转历史资金池图谱，比较代币并调整假设投资组合冲击曲面。",
      ),
      enabled: true,
    },
    {
      to: "/saved",
      title: c("Keep your own context", "保留个人背景"),
      body: c(
        "Encrypted records, holdings and allocation views stay on this device. Back up your Vault before clearing browser storage.",
        "加密记录、持仓及分配视图保留在此设备上。清除浏览器存储前请备份保险库。",
      ),
      enabled: true,
    },
    {
      to: "/research/events",
      title: c("Put markets in context", "理解市场背景"),
      body: c(
        "Explore the captured ETH market brief and globe of source-linked events. Publication timing is not proof of causation.",
        "探索已采集的 ETH 市场简报和关联来源的事件地球仪。发布时间不代表因果关系。",
      ),
      enabled: import.meta.env.VITE_SITUATION_ROOM_ENABLED === "true",
    },
  ];
  return (
    <>
      <header className="opsis-heading">
        <p className="opsis-kicker">
          {c("FIELD GUIDE / OPSIS", "使用指南 / OPSIS")}
        </p>
        <h1>{c("Find your way through.", "找到探索的方向。")}</h1>
        <p>
          {c(
            "One visual language. Different ways to inspect the evidence.",
            "统一的视觉语言，多种检查证据的方式。",
          )}
        </p>
      </header>
      <div className="opsis-guide-grid">
        {tools.map((tool, i) => (
          <article key={tool.to} className="opsis-panel">
            <p className="opsis-kicker">0{i + 1}</p>
            <h2>{tool.title}</h2>
            <p>{tool.body}</p>
            {tool.enabled ? (
              <Link className="opsis-action" to={tool.to}>
                {c("Open tool ↗", "打开工具 ↗")}
              </Link>
            ) : (
              <p className="opsis-small">
                {c("Not enabled on this deployment", "此部署未启用")}
              </p>
            )}
          </article>
        ))}
      </div>
      <p className="opsis-receipt">
        {c(
          "Research uses public data; availability depends on the configured providers. Private notes and saved records stay encrypted locally. These tools do not execute transactions.",
          "研究使用公开数据，可用性取决于已配置的提供商。私人笔记和保存记录保留在本地加密存储中。这些工具不执行交易。",
        )}
      </p>
    </>
  );
}
