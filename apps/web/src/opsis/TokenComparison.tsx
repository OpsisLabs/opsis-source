import { useState } from "react";
import { useCopy } from "./copy";
import { change, money, type LabData } from "./lab-data";
import { safeHttpUrl } from "../dashboard/adapters";
export default function TokenComparison({ data }: { data: LabData }) {
  const c = useCopy();
  const [selected, setSelected] = useState(
    data.tokens.slice(0, 3).map((t) => t.id),
  );
  const [metric, setMetric] = useState<"liquidity" | "volume24h">("liquidity");
  const tokens = data.tokens.filter((t) => selected.includes(t.id));
  const maximum = Math.max(1, ...tokens.map((t) => t[metric]));
  return (
    <section
      className="opsis-token-comparison"
      aria-label={c("Captured token comparison", "历史代币比较")}
    >
      <div className="opsis-section-label">
        <span>04 / {c("COMPARE THE CAPTURE", "比较历史数据")}</span>
        <span>{c("UP TO THREE TOKENS", "最多三个代币")}</span>
      </div>
      <div className="opsis-token-choices">
        {data.tokens.map((t) => (
          <button
            key={t.id}
            aria-pressed={selected.includes(t.id)}
            disabled={!selected.includes(t.id) && selected.length === 3}
            onClick={() =>
              setSelected(
                selected.includes(t.id)
                  ? selected.filter((id) => id !== t.id)
                  : [...selected, t.id],
              )
            }
          >
            {t.symbol}
            <span>{change(t.returns.h24)}</span>
          </button>
        ))}
      </div>
      <p className="opsis-small">
        {c(
          "24h change above is a captured observation. Deselect a token to compare another.",
          "上方为历史 24 小时变化。取消选择一个代币以比较其他代币。",
        )}
      </p>
      <label>
        {c("Comparison measure", "比较指标")}{" "}
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
        >
          <option value="liquidity">
            {c("Indexed liquidity", "索引流动性")}
          </option>
          <option value="volume24h">
            {c("Captured 24h volume", "历史 24 小时交易量")}
          </option>
        </select>
      </label>
      <div className="opsis-comparison-bars">
        {tokens.map((t) => (
          <div key={t.id}>
            <b>{t.symbol}</b>
            <span className="opsis-comparison-track" aria-hidden="true">
              <i style={{ width: `${(100 * t[metric]) / maximum}%` }} />
            </span>
            <output>{money(t[metric])}</output>
          </div>
        ))}
      </div>
      {!tokens.length && (
        <p role="status">
          {c("Select tokens to compare.", "选择要比较的代币。")}
        </p>
      )}
      {!!tokens.length && (
        <div className="opsis-table-scroll" tabIndex={0} role="region" aria-label={c("Token comparison", "代币比较")}>
          <table>
            <caption>
              {c("Exact captured token comparison", "精确的历史代币比较")}
            </caption>
            <thead>
              <tr>
                <th>{c("Token", "代币")}</th>
                <th>{c("Price", "价格")}</th>
                <th>{c("Liquidity", "流动性")}</th>
                <th>{c("Volume · 24h", "交易量 · 24 小时")}</th>
                <th>{c("Source", "来源")}</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <th>
                    {t.symbol}
                    <small className="opsis-identity">{t.contract}</small>
                  </th>
                  <td>${t.price.toLocaleString("en-US", { maximumFractionDigits: 18 })}</td>
                  <td>{money(t.liquidity)}</td>
                  <td>{money(t.volume24h)}</td>
                  <td>
                    {safeHttpUrl(t.marketUrl) && (
                      <a
                        href={safeHttpUrl(t.marketUrl)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c("Public source", "公开来源")} ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="opsis-small">
        {c(
          "Indexed pool liquidity and captured volume are not executable depth or a guarantee of coverage. Sources may use different pool scopes.",
          "索引资金池流动性和历史交易量不代表可执行深度，也不保证覆盖范围。来源可能使用不同的资金池范围。",
        )}
      </p>
    </section>
  );
}
