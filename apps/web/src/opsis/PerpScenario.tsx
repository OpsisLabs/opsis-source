import { useState } from "react";
import { useCopy } from "./copy";
import { perpCollateralBuffer, perpCustomShockScenario, perpScenario, perpShockScenarios } from "./perp-scenario";
export default function PerpScenario() {
  const c = useCopy();
  const [side, setSide] = useState<"long" | "short">("long");
  const [selectedShock, setSelectedShock] = useState(2);
  const [customShock, setCustomShock] = useState("");
  const [collateral, setCollateral] = useState("");
  const [maintenanceBps, setMaintenanceBps] = useState("");
  const [values, setValues] = useState({
    quantity: "",
    entry: "",
    exit: "",
    entryFeeBps: "",
    exitFeeBps: "",
    funding: "",
    otherCosts: "",
  });
  const labels = {
    quantity: c("Base-asset quantity", "基础资产数量"),
    entry: c("Entry price", "入场价格"),
    exit: c("Scenario closing price", "情景平仓价格"),
    entryFeeBps: c("Entry fee (basis points)", "入场费用（基点）"),
    exitFeeBps: c("Exit fee (basis points)", "退出费用（基点）"),
    funding: c(
      "Total funding: positive paid, negative received",
      "资金费总额：支付为正，收取为负",
    ),
    otherCosts: c("Other costs in quote currency", "报价货币计价的其他成本"),
  };
  let result: ReturnType<typeof perpScenario> | null = null;
  let comparison: Exclude<ReturnType<typeof perpShockScenarios>, null> | null = null;
  let comparisonUnavailable = false;
  let customResult: ReturnType<typeof perpCustomShockScenario> = null;
  let customError = false;
  let collateralResult: ReturnType<typeof perpCollateralBuffer> | null = null;
  let collateralInvalid = false;
  try {
    result = perpScenario({ side, ...values });
    comparison = perpShockScenarios({ side, ...values });
    comparisonUnavailable = comparison === null;
  } catch {
    /* Input state explicitly shown, never synthesize defaults. */
  }
  if (customShock.trim() && result) {
    try {
      customResult = perpCustomShockScenario({ side, ...values }, customShock.trim());
    } catch {
      customError = true;
    }
  }
  if (customResult) {
    comparison = perpShockScenarios({ side, ...values }, customResult.netRaw);
    comparisonUnavailable = comparison === null;
  }
  if (result && collateral.trim() && maintenanceBps.trim()) {
    try {
      collateralResult = perpCollateralBuffer({ side, ...values }, collateral.trim(), maintenanceBps.trim(), customError ? undefined : customShock.trim() || undefined);
    } catch {
      /* Blank and invalid user assumptions stay unavailable. */
      collateralInvalid = true;
    }
  }
  return (
    <section className="opsis-panel">
      <p className="opsis-kicker">
        {c("PERP TOOLS / LOCAL SCENARIO", "永续工具／本地情景")}
      </p>
      <h1>{c("What remains after closing costs?", "平仓成本后还剩多少？")}</h1>
      <p>
        {c(
          "A manual linear-contract calculation in one quote currency. Supply every fee and the total funding paid or received over your chosen period. No live venue data, wallet connection or order submission.",
          "以一种报价货币手动计算线性合约。请提供所选期间的每项费用及资金费收付总额。没有实时场所数据、钱包连接或订单提交。",
        )}
      </p>
      <aside
        className="opsis-small"
        aria-label={c("Scenario disclosure", "情景披露")}
      >
        {c(
          "Informational hypothetical tool only; this is not personalized investment advice. Fees, funding and other costs are user-entered estimates, and losses can exceed the amount modeled. Trading availability depends on your jurisdiction, venue rules and eligibility. This calculator does not verify eligibility, connect a wallet or submit orders.",
          "仅供信息参考的假设工具，不构成个性化投资建议。费用、资金费及其他成本是用户输入的估算；损失可能超过模型金额。交易可用性取决于您的司法管辖区、场所规则和资格。本计算器不会验证资格、连接钱包或提交订单。",
        )}
      </aside>
      <label>
        {c("Position direction", "仓位方向")}
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as typeof side)}
        >
          <option value="long">{c("Long", "多头")}</option>
          <option value="short">{c("Short", "空头")}</option>
        </select>
      </label>
      <div className="opsis-two-column">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
          <label key={key}>
            {labels[key]}
            <input
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
      <p className="opsis-small">
        {c(
          "All amounts use the same quote currency. Enter 0 only when that cost is explicitly assumed zero; blank means unknown. 1 basis point = 0.01%.",
          "所有金额使用相同报价货币。仅在明确假设该费用为零时输入 0；空白表示未知。1 基点 = 0.01%。",
        )}
      </p>
      <label>
        {c("Custom closing-price shock (%)", "自定义平仓价格冲击（%）")}
        <input
          aria-describedby={`perp-custom-shock-help${customError ? " perp-custom-shock-error" : ""}`}
          aria-invalid={customError || undefined}
          data-testid="opsis-perp-custom-shock-input"
          inputMode="decimal"
          autoComplete="off"
          value={customShock}
          onChange={(e) => setCustomShock(e.target.value)}
        />
      </label>
      <p id="perp-custom-shock-help" className="opsis-small">
        {c(
          "Optional local scenario from -95% to +500%, in 0.01 percentage-point steps. Leave blank to omit.",
          "可选本地情景：-95% 至 +500%，步长为 0.01 个百分点。留空则不添加。",
        )}
      </p>
      <section aria-live="polite" data-testid="opsis-perp-result">
        <h2>
          {result
            ? `${result.net} ${c("quote units net", "报价单位净额")}`
            : c("Complete the assumptions to calculate", "补全假设以计算")}
        </h2>
        {result && (
          <dl className="opsis-status">
            {[
              [c("Entry notional", "入场名义价值"), result.entryNotional],
              [c("Exit notional", "退出名义价值"), result.exitNotional],
              [c("Gross price P&L", "价格变动毛损益"), result.gross],
              [c("Entry fee", "入场费用"), result.entryFee],
              [c("Exit fee", "退出费用"), result.exitFee],
              [
                c(
                  "Funding paid (+) / received (−)",
                  "资金费支付（+）／收取（−）",
                ),
                result.funding,
              ],
              [c("Other costs", "其他成本"), result.otherCosts],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section aria-labelledby="perp-collateral-title" data-testid="opsis-perp-collateral">
        <h2 id="perp-collateral-title">{c("Isolated-collateral hypothetical buffer", "孤立抵押品假设缓冲")}</h2>
        <p className="opsis-small">{c("Optional local scenario using only your supplied collateral and maintenance requirement. Both use the same quote currency as the position. This is not a venue risk decision.", "可选本地情景，仅使用您输入的抵押品和维持保证金要求。两者与仓位使用相同报价货币。这不是场所风险判断。")}</p>
        <div className="opsis-two-column">
          <label>{c("User-entered collateral (quote units)", "用户输入的抵押品（报价单位）")}
            <input inputMode="decimal" autoComplete="off" value={collateral} onChange={(e) => setCollateral(e.target.value)} aria-describedby="perp-collateral-help" />
          </label>
          <label>{c("User-entered maintenance requirement (bps)", "用户输入的维持保证金要求（基点）")}
            <input inputMode="numeric" autoComplete="off" value={maintenanceBps} onChange={(e) => setMaintenanceBps(e.target.value)} aria-describedby="perp-collateral-help" />
          </label>
        </div>
        <p id="perp-collateral-help" className="opsis-small">{c("Enter both values to calculate. Blank means unknown; collateral must be positive and maintenance must be 0–10000 whole bps. 1 bp = 0.01% of scenario exit notional.", "请输入两项数值后计算。空白表示未知；抵押品必须为正数，维持保证金须为 0–10000 整数基点。1 基点 = 情景退出名义价值的 0.01%。")}</p>
        {collateralInvalid && <p role="alert" data-testid="opsis-perp-collateral-error">{c("Check the collateral amount and whole-bps maintenance input. Collateral must be positive; maintenance must be 0–10000 bps.", "请检查抵押品金额和整数基点维持保证金输入。抵押品必须为正数；维持保证金须为 0–10000 基点。")}</p>}
        {collateralResult && <>
          <p role="status" data-testid="opsis-perp-collateral-leverage">{c("Entry notional / collateral ratio", "入场名义价值／抵押品比率")}: {collateralResult.entryLeverage}×</p>
          <div className="opsis-table-scroll opsis-perp-collateral-table">
            <table>
              <caption>{c("User-supplied hypothetical buffer; all inputs and results use the same quote currency. Equity equals collateral plus existing scenario net P&L, including fees, funding and other costs.", "用户提供的假设缓冲；所有输入和结果均使用相同报价货币。权益等于抵押品加上现有情景净损益（含费用、资金费和其他成本）。")}</caption>
              <thead><tr><th scope="col">{c("Case", "情景")}</th><th scope="col">{c("Scenario exit notional", "情景退出名义价值")}</th><th scope="col">{c("Assumed scenario equity after net costs", "假设的情景净成本后权益")}</th><th scope="col">{c("Assumed user-entered maintenance amount", "假设的用户输入维持保证金额")}</th><th scope="col">{c("Hypothetical buffer", "假设缓冲")}</th></tr></thead>
              <tbody>
                <tr><th scope="row">{c("Entered close", "输入的平仓情景")}</th><td>{collateralResult.entered.exitNotional}</td><td>{collateralResult.entered.equity}</td><td>{collateralResult.entered.maintenanceRequirement}</td><td>{collateralResult.entered.buffer}</td></tr>
                {comparison?.shocks.map((shock, index) => {
                  const row = collateralResult?.shocks?.[index];
                  return row ? <tr key={shock.percent}><th scope="row">{shock.percent > 0 ? "+" : ""}{shock.percent}%</th><td>{row.exitNotional}</td><td>{row.equity}</td><td>{row.maintenanceRequirement}</td><td>{row.buffer}</td></tr> : null;
                })}
                {customResult && collateralResult.custom && <tr><th scope="row">{c("Custom", "自定义")} {customResult.percent}</th><td>{collateralResult.custom.exitNotional}</td><td>{collateralResult.custom.equity}</td><td>{collateralResult.custom.maintenanceRequirement}</td><td>{collateralResult.custom.buffer}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="opsis-small">{c("This is only a user-supplied hypothetical buffer. Actual venue equity, variation settlement and funding cycles can differ. It does not calculate liquidation price, margin calls, venue tiers or tradable leverage. Collateral is capital at risk, not a fee; losses may exceed collateral.", "这只是用户提供的假设缓冲。实际场所权益、变动结算和资金费周期可能不同。本工具不计算清算价格、保证金通知、场所等级或可交易杠杆。抵押品是有风险的资本，不是费用；损失可能超过抵押品。")}</p>
        </>}
      </section>
      {comparison && (
        <section aria-labelledby="perp-shock-title" data-testid="opsis-perp-shocks">
          <h2 id="perp-shock-title">{c("Price-shock comparison", "价格冲击比较")}</h2>
          <p className="opsis-small">
            {c(
              "Moves are relative to your entry price. Select a fixed move to inspect its net result. Every point uses the same entered quantity, fees, funding and other costs; these are hypothetical scenarios, not executable quotes.",
              "固定变动以您的入场价格为基准。选择一种变动查看净结果。每个点均使用相同的数量、费用、资金费及其他成本；这些是假设情景，并非可执行报价。",
            )}
          </p>
          <p className="opsis-small">
            {c(
              "Closing prices are truncated to eight decimals; displayed moves are approximate.",
              "平仓价格截断至小数点后八位；显示的变动为近似值。",
            )}
          </p>
          <div role="group" aria-label={c("Fixed price shocks", "固定价格冲击")}>
            {comparison.shocks.map((shock, index) => (
              <button
                key={shock.percent}
                type="button"
                aria-pressed={selectedShock === index}
                onClick={() => setSelectedShock(index)}
                style={{ margin: "0.2rem", borderColor: selectedShock === index ? "#1769ff" : undefined }}
              >
                {shock.percent > 0 ? "+" : ""}{shock.percent}%
              </button>
            ))}
          </div>
          <p aria-live="polite">
            {c("Selected hypothetical close", "所选假设平仓")} {comparison.shocks[selectedShock].exit} · {comparison.shocks[selectedShock].net} {c("quote units net", "报价单位净额")}
          </p>
          <div aria-hidden="true" data-testid="opsis-perp-shock-plot" style={{ display: "grid", gap: "0.35rem", margin: "0.6rem 0" }}>
            {comparison.shocks.map((shock) => (
              <div key={shock.percent} style={{ display: "grid", gridTemplateColumns: "3.5rem 1fr", gap: "0.5rem", alignItems: "center" }}>
                <span>{shock.percent > 0 ? "+" : ""}{shock.percent}%</span>
                <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "0.65rem", position: "relative" }}>
                  <span style={{ display: "flex", justifyContent: "flex-end", borderRight: "1px solid #526173" }}>
                    {shock.negative && <span style={{ display: "block", height: "0.55rem", width: `${shock.barWidth}%`, minWidth: "2px", background: "#b42318" }} />}
                  </span>
                  <span>
                    {!shock.negative && shock.barWidth > 0 && <span style={{ display: "block", height: "0.55rem", width: `${shock.barWidth}%`, minWidth: "2px", background: "#1769ff" }} />}
                  </span>
                </span>
              </div>
            ))}
            {customResult && comparison.customBar && (
              <div data-testid="opsis-perp-custom-shock-plot-row" style={{ display: "grid", gridTemplateColumns: "3.5rem 1fr", gap: "0.5rem", alignItems: "center" }}>
                <span>{c("Custom", "自定义")} {customResult.percent}</span>
                <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "0.65rem", position: "relative" }}>
                  <span style={{ display: "flex", justifyContent: "flex-end", borderRight: "1px solid #526173" }}>
                    {comparison.customBar.negative && <span style={{ display: "block", height: "0.55rem", width: `${comparison.customBar.barWidth}%`, minWidth: "2px", background: "#b42318" }} />}
                  </span>
                  <span>
                    {!comparison.customBar.negative && comparison.customBar.barWidth > 0 && <span style={{ display: "block", height: "0.55rem", width: `${comparison.customBar.barWidth}%`, minWidth: "2px", background: "#1769ff" }} />}
                  </span>
                </span>
              </div>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <caption>{c("Exact price and net result for each hypothetical move and your entered exit", "每个假设变动及您输入的平仓价格与净结果")}</caption>
              <thead><tr><th scope="col">{c("Case", "情景")}</th><th scope="col">{c("Closing price", "平仓价格")}</th><th scope="col">{c("Net result", "净结果")}</th></tr></thead>
              <tbody>
                {comparison.shocks.map((shock) => (
                  <tr key={shock.percent}><th scope="row">{shock.percent > 0 ? "+" : ""}{shock.percent}%</th><td>{shock.exit}</td><td>{shock.net}</td></tr>
                ))}
                <tr><th scope="row">{c("Your entered exit", "您输入的平仓价格")}</th><td>{comparison.entered.exit}</td><td>{comparison.entered.net}</td></tr>
                {customResult && <tr data-testid="opsis-perp-custom-shock-result"><th scope="row">{c("Custom", "自定义")} {customResult.percent}</th><td>{customResult.exit}</td><td>{customResult.net}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {customError && (
        <p id="perp-custom-shock-error" role="alert" data-testid="opsis-perp-custom-shock-error">
          {c(
            "Enter a shock from -95% to +500% with at most two decimal places.",
            "请输入 -95% 至 +500% 的冲击值，小数最多两位。",
          )}
        </p>
      )}
      {customShock.trim() && !customError && result && !customResult && (
        <p role="status" data-testid="opsis-perp-custom-shock-unavailable">
          {c(
            "Custom shock unavailable at eight-decimal price precision.",
            "价格精度为八位小数时，自定义冲击不可用。",
          )}
        </p>
      )}
      {comparison === null && customResult && (
        <p role="status" data-testid="opsis-perp-custom-shock-result">
          {c("Custom hypothetical close", "自定义假设平仓")} {customResult.percent}: {customResult.exit} · {customResult.net} {c("quote units net", "报价单位净额")}
        </p>
      )}
      {result && comparisonUnavailable && (
        <p role="status" data-testid="opsis-perp-shocks-unavailable">
          {c(
            "Shock comparison unavailable at eight-decimal price precision.",
            "价格精度为八位小数时，冲击比较不可用。",
          )}
        </p>
      )}
      <p className="opsis-receipt">
        {c(
          "Calculated locally in memory, truncated to eight decimals per term. No assumed funding frequency or annualization. Collateral is not a fee. Margin tiers, liquidation, inverse/quanto contracts, collateral FX, partial fills and venue rounding are outside this model. A scenario is not a close quote or a guarantee. Opening and closing remain unavailable pending an admitted venue for Canada/US.",
          "仅在本地内存计算，每项截断至八位小数。不假设资金费频率或年化。抵押品不是费用。保证金等级、清算、反向／Quanto 合约、抵押品汇率、部分成交及场所取整规则均在模型外。情景并非平仓报价或保证。加拿大／美国场所准入前，开仓和平仓仍不可用。",
        )}
      </p>
    </section>
  );
}
