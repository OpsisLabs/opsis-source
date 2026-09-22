import { useState } from "react";
import { useCopy } from "./copy";
import { perpScenario } from "./perp-scenario";
export default function PerpScenario() {
  const c = useCopy();
  const [side, setSide] = useState<"long" | "short">("long");
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
  try {
    result = perpScenario({ side, ...values });
  } catch {
    /* Input state explicitly shown, never synthesize defaults. */
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
      <p className="opsis-receipt">
        {c(
          "Calculated locally in memory, truncated to eight decimals per term. No assumed funding frequency or annualization. Collateral is not a fee. Margin tiers, liquidation, inverse/quanto contracts, collateral FX, partial fills and venue rounding are outside this model. A scenario is not a close quote or a guarantee. Opening and closing remain unavailable pending an admitted venue for Canada/US.",
          "仅在本地内存计算，每项截断至八位小数。不假设资金费频率或年化。抵押品不是费用。保证金等级、清算、反向／Quanto 合约、抵押品汇率、部分成交及场所取整规则均在模型外。情景并非平仓报价或保证。加拿大／美国场所准入前，开仓和平仓仍不可用。",
        )}
      </p>
    </section>
  );
}
