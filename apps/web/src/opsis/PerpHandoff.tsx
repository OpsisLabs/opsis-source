import { useId, useState } from "react";
import { useCopy } from "./copy";
import { useI18n } from "../i18n";
import type { Capabilities } from "./model";
import { DIRECTORY_CHECKED_AT, directoryNeedsReview, sourcesForRegion, venuesForRegion, type PerpVenue, type Region } from "./perp-venues";
import "./perp-handoff.css";
import "./check.css";

export default function PerpHandoff({ capabilities, summary }: { capabilities: Capabilities; summary: string[] | null }) {
  const c = useCopy();
  const { locale } = useI18n();
  const id = useId();
  const [region, setRegion] = useState<Region | null>(null);
  const [copyStatus, setCopyStatus] = useState<{ summary: string; result: "copied" | "failed" } | null>(null);
  if (capabilities.perpHandoff !== true) return null;

  const stale = directoryNeedsReview(new Date());
  const checked = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${DIRECTORY_CHECKED_AT}T00:00:00Z`));
  const groups = venuesForRegion(region);
  const text = summary?.join("\n") ?? null;
  const status = copyStatus?.summary === text ? copyStatus.result : null;
  const sources = (venue: PerpVenue, shownFor: "us" | "ca") => <ul className="opsis-perp-sources opsis-small">
    {sourcesForRegion(venue, shownFor).map((source) => <li key={source.url}>
      <a className="opsis-text-link" href={source.url} target="_blank" rel="noopener noreferrer">{c(...source.label)} ↗</a>
    </li>)}
  </ul>;
  const card = (venue: PerpVenue) => {
    if (region !== "us" && region !== "ca") return null;
    const availability = venue.regions[region];
    return <article className="opsis-panel opsis-perp-venue" key={venue.name}>
      <h3>{c(venue.name, venue.name)}</h3>
      <p className="opsis-kicker">{availability.status === "restricted"
        ? c("Eligible customers only", "仅限符合资格的客户")
        : stale ? c("Listed when last checked", "上次核查时列为提供") : c("Offered, per the venue's own pages", "据场所自己的页面提供")}</p>
      <p>{c(...venue.product)}</p>
      <h4>{c("What the venue says", "场所的说明")}</h4>
      <p>{c(...availability.conditions)}</p>
      {sources(venue, region)}
      <p className="opsis-small">{c(`Checked ${checked}`, `核查日期：${checked}`)}</p>
      <a className="opsis-action" href={venue.url} target="_blank" rel="noopener noreferrer">{c(`Open ${venue.name} ↗`, `打开 ${venue.name} ↗`)}</a>
    </article>;
  };
  const copy = async () => {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus({ summary: text, result: "copied" });
    } catch {
      setCopyStatus({ summary: text, result: "failed" });
    }
  };

  return <section className="opsis-panel opsis-perp-handoff" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>{c("Take this to a venue", "带着情景前往交易场所")}</h2>
    <p className="opsis-small">{c(
      "Opsis has no perp trading. It does not send your scenario or any order to a venue, does not check who you are or whether a venue accepts you, does not recommend a venue and is not paid by any venue. Each venue decides eligibility in its own onboarding. Perpetual futures are leveraged; losses can exceed what you model here. Not investment advice.",
      "Opsis 不提供永续合约交易。不向场所发送您的情景或任何订单，不核验您的身份或场所是否接受您，不推荐场所，也不从任何场所获得报酬。各场所在自己的开户流程中决定资格。永续期货带有杠杆；损失可能超过此处建模的范围。不构成投资建议。",
    )}</p>
    {stale && <p className="opsis-perp-review opsis-small" role="status">{c(
      `This directory was last checked on ${checked} and is due for review. Confirm on each venue's own page.`,
      `此目录上次核查于 ${checked}，现需再次查阅。请在各场所自己的页面上确认。`,
    )}</p>}
    <fieldset className="opsis-perp-regions">
      <legend>{c("Where do you live?", "您住在哪里？")}</legend>
      {([ ["us", c("United States", "美国")], ["ca", c("Canada", "加拿大")], ["other", c("Somewhere else", "其他地区")] ] as const).map(([value, label]) =>
        <label key={value}>
          <input type="radio" name={`${id}-region`} value={value} checked={region === value} onChange={() => setRegion(value)} />
          <span>{label}</span>
        </label>,
      )}
    </fieldset>
    {region === "other" && <p>{c("Opsis has reviewed venues for the United States and Canada only. Check a venue's own eligibility page for your country.", "Opsis 仅查阅了美国和加拿大的场所。请查看场所针对您所在国家的资格页面。")}</p>}
    {(region === "us" || region === "ca") && <div className="opsis-perp-directory">
      {region === "us" && <p className="opsis-small">{c("Availability can differ by state; each venue's onboarding decides.", "可用性可能因州而异；由各场所的开户流程决定。")}</p>}
      {region === "ca" && groups.offered.length === 0 && <p>{c("No venue in this directory offers perpetual futures to retail customers in Canada.", "此目录中没有场所向加拿大零售客户提供永续期货。")}</p>}
      <div className="opsis-perp-cards">{[...groups.offered, ...groups.restricted].sort((a, b) => a.name.localeCompare(b.name, "en")).map(card)}</div>
      {groups.notOffered.length > 0 && <div>
        <h3>{c(`Not offered to residents of ${region === "ca" ? "Canada" : "the United States"}, per the venue's own pages:`, `据场所自己的页面，不向${region === "ca" ? "加拿大" : "美国"}居民提供：`)}</h3>
        <ul className="opsis-perp-exclusions">{groups.notOffered.map((venue) => <li key={venue.name}>
          <h4>{c(venue.name, venue.name)}</h4>
          <p>{c(...venue.regions[region].conditions)}</p>
          {sources(venue, region)}
        </li>)}</ul>
      </div>}
    </div>}
    <div className="opsis-perp-summary">
      <h3>{c("Scenario summary", "情景摘要")}</h3>
      {text === null ? <p className="opsis-small">{c("Complete the scenario above to get a summary to take with you.", "请完成上方情景，以获取可带走的摘要。")}</p> : <>
        <pre className="opsis-small" tabIndex={0}>{text}</pre>
        <button className="opsis-action" type="button" onClick={copy}>{c("Copy summary", "复制摘要")}</button>
        <p className="opsis-small" role="status">{status === "copied" ? c("Copied", "已复制") : status === "failed" ? c("Copy failed. Select the text and copy it yourself.", "复制失败。请选中文本并自行复制。") : null}</p>
      </>}
    </div>
  </section>;
}
