import { useId, useState, type InputHTMLAttributes } from "react";
import { useCopy } from "./copy";
import {
  perpCollateralBuffer,
  perpInputError,
  type PerpNumericField,
  perpCostComparison,
  perpCustomShockScenario,
  perpFundingOverHold,
  perpLiquidationEstimate,
  perpScenario,
  perpScenarioSummary,
  perpShockScenarios,
} from "./perp-scenario";
import type { Capabilities } from "./model";
import PerpHandoff from "./PerpHandoff";
import { decimalBars } from "./visual-model";
import "./check.css";
export default function PerpScenario({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const [side, setSide] = useState<"long" | "short">("long");
  const [selectedShock, setSelectedShock] = useState(2);
  const [customShock, setCustomShock] = useState("");
  const [collateral, setCollateral] = useState("");
  const [maintenanceBps, setMaintenanceBps] = useState("");
  const [fundingInputs, setFundingInputs] = useState({
    rateBps: "",
    intervalHours: "",
    holdingHours: "",
  });
  const [assumptionSets, setAssumptionSets] = useState<
    {
      label: string;
      entryFeeBps: string;
      exitFeeBps: string;
      funding: string;
    }[]
  >([]);
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
  let comparison: Exclude<ReturnType<typeof perpShockScenarios>, null> | null =
    null;
  let comparisonUnavailable = false;
  let customResult: ReturnType<typeof perpCustomShockScenario> = null;
  let customError = !!perpInputError("customShock", customShock);
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
      customResult = perpCustomShockScenario(
        { side, ...values },
        customShock.trim(),
      );
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
      collateralResult = perpCollateralBuffer(
        { side, ...values },
        collateral.trim(),
        maintenanceBps.trim(),
        customError ? undefined : customShock.trim() || undefined,
      );
    } catch {
      /* Blank and invalid user assumptions stay unavailable. */
      collateralInvalid = true;
    }
  }
  let fundingEstimate: ReturnType<typeof perpFundingOverHold> | null = null;
  let fundingInvalid = false;
  if (
    values.quantity &&
    values.entry &&
    Object.values(fundingInputs).every((v) => v.trim())
  ) {
    try {
      fundingEstimate = perpFundingOverHold({
        side,
        quantity: values.quantity,
        entry: values.entry,
        ...fundingInputs,
      });
    } catch {
      fundingInvalid = true;
    }
  }
  let liquidation: ReturnType<typeof perpLiquidationEstimate> | null = null;
  let liquidationInvalid = false;
  if (
    values.quantity &&
    values.entry &&
    collateral.trim() &&
    maintenanceBps.trim()
  ) {
    try {
      liquidation = perpLiquidationEstimate({
        side,
        quantity: values.quantity,
        entry: values.entry,
        collateral: collateral.trim(),
        maintenanceBps: maintenanceBps.trim(),
      });
    } catch {
      liquidationInvalid = true;
    }
  }
  const costRows = result
    ? [
        {
          label: c("Current inputs (A)", "当前输入（A）"),
          entryFeeBps: values.entryFeeBps,
          exitFeeBps: values.exitFeeBps,
          funding: values.funding,
        },
        ...assumptionSets,
      ].map((set) => {
        try {
          return {
            set,
            result: perpCostComparison({ side, ...values }, [set])[0],
          };
        } catch {
          return { set, result: null };
        }
      })
    : null;
  const summary: string[] | null = result
    ? perpScenarioSummary(
        { side, ...values },
        {
          heading: c(
            "Opsis perp scenario: hypothetical, not an order",
            "Opsis 永续情景：假设，并非订单",
          ),
          side: c("Side", "方向"),
          long: c("Long", "多头"),
          short: c("Short", "空头"),
          quantity: labels.quantity,
          entry: labels.entry,
          exit: labels.exit,
          entryFee: c("Entry fee (quote units)", "入场费用（报价单位）"),
          exitFee: c("Exit fee (quote units)", "退出费用（报价单位）"),
          funding: labels.funding,
          otherCosts: labels.otherCosts,
          net: c("Net result (quote units)", "净结果（报价单位）"),
          collateral: c("Collateral (quote units)", "抵押品（报价单位）"),
          maintenance: c(
            "Maintenance requirement (bps)",
            "维持保证金要求（基点）",
          ),
          liquidation: c("Estimated liquidation price", "估算清算价格"),
          footer: c(
            "All figures are your own assumptions. Check the venue's own numbers.",
            "所有数值均为您自己的假设。请核查场所自身的数字。",
          ),
        },
        liquidation
          ? {
              collateral: collateral.trim(),
              maintenanceBps: maintenanceBps.trim(),
            }
          : undefined,
      )
    : null;
  const breakdownWidths = result
    ? decimalBars(
        [
          result.gross,
          result.entryFee,
          result.exitFee,
          result.funding,
          result.otherCosts,
        ].map((value) => value.replace(/^-/, "")),
      )
    : null;
  return (
    <section className="opsis-perp-scenario opsis-check-page">
      <header className="opsis-heading opsis-check-heading">
        <h1>
          {c("What remains after closing costs?", "平仓成本后还剩多少？")}
        </h1>
        <p>
          {c(
            "Set a position. Compare the cost of closing.",
            "设置仓位，比较平仓成本。",
          )}
        </p>
      </header>
      <div className="opsis-perp-workspace">
        <div className="opsis-perp-inputs">
          <section
            className="opsis-panel opsis-check-step"
            aria-labelledby="perp-position-title"
          >
            <h2 id="perp-position-title">
              <span>01</span>
              {c("Position", "仓位")}
            </h2>
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
            <div className="opsis-check-fields">
              {(["quantity", "entry"] as const).map((key) => (
                <label key={key}>
                  {labels[key]}
                  <PerpNumberInput
                    field={key}
                    aria-label={labels[key]}
                    inputMode="decimal"
                    value={values[key]}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
            <div className="opsis-two-column">
              <label>
                {c(
                  "User-entered collateral (quote units)",
                  "用户输入的抵押品（报价单位）",
                )}
                <PerpNumberInput
                  field="collateral"
                  aria-label={c(
                    "User-entered collateral (quote units)",
                    "用户输入的抵押品（报价单位）",
                  )}
                  inputMode="decimal"
                  autoComplete="off"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                  aria-describedby="perp-collateral-help"
                />
              </label>
              <label>
                {c(
                  "User-entered maintenance requirement (bps)",
                  "用户输入的维持保证金要求（基点）",
                )}
                <PerpNumberInput
                  field="maintenanceBps"
                  aria-label={c(
                    "User-entered maintenance requirement (bps)",
                    "用户输入的维持保证金要求（基点）",
                  )}
                  inputMode="numeric"
                  autoComplete="off"
                  value={maintenanceBps}
                  onChange={(e) => setMaintenanceBps(e.target.value)}
                  aria-describedby="perp-collateral-help"
                />
              </label>
            </div>
            <a className="opsis-check-result-link" href="#perp-result-title">
              {c("View scenario estimate ↓", "查看情景估算 ↓")}
            </a>
          </section>
          <section
            className="opsis-panel opsis-check-step"
            aria-labelledby="perp-costs-title"
          >
            <h2 id="perp-costs-title">
              <span>02</span>
              {c("Costs", "成本")}
            </h2>
            <div className="opsis-check-fields">
              {(
                ["entryFeeBps", "exitFeeBps", "funding", "otherCosts"] as const
              ).map((key) => (
                <label key={key}>
                  {labels[key]}
                  <PerpNumberInput
                    field={key}
                    aria-label={labels[key]}
                    inputMode="decimal"
                    value={values[key]}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
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
            <section
              aria-labelledby="perp-funding-title"
              data-testid="opsis-perp-funding"
            >
              <h2 id="perp-funding-title">
                {c("Estimate funding from a rate", "根据费率估算资金费")}
              </h2>
              <p className="opsis-small" id="perp-funding-help">
                {c(
                  "Optional: signed rate up to four decimals, from -1000 to 1000 bps. Positive rates mean longs pay shorts. Interval: 1–24 whole hours. Holding period: 0–87600 whole hours. Partial intervals are not counted; blank means unknown.",
                  "可选：带符号费率最多四位小数，范围为 -1000 至 1000 基点。正费率表示多头向空头支付。间隔：1–24 整数小时。持有期：0–87600 整数小时。不计未完整的间隔；空白表示未知。",
                )}
              </p>
              <div className="opsis-two-column">
                {(["rateBps", "intervalHours", "holdingHours"] as const).map(
                  (key) => (
                    <label key={key}>
                      {
                        {
                          rateBps: c(
                            "Funding rate per interval (bps)",
                            "每个间隔的资金费率（基点）",
                          ),
                          intervalHours: c(
                            "Funding interval (hours)",
                            "资金费间隔（小时）",
                          ),
                          holdingHours: c(
                            "Holding period (hours)",
                            "持有期（小时）",
                          ),
                        }[key]
                      }
                      <PerpNumberInput
                        field={key}
                        aria-label={
                          {
                            rateBps: c(
                              "Funding rate per interval (bps)",
                              "每个间隔的资金费率（基点）",
                            ),
                            intervalHours: c(
                              "Funding interval (hours)",
                              "资金费间隔（小时）",
                            ),
                            holdingHours: c(
                              "Holding period (hours)",
                              "持有期（小时）",
                            ),
                          }[key]
                        }
                        inputMode={key === "rateBps" ? "decimal" : "numeric"}
                        autoComplete="off"
                        value={fundingInputs[key]}
                        aria-describedby="perp-funding-help"
                        onChange={(e) =>
                          setFundingInputs({
                            ...fundingInputs,
                            [key]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              {fundingInvalid && (
                <p role="alert">
                  {c(
                    "Check quantity, entry, rate and whole-hour inputs against the stated ranges. No funding estimate is shown.",
                    "请按所述范围检查数量、入场价、费率和整数小时输入。不显示资金费估算。",
                  )}
                </p>
              )}
              {fundingEstimate && (
                <div
                  data-testid="opsis-perp-funding-estimate"
                  aria-live="polite"
                >
                  <p>
                    {c("Completed intervals", "完整间隔数")}:{" "}
                    {fundingEstimate.intervals}
                  </p>
                  <p>
                    {c(
                      "Estimated funding per interval: positive paid, negative received",
                      "每个间隔的资金费估算：支付为正，收取为负",
                    )}
                    : {fundingEstimate.perInterval}
                  </p>
                  <p>
                    {c("Estimated total funding", "估算资金费总额")}:{" "}
                    {fundingEstimate.total}
                  </p>
                  <p className="opsis-small">
                    {c(
                      "Uses your entry notional for every interval; venues use the mark price at each funding time, and rates change. The venue's own figure governs.",
                      "每个间隔均使用您的入场名义价值；场所在每次资金费结算时使用标记价格，费率也会变化。以场所自身的数值为准。",
                    )}
                  </p>
                  <button
                    className="opsis-perp-secondary"
                    type="button"
                    onClick={() =>
                      setValues({ ...values, funding: fundingEstimate.total })
                    }
                  >
                    {c("Use as total funding", "用作资金费总额")}
                  </button>
                </div>
              )}
            </section>
          </section>
          <section
            className="opsis-panel opsis-check-step"
            aria-labelledby="perp-exit-title"
          >
            <h2 id="perp-exit-title">
              <span>03</span>
              {c("Exit", "平仓")}
            </h2>
            <div className="opsis-check-fields">
              {(["exit"] as const).map((key) => (
                <label key={key}>
                  {labels[key]}
                  <PerpNumberInput
                    field={key}
                    aria-label={labels[key]}
                    inputMode="decimal"
                    value={values[key]}
                    onChange={(e) =>
                      setValues({ ...values, [key]: e.target.value })
                    }
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
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
            {customError && (
              <p
                className="opsis-field-error"
                id="perp-custom-shock-error"
                role="alert"
                data-testid="opsis-perp-custom-shock-error"
              >
                {c(
                  "Enter a shock from -95% to +500% with at most two decimal places.",
                  "请输入 -95% 至 +500% 的冲击值，小数最多两位。",
                )}
              </p>
            )}
            <p id="perp-custom-shock-help" className="opsis-small">
              {c(
                "Optional local scenario from -95% to +500%, in 0.01 percentage-point steps. Leave blank to omit.",
                "可选本地情景：-95% 至 +500%，步长为 0.01 个百分点。留空则不添加。",
              )}
            </p>
          </section>
        </div>
        <div className="opsis-panel opsis-perp-estimate">
          <section aria-live="polite" data-testid="opsis-perp-result">
            <p className="opsis-kicker">{c("SCENARIO ESTIMATE", "情景估算")}</p>
            <p>{c("Estimated result", "估算结果")}</p>
            <h2 id="perp-result-title" className="opsis-check-net">
              {result
                ? `${result.net} ${c("quote units net", "报价单位净额")}`
                : Object.entries(values).some(([key, value]) =>
                      perpInputError(key as PerpNumericField, value),
                    )
                  ? c(
                      "Correct the highlighted inputs to calculate",
                      "请更正标记的输入以计算",
                    )
                  : c(
                      "Complete the assumptions to calculate",
                      "补全假设以计算",
                    )}
            </h2>
            {result && (
              <dl className="opsis-check-rows opsis-perp-breakdown">
                {[
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
                ].map(([label, value], index) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value}
                      <span
                        className="opsis-check-bar-track"
                        aria-hidden="true"
                      >
                        <span
                          style={{ width: `${breakdownWidths?.[index] ?? 0}%` }}
                        />
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {result && (
              <p className="opsis-small">
                {c("Entry notional", "入场名义价值")}: {result.entryNotional} ·{" "}
                {c("Exit notional", "退出名义价值")}: {result.exitNotional}
              </p>
            )}
          </section>
          <section
            aria-labelledby="perp-collateral-title"
            data-testid="opsis-perp-collateral"
          >
            <h3 className="opsis-check-liquidation-title">
              {c("Estimated liquidation price", "估算清算价格")}
            </h3>
            <p className="opsis-small">
              {c(
                "Estimate for an isolated, linear position: the price at which your collateral plus price P&L equals the maintenance requirement you entered. It ignores fees, funding, mark-price rules and margin tiers. Your venue's own liquidation price governs.",
                "孤立线性仓位的估算：抵押品加上价格损益等于您输入的维持保证金要求时的价格。忽略费用、资金费、标记价格规则和保证金等级。以您场所自身的清算价格为准。",
              )}
            </p>
            {liquidationInvalid && (
              <p role="alert" data-testid="opsis-perp-liquidation-error">
                {c(
                  "No liquidation estimate: enter positive quantity, entry and collateral, and 0–9999 whole maintenance bps.",
                  "不显示清算估算：请输入正数数量、入场价和抵押品，以及 0–9999 整数维持保证金基点。",
                )}
              </p>
            )}
            {liquidation && (
              <p aria-live="polite" data-testid="opsis-perp-liquidation">
                {liquidation.state === "estimate" ? (
                  <>
                    {liquidation.price} · {liquidation.movePercent}%{" "}
                    {c("from entry", "相对入场价")}
                  </>
                ) : liquidation.reason === "no_positive_price" ? (
                  c(
                    "No positive liquidation price in this model: your collateral covers the entire price fall for this long position.",
                    "此模型没有正数清算价格：您的抵押品覆盖了该多头仓位价格的全部下跌。",
                  )
                ) : (
                  c(
                    "No estimate shown: your collateral is below the maintenance requirement at entry.",
                    "不显示估算：您的抵押品低于入场时的维持保证金要求。",
                  )
                )}
              </p>
            )}
            <h2 id="perp-collateral-title">
              {c(
                "Isolated-collateral hypothetical buffer",
                "孤立抵押品假设缓冲",
              )}
            </h2>
            <p className="opsis-small">
              {c(
                "Optional local scenario using only your supplied collateral and maintenance requirement. Both use the same quote currency as the position. This is not a venue risk decision.",
                "可选本地情景，仅使用您输入的抵押品和维持保证金要求。两者与仓位使用相同报价货币。这不是场所风险判断。",
              )}
            </p>
            <p id="perp-collateral-help" className="opsis-small">
              {c(
                "Enter both values to calculate. Blank means unknown; collateral must be positive and maintenance must be 0–10000 whole bps for the buffer, and 0–9999 for the liquidation estimate. 1 bp = 0.01% of scenario exit notional.",
                "请输入两项数值后计算。空白表示未知；抵押品必须为正数，缓冲的维持保证金须为 0–10000 整数基点，清算估算须为 0–9999。1 基点 = 情景退出名义价值的 0.01%。",
              )}
            </p>
            {collateralInvalid && (
              <p role="alert" data-testid="opsis-perp-collateral-error">
                {c(
                  "Check the collateral amount and whole-bps maintenance input. Collateral must be positive; maintenance must be 0–10000 bps.",
                  "请检查抵押品金额和整数基点维持保证金输入。抵押品必须为正数；维持保证金须为 0–10000 基点。",
                )}
              </p>
            )}
            {collateralResult && (
              <>
                <p role="status" data-testid="opsis-perp-collateral-leverage">
                  {c(
                    "Entry notional / collateral ratio",
                    "入场名义价值／抵押品比率",
                  )}
                  : {collateralResult.entryLeverage}×
                </p>
                <div
                  className="opsis-table-scroll opsis-perp-collateral-table"
                  tabIndex={0}
                  role="region"
                  aria-label={c(
                    "Hypothetical collateral buffer",
                    "假设抵押品缓冲",
                  )}
                >
                  <table>
                    <caption>
                      {c(
                        "User-supplied hypothetical buffer; all inputs and results use the same quote currency. Equity equals collateral plus existing scenario net P&L, including fees, funding and other costs.",
                        "用户提供的假设缓冲；所有输入和结果均使用相同报价货币。权益等于抵押品加上现有情景净损益（含费用、资金费和其他成本）。",
                      )}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{c("Case", "情景")}</th>
                        <th scope="col">
                          {c("Scenario exit notional", "情景退出名义价值")}
                        </th>
                        <th scope="col">
                          {c(
                            "Assumed scenario equity after net costs",
                            "假设的情景净成本后权益",
                          )}
                        </th>
                        <th scope="col">
                          {c(
                            "Assumed user-entered maintenance amount",
                            "假设的用户输入维持保证金额",
                          )}
                        </th>
                        <th scope="col">
                          {c("Hypothetical buffer", "假设缓冲")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">
                          {c("Entered close", "输入的平仓情景")}
                        </th>
                        <td>{collateralResult.entered.exitNotional}</td>
                        <td>{collateralResult.entered.equity}</td>
                        <td>
                          {collateralResult.entered.maintenanceRequirement}
                        </td>
                        <td>{collateralResult.entered.buffer}</td>
                      </tr>
                      {comparison?.shocks.map((shock, index) => {
                        const row = collateralResult?.shocks?.[index];
                        return row ? (
                          <tr key={shock.percent}>
                            <th scope="row">
                              {shock.percent > 0 ? "+" : ""}
                              {shock.percent}%
                            </th>
                            <td>{row.exitNotional}</td>
                            <td>{row.equity}</td>
                            <td>{row.maintenanceRequirement}</td>
                            <td>{row.buffer}</td>
                          </tr>
                        ) : null;
                      })}
                      {customResult && collateralResult.custom && (
                        <tr>
                          <th scope="row">
                            {c("Custom", "自定义")} {customResult.percent}
                          </th>
                          <td>{collateralResult.custom.exitNotional}</td>
                          <td>{collateralResult.custom.equity}</td>
                          <td>
                            {collateralResult.custom.maintenanceRequirement}
                          </td>
                          <td>{collateralResult.custom.buffer}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="opsis-small">
                  {c(
                    "This is only a user-supplied hypothetical buffer. Actual venue equity, variation settlement and funding cycles can differ. This buffer is not venue margin math and does not calculate margin calls, venue tiers or tradable leverage. Collateral is capital at risk, not a fee; losses may exceed collateral.",
                    "这只是用户提供的假设缓冲。实际场所权益、变动结算和资金费周期可能不同。此缓冲不是场所保证金计算，不计算保证金通知、场所等级或可交易杠杆。抵押品是有风险的资本，不是费用；损失可能超过抵押品。",
                  )}
                </p>
              </>
            )}
          </section>
        </div>
      </div>

      <section
        className="opsis-panel"
        aria-labelledby="perp-assumptions-title"
        data-testid="opsis-perp-assumptions"
      >
        <h2 id="perp-assumptions-title">
          {c("Compare assumptions", "比较假设")}
        </h2>
        <p className="opsis-small">
          {c(
            "Set A uses your current inputs. Add up to two sets of your own fee and total-funding assumptions. Labels are your text, limited to 24 characters and kept only on this page; Opsis chooses no venue. Total costs include the same other costs in every set. Blank or invalid inputs mean unknown.",
            "A 组使用您的当前输入。最多添加两组您自己的费用和资金费总额假设。标签是您的文本，最多 24 个字符，仅保留在本页面；Opsis 不选择任何场所。每组总成本均包含相同的其他成本。空白或无效输入表示未知。",
          )}
        </p>
        {assumptionSets.map((set, index) => (
          <fieldset
            key={index}
            data-testid={`opsis-perp-assumption-${index + 1}`}
          >
            <legend>
              {index === 0 ? c("Set B", "B 组") : c("Set C", "C 组")}
            </legend>
            <div className="opsis-two-column">
              {(["label", "entryFeeBps", "exitFeeBps", "funding"] as const).map(
                (key) => (
                  <label key={key}>
                    {
                      {
                        label: c("Your label", "您的标签"),
                        entryFeeBps: labels.entryFeeBps,
                        exitFeeBps: labels.exitFeeBps,
                        funding: labels.funding,
                      }[key]
                    }
                    <PerpNumberInput
                      field={key === "label" ? undefined : key}
                      aria-label={
                        key === "label"
                          ? c("Your label", "您的标签")
                          : labels[key]
                      }
                      value={set[key]}
                      maxLength={key === "label" ? 24 : undefined}
                      inputMode={key === "label" ? "text" : "decimal"}
                      autoComplete="off"
                      onChange={(e) =>
                        setAssumptionSets(
                          assumptionSets.map((row, i) =>
                            i === index
                              ? { ...row, [key]: e.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <button
              className="opsis-perp-secondary"
              type="button"
              onClick={() =>
                setAssumptionSets(assumptionSets.filter((_, i) => i !== index))
              }
            >
              {c("Remove set", "移除该组")}
            </button>
          </fieldset>
        ))}
        <button
          className="opsis-perp-secondary"
          type="button"
          disabled={assumptionSets.length >= 2}
          onClick={() =>
            setAssumptionSets([
              ...assumptionSets,
              { label: "", entryFeeBps: "", exitFeeBps: "", funding: "" },
            ])
          }
        >
          {c("Add assumption set", "添加假设组")}
        </button>
        {costRows && (
          <div
            className="opsis-table-scroll opsis-perp-cost-table"
            tabIndex={0}
            role="region"
            aria-label={c("Hypothetical cost comparison", "假设成本比较")}
          >
            <table>
              <caption>
                {c(
                  "Hypothetical cost comparison in the same quote currency; same side, quantity and entry/closing prices for every set",
                  "相同报价货币的假设成本比较；每组的方向、数量及开平价格相同",
                )}
              </caption>
              <thead>
                <tr>
                  {[
                    c("Your assumption set", "您的假设组"),
                    c("Entry fee", "入场费用"),
                    c("Exit fee", "退出费用"),
                    c("Total funding", "资金费总额"),
                    c("Total costs", "总成本"),
                    c("Net result", "净结果"),
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costRows.map((row, index) => (
                  <tr key={index}>
                    <th scope="row">
                      {row.set.label || c("Unlabeled set", "未命名组")}
                    </th>
                    {(
                      [
                        "entryFee",
                        "exitFee",
                        "funding",
                        "totalCosts",
                        "net",
                      ] as const
                    ).map((key) => (
                      <td key={key}>
                        {row.result ? row.result[key] : c("Unknown", "未知")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {comparison && (
        <section
          className="opsis-panel"
          aria-labelledby="perp-shock-title"
          data-testid="opsis-perp-shocks"
        >
          <h2 id="perp-shock-title">
            {c("Price-shock comparison", "价格冲击比较")}
          </h2>
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
          <div
            role="group"
            aria-label={c("Fixed price shocks", "固定价格冲击")}
          >
            {comparison.shocks.map((shock, index) => (
              <button
                key={shock.percent}
                type="button"
                aria-pressed={selectedShock === index}
                onClick={() => setSelectedShock(index)}
                className="opsis-perp-shock-choice"
              >
                {shock.percent > 0 ? "+" : ""}
                {shock.percent}%
              </button>
            ))}
          </div>
          <p aria-live="polite">
            {c("Selected hypothetical close", "所选假设平仓")}{" "}
            {comparison.shocks[selectedShock].exit} ·{" "}
            {comparison.shocks[selectedShock].net}{" "}
            {c("quote units net", "报价单位净额")}
          </p>
          <div
            aria-hidden="true"
            data-testid="opsis-perp-shock-plot"
            style={{ display: "grid", gap: "0.35rem", margin: "0.6rem 0" }}
          >
            {comparison.shocks.map((shock) => (
              <div
                key={shock.percent}
                style={{
                  display: "grid",
                  gridTemplateColumns: "3.5rem 1fr",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <span>
                  {shock.percent > 0 ? "+" : ""}
                  {shock.percent}%
                </span>
                <span
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    height: "0.65rem",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      borderRight: "1px solid var(--line)",
                    }}
                  >
                    {shock.negative && (
                      <span
                        style={{
                          display: "block",
                          height: "0.55rem",
                          width: `${shock.barWidth}%`,
                          minWidth: "2px",
                          background: "var(--soft)",
                        }}
                      />
                    )}
                  </span>
                  <span>
                    {!shock.negative && shock.barWidth > 0 && (
                      <span
                        style={{
                          display: "block",
                          height: "0.55rem",
                          width: `${shock.barWidth}%`,
                          minWidth: "2px",
                          background: "var(--accent)",
                        }}
                      />
                    )}
                  </span>
                </span>
              </div>
            ))}
            {customResult && comparison.customBar && (
              <div
                data-testid="opsis-perp-custom-shock-plot-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "3.5rem 1fr",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <span>
                  {c("Custom", "自定义")} {customResult.percent}
                </span>
                <span
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    height: "0.65rem",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      borderRight: "1px solid var(--line)",
                    }}
                  >
                    {comparison.customBar.negative && (
                      <span
                        style={{
                          display: "block",
                          height: "0.55rem",
                          width: `${comparison.customBar.barWidth}%`,
                          minWidth: "2px",
                          background: "var(--soft)",
                        }}
                      />
                    )}
                  </span>
                  <span>
                    {!comparison.customBar.negative &&
                      comparison.customBar.barWidth > 0 && (
                        <span
                          style={{
                            display: "block",
                            height: "0.55rem",
                            width: `${comparison.customBar.barWidth}%`,
                            minWidth: "2px",
                            background: "var(--accent)",
                          }}
                        />
                      )}
                  </span>
                </span>
              </div>
            )}
          </div>
          <div
            className="opsis-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={c("Exact price-shock results", "精确价格冲击结果")}
          >
            <table>
              <caption>
                {c(
                  "Exact price and net result for each hypothetical move and your entered exit",
                  "每个假设变动及您输入的平仓价格与净结果",
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{c("Case", "情景")}</th>
                  <th scope="col">{c("Closing price", "平仓价格")}</th>
                  <th scope="col">{c("Net result", "净结果")}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.shocks.map((shock) => (
                  <tr key={shock.percent}>
                    <th scope="row">
                      {shock.percent > 0 ? "+" : ""}
                      {shock.percent}%
                    </th>
                    <td>{shock.exit}</td>
                    <td>{shock.net}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">
                    {c("Your entered exit", "您输入的平仓价格")}
                  </th>
                  <td>{comparison.entered.exit}</td>
                  <td>{comparison.entered.net}</td>
                </tr>
                {customResult && (
                  <tr data-testid="opsis-perp-custom-shock-result">
                    <th scope="row">
                      {c("Custom", "自定义")} {customResult.percent}
                    </th>
                    <td>{customResult.exit}</td>
                    <td>{customResult.net}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
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
          {c("Custom hypothetical close", "自定义假设平仓")}{" "}
          {customResult.percent}: {customResult.exit} · {customResult.net}{" "}
          {c("quote units net", "报价单位净额")}
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
      <div className="opsis-panel opsis-perp-disclosures">
        <aside
          className="opsis-small"
          aria-label={c("Scenario disclosure", "情景披露")}
        >
          {c(
            "Informational hypothetical tool only; this is not personalized investment advice. Fees, funding and other costs are user-entered estimates, and losses can exceed the amount modeled. Trading availability depends on your jurisdiction, venue rules and eligibility. This calculator does not verify eligibility, connect a wallet or submit orders.",
            "仅供信息参考的假设工具，不构成个性化投资建议。费用、资金费及其他成本是用户输入的估算；损失可能超过模型金额。交易可用性取决于您的司法管辖区、场所规则和资格。本计算器不会验证资格、连接钱包或提交订单。",
          )}
        </aside>
        <p className="opsis-receipt">
          {c(
            "Calculated locally in memory at eight-decimal precision. Cost terms truncate toward zero; liquidation price rounds toward earlier liquidation. Funding frequency is only what you enter; no annualization. Collateral is not a fee. This is not venue margin math: margin tiers, mark-price rules, inverse/quanto contracts, collateral FX, partial fills and venue rounding are outside this model. A scenario is hypothetical, not a close quote. Opsis does not place, route, transmit or receive orders. The venue's own figure governs.",
            "仅在本地内存以八位小数精度计算。成本项向零截断；清算价格向更早清算的方向取整。资金费频率仅使用您的输入；不年化。抵押品不是费用。这不是场所保证金计算：保证金等级、标记价格规则、反向／Quanto 合约、抵押品汇率、部分成交及场所取整规则均在模型外。情景是假设，并非平仓报价。Opsis 不放置、路由、传输或接收订单。以场所自身的数值为准。",
          )}
        </p>
      </div>
      <PerpHandoff capabilities={capabilities} summary={summary} />
    </section>
  );
}

function PerpNumberInput({
  field,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  field?: PerpNumericField;
  value: string;
}) {
  const c = useCopy();
  const id = useId();
  const error = field ? perpInputError(field, props.value) : null;
  return (
    <>
      <input
        {...props}
        aria-invalid={!!error || undefined}
        aria-describedby={
          [props["aria-describedby"], error ? id : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {error && (
        <span id={id} className="opsis-field-error" role="alert">
          {c(...error)}
        </span>
      )}
    </>
  );
}
