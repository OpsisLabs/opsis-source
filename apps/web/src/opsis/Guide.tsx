import { useState } from "react";
import { Link } from "react-router";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import { audiences, toolGuides, type ToolGuide } from "./tool-guide";
export default function Guide({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState("new");
  const audience = audiences.find((a) => a.id === selected)!;
  function card(tool: ToolGuide, index?: number) {
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
            <dt>{c("You'll get", "您将得到")}</dt>
            <dd>{c(...tool.outcome)}</dd>
          </div>
        </dl>
        {tool.enabled(capabilities) ? (
          <Link className="opsis-action" to={tool.path}>
            {c("Open", "打开")} {c(...tool.name)} ↗
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
      <header className="opsis-heading">
        <p className="opsis-kicker">
          {c("FIND YOUR TOOL / OPSIS", "选择工具 / OPSIS")}
        </p>
        <h1>{c("What brings you here?", "您想做什么？")}</h1>
        <p>
          {c(
            "Choose your task. We'll show you where to start, what to enter and what you'll get back.",
            "选择任务，了解从哪里开始、输入什么以及会得到什么。",
          )}
        </p>
      </header>
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
            <span aria-hidden="true">↗</span>
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
              {c(
                "Perpetual trading is not available yet.",
                "永续合约交易尚未开放。",
              )}
            </h2>
            <p>
              {c(
                "Opening/closing, live funding and venue-specific liquidation remain unavailable. Enter your own prices, fees, funding and optional collateral for a local scenario. If you have funding records, Quant Lab can total realized payments locally.",
                "开平仓、实时资金费及特定场所清算仍不可用。您可以输入价格、费用、资金费及可选抵押品进行本地情景计算。如果您有资金费记录，量化实验室可以在本地汇总已实现收付。",
              )}
            </p>
            <Link className="opsis-action" to="/check/perp-scenario">
              {c("Open Perp cost scenario ↗", "打开 永续成本情景 ↗")}
            </Link>
            <Link className="opsis-action" to="/lab">
              {c("Open Quant Lab for funding records ↗", "打开量化实验室分析资金费记录 ↗")}
            </Link>
          </div>
        ) : (
          <div className="opsis-guide-grid">
            {audience.paths.map((path, i) =>
              card(
                toolGuides.find((t) => t.path === path)!,
                i,
              ),
            )}
          </div>
        )}
      </section>
      <details className="opsis-all-tools">
        <summary>
          {c("Browse all tools and who they're for", "浏览全部工具及适用人群")}
        </summary>
        <div className="opsis-guide-grid">
          {toolGuides.map((tool) => card(tool))}
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
