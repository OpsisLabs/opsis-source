import { useState } from "react";
import { Link } from "react-router";
import type {
  DeskFact,
  StockDeskIndex,
  StockDeskResult,
} from "@rh-chain/shared";
import { privateApi } from "../dashboard/http";
import { useI18n, type TranslationKey } from "../i18n";

export default function StockDesk({
  address,
  onSelect,
}: {
  address: string;
  onSelect(address: string): void;
}) {
  const { t } = useI18n();
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
      {pending && <p role="status">{t("desk.loading")}</p>}
      {error && <p role="alert">{t("desk.error")}</p>}
      {desk && <DeskFacts desk={desk} />}
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
                        </Link>
                        <DeskFacts desk={entry.desk} compact />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
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
export function DeskFacts({
  desk,
  compact = false,
}: {
  desk: StockDeskResult;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const fact = <T,>(value: DeskFact<T>, format: (v: T) => string) =>
    value.state === "available"
      ? format(value.value)
      : `${t("desk.unknown")} · ${value.reason}`;
  const rows: Array<[TranslationKey, DeskFact<unknown>, string]> = [
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
          `${v.priceUsdG} USDG · ${v.inputAmount} → ${v.outputAmount} USDG · ${t("desk.expires")} ${v.expiresAt}`,
      ),
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
            {rows.map(([label, value, text], i) => (
              <tr key={i}>
                <th scope="row">{t(label)}</th>
                <td>{text}</td>
                <td>
                  {value.state === "available"
                    ? value.evidence.map((e, j) => (
                        <div key={j}>
                          {e.source}
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
          <p>{t(desk.receipt ? "desk.receipted" : "desk.noReceipt")}</p>
          {desk.receipt && (
            <details>
              <summary>{t("desk.receipt")}</summary>
              <pre className="overflow-x-auto">
                {JSON.stringify(desk.receipt, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
