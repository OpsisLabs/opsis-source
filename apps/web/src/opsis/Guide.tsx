import { useState } from "react";
import { Link } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { audiences, toolGuides, type ToolGuide } from "./tool-guide";
import { toolGroups } from "./shell-model";
import { KNOWN_ASSETS } from "./known-assets";
import { workspaceLink } from "./model";
import PublicSearch from "./shell/PublicSearch";
import GroupPicture from "./shell/GroupPicture";
export default function Guide({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState("new");
  const audience = audiences.find((a) => a.id === selected)!;
  function card(tool: ToolGuide, index?: number) {
    if (!tool.enabled(capabilities)) return null;
    return (
      <article key={tool.path} className="opsis-panel">
        <p className="opsis-kicker">
          {index === undefined
            ? c("GOOD FOR", "适合")
            : index === 0
              ? c("START HERE", "从这里开始")
              : c("THEN, IF YOU NEED IT", "然后，按需使用")}{" "}
          · {c(...tool.audience)}
        </p>
        <h2>{c(...tool.name)}</h2>
        <dl className="opsis-tool-facts">
          <div>
            <dt>{c("Start with", "从这里开始")}</dt>
            <dd>{c(...tool.input)}</dd>
          </div>
          <div>
            <dt>{c("What you get", "您得到的内容")}</dt>
            <dd>{c(...tool.outcome)}</dd>
          </div>
        </dl>
        {tool.enabled(capabilities) ? (
          <Link className="opsis-action" to={tool.path}>
            {c("Open", "打开")} {c(...tool.name)} →
          </Link>
        ) : (
          <p className="opsis-small">
            {c("Not enabled on this deployment", "此部署未启用")}
          </p>
        )}
      </article>
    );
  }
  return (
    <>
      <header className="opsis-heading opsis-guide-heading">
        <p className="opsis-kicker">{c("Your research desk", "您的研究桌")}</p>
        <h1>{c("What do you want to find out?", "您想了解什么？")}</h1>
        <p>
          {c(
            "Follow the evidence. Start with a public identifier.",
            "追随证据。从公开标识开始。",
          )}
        </p>
      </header>
      {capabilities.research && (
        <>
          <PublicSearch overview />
          <div
            className="opsis-guide-examples"
            aria-label={c("Research examples", "研究示例")}
          >
            <span>{c("Try", "试试")}</span>
            {["WETH", "USDG", "AAPL", "NVDA"].map((symbol) => {
              const asset = KNOWN_ASSETS.find(
                (asset) => asset.symbol === symbol,
              );
              return (
                asset && (
                  <Link
                    key={symbol}
                    to={workspaceLink("/research", asset.address)}
                  >
                    {symbol}
                  </Link>
                )
              );
            })}
          </div>
        </>
      )}
      <div className="opsis-overview-groups">
        {toolGroups(capabilities).map((group) => (
          <section
            key={group.id}
            className="opsis-overview-group"
            aria-labelledby={`guide-${group.id}`}
          >
            <p className="opsis-kicker">{c(...group.name)}</p>
            <h2 id={`guide-${group.id}`}>{c(...group.heading)}</h2>
            <ul>
              {group.tools.map((tool) => (
                <li key={tool.path}>
                  <Link to={tool.path}>
                    {c(...tool.name)} <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            {!group.tools.length && (
              <p className="opsis-small">
                {c("No tools enabled on this deployment", "此部署未启用工具")}
              </p>
            )}
            <GroupPicture group={group.id} />
            <p className="sr-only">
              {c(
                group.id === "lookup"
                  ? "Illustration: holder distribution bars. No observed values shown."
                  : group.id === "trade"
                    ? "Illustration: input size to estimated output. No quote shown."
                    : group.id === "watch"
                      ? "Illustration: a sequence of checks saved on this device."
                      : "Illustration: a dot cloud representing data exploration. No dataset shown.",
                group.id === "lookup"
                  ? "示意图：持仓分布条形。不显示观察数值。"
                  : group.id === "trade"
                    ? "示意图：输入数量到预估输出。不显示报价。"
                    : group.id === "watch"
                      ? "示意图：保存在此设备上的连续核查。"
                      : "示意图：点云代表数据探索。不显示数据集。",
              )}
            </p>
          </section>
        ))}
      </div>
      <details className="opsis-task-chooser">
        <summary>
          {c("Pick what describes you", "选择符合您情况的描述")}
        </summary>
        <div
          className="opsis-audience-options"
          role="group"
          aria-label={c("Choose your task", "选择任务")}
        >
          {audiences.map((a) => (
            <button
              key={a.id}
              aria-pressed={selected === a.id}
              aria-controls="opsis-recommended-tools"
              onClick={() => setSelected(a.id)}
            >
              {c(...a.name)}
            </button>
          ))}
        </div>
        <section
          id="opsis-recommended-tools"
          className="opsis-recommended-tools"
          aria-label={c("Suggested starting points", "建议起点")}
        >
          <p className="opsis-route-goal" aria-live="polite">
            {c(...audience.task)}
          </p>
          {audience.id === "perp" ? (
            <div className="opsis-panel">
              <h2>
                {c("Opsis has no perp trading.", "Opsis 不提供永续合约交易。")}
              </h2>
              <p>
                {c(
                  "The Perp cost scenario models holding cost, funding and an estimated liquidation price from your own numbers. Where the directory is switched on, it lists venues by the region you state; Opsis does not verify eligibility or rank venues. The venue's own figure governs. If you have funding records, Quant Lab can total realized payments locally.",
                  "永续成本情景使用您自己的数字建立持仓成本、资金费及清算价格估算。目录开启时，按您声明的地区列出场所；Opsis 不验证资格，也不对场所排名。以场所自身的数值为准。如果您有资金费记录，量化实验室可以在本地汇总已实现收付。",
                )}
              </p>
              <Link className="opsis-action" to="/check/perp-scenario">
                {c("Open Perp cost scenario →", "打开 永续成本情景 →")}
              </Link>
              <Link className="opsis-action" to="/lab">
                {c(
                  "Open Quant Lab for funding records →",
                  "打开量化实验室分析资金费记录 →",
                )}
              </Link>
            </div>
          ) : (
            <div className="opsis-guide-grid">
              {audience.paths.every(
                (path) =>
                  !toolGuides
                    .find((tool) => tool.path === path)
                    ?.enabled(capabilities),
              ) && (
                <p>{c("No tools enabled for this task", "此任务未启用工具")}</p>
              )}
              {audience.paths.map((path, i) =>
                card(
                  toolGuides.find((t) => t.path === path)!,
                  i,
                ),
              )}
            </div>
          )}
        </section>
      </details>
      <details className="opsis-all-tools">
        <summary>
          {c("Browse all tools and who they're for", "浏览全部工具及适用人群")}
        </summary>
        <div className="opsis-guide-grid">
          {toolGuides
            .filter((tool) => tool.enabled(capabilities))
            .map((tool) => card(tool))}
        </div>
      </details>
      <p className="opsis-receipt">
        {c(
          "Your choice only changes this guide; it isn't saved or sent to a provider. Research uses public data. Private records stay encrypted on this device. Current tools do not execute trades.",
          "您的选择仅改变此指南，不会保存或发送给提供商。研究使用公开数据，私人记录保留在此设备的加密存储中。当前工具不执行交易。",
        )}
      </p>
    </>
  );
}
