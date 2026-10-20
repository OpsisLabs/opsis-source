import { useState } from "react";
import { Link } from "react-router";
import type {
  DeskFact,
  StockDeskIndex,
  StockDeskResult,
} from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { useI18n, type TranslationKey } from "../i18n";
import { ReceiptActions } from "../opsis/ReceiptActions";
import { stockCardPath } from "./stock-card";
import { ExplorerLink } from "../opsis/ExplorerLink";

export default function StockDesk({
  address,
  onSelect,
  receipts = false,
  publicCards = false,
}: {
  address: string;
  onSelect(address: string): void;
  receipts?: boolean;
  publicCards?: boolean;
}) {
  const { t, locale } = useI18n();
  const [desk, setDesk] = useState<StockDeskResult | null>(null);
  const [index, setIndex] = useState<StockDeskIndex | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const load = async (kind: "token" | "index") => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      if (kind === "token")
        setDesk(
          await privateApi<StockDeskResult>("/v1/private/stock-desk/token", {
            address,
          }),
        );
      else
        setIndex(
          await privateApi<StockDeskIndex>("/v1/private/stock-desk/index", {}),
        );
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="rwa-ws-panel" aria-label={t("desk.title")}>
      <h2>{t("desk.title")}</h2>
      <p>{t("desk.boundary")}</p>
      <p>{t("desk.disclaimer")}</p>
      <div className="flex flex-wrap gap-3 my-4">
        <button
          className="rwa-ws-primary"
          disabled={pending}
          onClick={() => void load("token")}
        >
          {t("desk.load")}
        </button>
        <button
          className="rwa-ws-primary"
          disabled={pending}
          onClick={() => void load("index")}
        >
          {t("desk.index")}
        </button>
      </div>
      {publicCards && <StockCardShare key={`${address}:${locale}`} address={address} />}
      {pending && <p role="status">{t("desk.loading")}</p>}
      {error && <p role="alert">{t("desk.error")}</p>}
      {desk && <DeskFacts desk={desk} receipts={receipts} />}
      {index && (
        <div>
          <h3>{t("desk.index")}</h3>
          <p>{t("desk.dataLabel")}</p>
          <p>
            {index.observedAt} · {t("desk.expires")} {index.expiresAt}
          </p>
          <p>{t("desk.coverage")}</p>
          {(
            [
              ["gaps", index.gaps],
              ["events", index.multiplierEvents],
              ["stale", index.staleFeeds],
            ] as const
          ).map(([key, addresses]) => (
            <div key={key}>
              <h4>{t(`desk.${key}`)}</h4>
              {addresses.length === 0 ? (
                <p>{t("desk.noEntries")}</p>
              ) : (
                <ul>
                  {addresses.map((value) => {
                    const entry = index.entries.find(
                      (e) => e.desk.address === value,
                    )!;
                    return (
                      <li key={value}>
                        <Link to={entry.href} onClick={() => onSelect(value)}>
                          {entry.desk.symbol ?? value} · {value}
                        </Link><ExplorerLink kind="token" value={value} />
                        <DeskFacts desk={entry.desk} compact />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
          {index.entries.some((e) => e.desk.gapBps.state !== "available") && (
            <div>
              <h4>{t("desk.noGap")}</h4>
              <ul>
                {index.entries
                  .filter((e) => e.desk.gapBps.state !== "available")
                  .map((e) => {
                    const why = e.desk.pool.state !== "available" ? e.desk.pool : e.desk.gapBps;
                    const reason = why.state === "available" ? "" : why.reason;
                    return (
                      <li key={e.desk.address}>
                        {e.desk.symbol ?? e.desk.address}: {t(reason.startsWith("POOL_QUOTE") ? "desk.noGap.pool" : reason.startsWith("FEED") || reason.startsWith("CHAINLINK") ? "desk.noGap.reference" : "desk.noGap.other")} ({reason})
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
          <details>
            <summary>{t("desk.unknowns")}</summary>
            {index.entries.map((e) => (
              <div key={e.desk.address}>
                <Link to={e.href} onClick={() => onSelect(e.desk.address)}>
                  {e.desk.symbol ?? e.desk.address}
                </Link>
                <DeskFacts desk={e.desk} compact />
              </div>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}

export function StockCardShare({ address }: { address: string }) {
  const { t, locale } = useI18n();
  const path = stockCardPath(address, locale);
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  if (!path) return null;
  const url = () => new URL(`${import.meta.env.VITE_API_BASE_URL ?? ""}${path}`, window.location.origin).href;
  const load = async () => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      const response = await fetch(url(), { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/svg+xml")) throw new Error();
      const svg = await response.text();
      if (new TextEncoder().encode(svg).byteLength >= 16 * 1024) throw new Error();
      setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };
  return (
    <div className="my-4">
      <button className="rwa-ws-primary" disabled={pending} onClick={() => void load()}>{t("desk.share")}</button>
      {pending && <p role="status">{t("desk.share.loading")}</p>}
      {error && <p role="alert">{t("desk.share.error")}</p>}
      {preview && <div className="mt-3">
        <img className="w-full max-w-sm" src={preview} alt={t("desk.share.preview")} />
        <button className="rwa-ws-primary mt-3" onClick={() => void copyUrl()}>{t("desk.share.copy")}</button>
        {copy !== "idle" && <p role={copy === "failed" ? "alert" : "status"}>{t(copy === "copied" ? "desk.share.copied" : "desk.share.copyFailed")}</p>}
      </div>}
    </div>
  );
}
/** Round a non-negative decimal string for display; the exact value stays in the title. */
function roundDecimal(value: string, places: number): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value;
  const [, whole, fraction = ""] = match;
  if (fraction.length <= places) return value;
  const scaled = BigInt(whole + fraction.slice(0, places)) + (Number(fraction[places]) >= 5 ? 1n : 0n);
  const text = scaled.toString().padStart(places + 1, "0");
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}
export function DeskFacts({
  desk,
  compact = false,
  receipts = false,
}: {
  desk: StockDeskResult;
  compact?: boolean;
  receipts?: boolean;
}) {
  const { t } = useI18n();
  const fact = <T,>(value: DeskFact<T>, format: (v: T) => string) =>
    value.state === "available"
      ? format(value.value)
      : `${t("desk.unknown")} · ${value.reason}`;
  const rows: Array<[TranslationKey, DeskFact<unknown>, string, string?]> = [
    [
      "desk.reference",
      desk.reference,
      fact(
        desk.reference,
        (v) =>
          `${v.priceUsd} USD · ${t(v.multiplierEmbedded ? "desk.embedded" : "desk.applied")}`,
      ),
    ],
    [
      "desk.pool",
      desk.pool,
      fact(
        desk.pool,
        (v) =>
          `${roundDecimal(v.priceUsdG, 4)} USDG · ${v.inputAmount} → ${v.outputAmount} USDG · ${t("desk.expires")} ${v.expiresAt}`,
      ),
      desk.pool.state === "available" ? `${desk.pool.value.priceUsdG} USDG` : undefined,
    ],
    ["desk.gap", desk.gapBps, fact(desk.gapBps, (v) => `${v} bps`)],
    [
      "desk.multiplier",
      desk.multiplier,
      fact(
        desk.multiplier,
        (v) =>
          `${v.current} → ${v.scheduled ?? t("desk.unknown")} · ${v.effectiveAt ?? t("desk.unknown")}`,
      ),
    ],
    [
      "desk.feed",
      desk.feed,
      fact(
        desk.feed,
        (v) =>
          `${v.updatedAt} · ${v.ageSeconds}s / ${v.heartbeatSeconds}s · ${t(v.stale ? "desk.stale" : "desk.current")} · ${v.paused ? t("desk.paused") : ""} · ${t(v.expectedOffHours ? "desk.offHours" : "desk.regularHours")}`,
      ),
    ],
  ];
  if (!compact) {
    for (const d of desk.depth)
      rows.push([
        "desk.depth",
        d.quote,
        `${d.notionalUsd} USD: ${fact(d.quote, (v) => `${v.inputAmount} → ${v.outputAmount} USDG · ${v.impactBps ?? t("desk.unknown")} bps · ${t("desk.expires")} ${v.expiresAt}`)}`,
      ]);
    rows.push([
      "desk.holders",
      desk.concentration,
      fact(
        desk.concentration,
        (v) =>
          `${t("desk.top10")} ${v.top10Percent}% · ${t("desk.pools")} ${v.poolPercent}% · ${t("desk.burns")} ${v.burnPercent}% · ${t("desk.sample")} ${v.holdersAnalyzed}`,
      ),
    ]);
    rows.push([
      "desk.actions",
      desk.corporateActions,
      fact(desk.corporateActions, (v) =>
        v.length
          ? v
              .map(
                (a) =>
                  `${a.type} · ${a.status} · ${a.processDate ?? t("desk.unknown")} · ${a.detail}`,
              )
              .join("; ")
          : t("desk.noEntries"),
      ),
    ]);
  }
  return (
    <div>
      <p><code>{desk.address}</code><ExplorerLink kind="token" value={desk.address} /></p>
      <p>
        {t(`desk.canonical.${desk.canonical}`)} · {desk.observedAt}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>{t("desk.fact")}</th>
              <th>{t("desk.value")}</th>
              <th>{t("desk.evidence")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, text, exact], i) => (
              <tr key={i}>
                <th scope="row">{t(label)}</th>
                <td title={exact}>{text}</td>
                <td>
                  {value.state === "available"
                    ? value.evidence.map((e, j) => (
                        <div key={j}>
                          {e.source}
                          {/^(chainlink|exit-check):/.test(e.source) && <ExplorerLink kind="address" value={e.source.split(":")[1] ?? ""} />}
                          {e.value && ` · ${e.value} ${e.unit}`} ·{" "}
                          {t("desk.block")} {e.block ?? t("desk.unknown")} ·{" "}
                          {e.time}
                          {e.blockHash && (
                            <span className="block break-all">
                              {e.blockHash}
                            </span>
                          )}
                        </div>
                      ))
                    : t("desk.unknown")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <>
          <p>{t("desk.history")}</p>
          <p>{t("desk.calendar")}</p>
          <p>{t("desk.limits")}</p>
          {receipts && <ReceiptActions receipt={desk.receipt} />}
        </>
      )}
    </div>
  );
}
