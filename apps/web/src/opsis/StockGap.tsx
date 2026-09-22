import { useState } from "react";
import { stockGap } from "./stock-gap";
import { useCopy } from "./copy";
export default function StockGap() {
  const c = useCopy();
  const [dex, setDex] = useState("");
  const [reference, setReference] = useState("");
  const [multiplier, setMultiplier] = useState("1");
  const [mode, setMode] = useState<"underlying" | "oracle">("underlying");
  const [unit, setUnit] = useState("USD");
  const [referenceUnit, setReferenceUnit] = useState("USD");
  const [session, setSession] = useState("unknown");
  const [confirmed, setConfirmed] = useState(false);
  let value: string | null = null;
  try {
    if (confirmed)
      value = stockGap({
        dex,
        reference,
        multiplier,
        mode,
        unit,
        referenceUnit,
      });
  } catch {
    /* explicit incomplete state below */
  }
  return (
    <section className="opsis-panel" aria-labelledby="stock-gap-title">
      <p className="opsis-kicker">
        {c("LOCAL SCENARIO / MANUAL INPUTS", "本地情景／手动输入")}
      </p>
      <h2 id="stock-gap-title">
        {c("Stock-token reference gap", "股票代币参考价差")}
      </h2>
      <p>
        {c(
          "Compare explicitly entered prices in the same quote currency. This tool does not fetch prices, establish token eligibility, or prove an arbitrage can execute.",
          "比较以相同报价货币明确输入的价格。此工具不获取价格、不确定代币资格，也不证明套利可以执行。",
        )}
      </p>
      <div className="opsis-two-column">
        <label>
          {c("DEX price per token", "每枚代币的 DEX 价格")}
          <input
            inputMode="decimal"
            value={dex}
            onChange={(e) => setDex(e.target.value)}
          />
        </label>
        <label>
          {c("Reference type", "参考类型")}
          <select
            aria-label={c("Reference type", "参考类型")}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="underlying">
              {c("Independent underlying price", "独立标的价格")}
            </option>
            <option value="oracle">
              {c(
                "Token oracle (multiplier already included)",
                "代币预言机（已含乘数）",
              )}
            </option>
          </select>
        </label>
        <label>
          {c("Reference price", "参考价格")}
          <input
            inputMode="decimal"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        {mode === "underlying" && (
          <label>
            {c(
              "Underlying units per token (multiplier)",
              "每枚代币对应的标的单位（乘数）",
            )}
            <input
              inputMode="decimal"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
            />
          </label>
        )}
        <label>
          {c("DEX quote currency", "DEX 报价货币")}
          <select
            aria-label={c("DEX quote currency", "DEX 报价货币")}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option>USD</option>
            <option>USDG</option>
          </select>
        </label>
        <label>
          {c("Reference quote currency", "参考报价货币")}
          <select
            aria-label={c("Reference quote currency", "参考报价货币")}
            value={referenceUnit}
            onChange={(e) => setReferenceUnit(e.target.value)}
          >
            <option>USD</option>
            <option>USDG</option>
          </select>
        </label>
        <label>
          {c("Underlying market session", "标的市场时段")}
          <select value={session} onChange={(e) => setSession(e.target.value)}>
            <option value="unknown">{c("Unknown", "未知")}</option>
            <option value="open">
              {c("Open (user supplied)", "开市（用户提供）")}
            </option>
            <option value="closed">
              {c("Closed (reference may be stale)", "休市（参考价可能过期）")}
            </option>
          </select>
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        {c(
          "I have checked that these inputs refer to the same instrument, time and corporate-action basis.",
          "我已核查这些输入对应相同标的、时间及公司行动基准。",
        )}
      </label>
      <div aria-live="polite">
        <h3>
          {value === null ? c("Gap unavailable", "价差不可用") : `${value}%`}
        </h3>
        <p>{mode === "underlying" ? "D / (M × U) − 1" : "D / Q − 1"}</p>
        <p>
          {unit !== referenceUnit
            ? c(
                "Currencies differ. USDG is not automatically USD; no conversion is assumed.",
                "货币不同。USDG 不自动等于 USD；不假设汇率转换。",
              )
            : value === null
              ? c(
                  "Enter positive decimal inputs and verify their common basis.",
                  "请输入正十进制数并核查共同基准。",
                )
              : c(
                  "Derived from your manual scenario inputs; percentage is truncated to four decimals.",
                  "根据您手动输入的情景推导；百分比截断至四位小数。",
                )}
        </p>
      </div>
      <p className="opsis-receipt">
        {c(
          "All inputs stay in this page’s memory. Market session is user-supplied and not verified. Costs, transfer limits, pending corporate actions and availability are excluded. Robinhood Stock Tokens are not available to US persons.",
          "全部输入仅保留在此页面内存。市场时段由用户提供且未经验证。不含成本、转移限制、待处理公司行动及可用性。Robinhood 股票代币不向美国人士提供。",
        )}
      </p>
    </section>
  );
}
