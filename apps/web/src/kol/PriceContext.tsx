import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { profiles, profileFor, type Call } from "./model";
import { formatPercent } from "./performance";
import { contextReturn, priceContext, reactionEdition } from "./reactions";
type Translate = (en: string, zh: string) => string;
const date = (timestamp: number) =>
  new Date(timestamp * 1000).toISOString().replace("T", " ").slice(0, 16) +
  " UTC";

export function MentionPrices({ call, L }: { call: Call; L: Translate }) {
  const context = priceContext(call);
  return (
    <section
      className="kol-mention-prices"
      aria-label={L("Price context after mention", "提及后的价格背景")}
    >
      <h4>{L("Token prices after this post", "发帖后的代币价格")}</h4>
      <p>
        {L(
          "Observed price changes, not a trade score, KOL P&L or proof the post moved the market.",
          "观测价格变化，不代表交易评分、KOL 盈亏，也不证明帖子导致市场变化。",
        )}
      </p>
      {context.assets.length > 0 ? (
        <div className="kol-mention-assets">
          {context.assets.map((asset) => (
            <div key={asset.id}>
              <strong>{asset.symbol}</strong>
              <span
                className={
                  contextReturn(asset) >= 0 ? "is-positive" : "is-negative"
                }
              >
                {formatPercent(contextReturn(asset))}
              </span>
              <small>{L("7D price move", "七日价格变化")}</small>
              <details>
                <summary>{L("Exact observations", "具体观测")}</summary>
                <span>
                  $
                  {asset.prices[0].price.toLocaleString("en-US", {
                    maximumFractionDigits: 6,
                  })}
                  <small>{date(asset.prices[0].timestamp)}</small>
                </span>
                <span>
                  → $
                  {asset.prices[7].price.toLocaleString("en-US", {
                    maximumFractionDigits: 6,
                  })}
                  <small>{date(asset.prices[7].timestamp)}</small>
                </span>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <strong className="kol-context-state">
          {context.status === "pending"
            ? L("Awaiting the complete seven-day window", "等待完整七日观察")
            : context.status === "no-asset"
              ? L("No named token to measure", "没有可衡量的具体代币")
              : L(
                  "Token identity or price evidence still needed",
                  "仍需确认代币身份或价格证据",
                )}
        </strong>
      )}
      {context.assets.length > 0 && context.missing.length > 0 && (
        <p>
          {L(
            "Partial asset coverage. Not measured: ",
            "资产覆盖不完整，未衡量：",
          )}
          {context.missing.join(", ")}
        </p>
      )}
      {context.url && (
        <a href={context.url} target="_blank" rel="noopener noreferrer">
          {L("Inspect price source", "查看价格来源")} <ArrowUpRight size={13} />
        </a>
      )}
    </section>
  );
}

export function PriceContextPanel({
  items,
  L,
}: {
  items: Call[];
  L: Translate;
}) {
  const [author, setAuthor] = useState("");
  const [onlyMeasured, setOnlyMeasured] = useState(true);
  const [page, setPage] = useState(0);
  const scoped = items.filter((call) => !author || call.profile === author);
  const measured = scoped.filter(
    (call) => priceContext(call).assets.length > 0,
  );
  const shown = onlyMeasured ? measured : scoped;
  const current = Math.min(page, Math.max(0, Math.ceil(shown.length / 12) - 1));
  return (
    <section
      className="kol-context-panel"
      aria-label={L("Token moves after posts", "发帖后代币走势")}
    >
      <div className="kol-section-heading">
        <div>
          <h2>{L("What happened after they posted?", "发帖后发生了什么？")}</h2>
          <p>
            {L(
              "Price context for every resolved token mention—even when the post is not a trade call.",
              "为每条已确认代币提及提供价格背景，即使帖子不是交易观点。",
            )}
          </p>
        </div>
        <select
          aria-label={L("Filter price-context author", "筛选价格背景作者")}
          value={author}
          onChange={(event) => {
            setAuthor(event.target.value);
            setPage(0);
          }}
        >
          <option value="">{L("All KOLs", "全部 KOL")}</option>
          {profiles.map((profile) => (
            <option value={profile.id} key={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </div>
      <div className="kol-context-meta">
        <span role="status">
          {measured.length}{" "}
          {L("posts with measured prices", "篇有价格观测的帖子")} /{" "}
          {scoped.length} {L("tracked", "已收集")}
        </span>
        <label>
          <input
            type="checkbox"
            checked={onlyMeasured}
            onChange={(event) => {
              setOnlyMeasured(event.target.checked);
              setPage(0);
            }}
          />{" "}
          {L("With prices only", "仅有价格的帖子")}
        </label>
        <small>
          {L("As of", "截至")} {reactionEdition.asOf.slice(0, 10)} ·{" "}
          {L("Not a KOL success rate", "不代表 KOL 成功率")}
        </small>
      </div>
      {shown.slice(current * 12, current * 12 + 12).map((call) => (
        <article key={call.id} className="kol-context-post">
          <header>
            <img src={profileFor(call.profile).avatar} alt="" />
            <div>
              <strong>{profileFor(call.profile).name}</strong>
              <small>{call.publishedAt.slice(0, 10)}</small>
            </div>
            <a href={call.url} target="_blank" rel="noopener noreferrer">
              {L("Original post", "原帖")} <ArrowUpRight size={14} />
            </a>
          </header>
          <p>{call.summary}</p>
          <MentionPrices call={call} L={L} />
        </article>
      ))}
      {!shown.length && (
        <div className="kol-empty">
          <h3>
            {L(
              "No price observations in this selection",
              "当前筛选暂无价格观测",
            )}
          </h3>
          <p>
            {L(
              "Choose another KOL or turn off the price-only filter to inspect the missing evidence.",
              "选择其他 KOL，或取消仅显示价格的筛选以查看缺失证据。",
            )}
          </p>
        </div>
      )}
      {shown.length > 12 && (
        <div className="kol-pagination">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            {L("Previous", "上一页")}
          </button>
          <span>
            {current * 12 + 1}–{Math.min(shown.length, current * 12 + 12)} /{" "}
            {shown.length}
          </span>
          <button
            disabled={(current + 1) * 12 >= shown.length}
            onClick={() => setPage(current + 1)}
          >
            {L("Next", "下一页")}
          </button>
        </div>
      )}
    </section>
  );
}
