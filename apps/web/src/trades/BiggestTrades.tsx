import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../i18n";
import { ApiError } from "../dashboard/http";
import { isObservedTradesEnabled } from "../product/availability";
import { FollowWalletAction } from "../watch/FollowWalletAction";
import {
  fetchObservedTrades,
  type ObservedTradeObservation,
  type ObservedTradesResponse,
} from "./api";
import {
  explorerAddressUrl,
  explorerTxUrl,
  followClassification,
  formatTimestamp,
  OBSERVED_TRADES_CHAIN_ID,
  OBSERVED_TRADES_FEE_OPTIONS,
  OBSERVED_TRADES_WINDOW_OPTIONS,
  senderTypeKey,
  shortAddress,
  tradeSideKey,
} from "./model";

const CARD = "rounded-[4px] border border-[#3a3633] bg-[#201e1c]";
const LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-[#aaa39b]";

type FeeChoice = "auto" | (typeof OBSERVED_TRADES_FEE_OPTIONS)[number];

export default function BiggestTrades() {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [fee, setFee] = useState<FeeChoice>("auto");
  const [windowBlocks, setWindowBlocks] = useState<number>(
    OBSERVED_TRADES_WINDOW_OPTIONS[1],
  );
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [data, setData] = useState<ObservedTradesResponse | null>(null);
  const [message, setMessage] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // Any changed input is new consent: drop the stale abortable request and its
  // result so an observed window can never be attributed to the wrong inputs.
  const resetResult = () => {
    abort.current?.abort();
    abort.current = null;
    setStatus("idle");
    setData(null);
    setMessage("");
  };

  if (!isObservedTradesEnabled()) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <article className={CARD}>
          <div className="border-b border-[#34312f] px-6 py-5">
            <p className={LABEL}>{t("trades.metadata.title")}</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#f4ece4]">
              {t("trades.disabled.title")}
            </h1>
          </div>
          <p className="px-6 py-5 text-[14px] leading-relaxed text-[#b8b0a7]">
            {t("trades.disabled.body")}
          </p>
        </article>
      </main>
    );
  }

  const submit = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetchObservedTrades(
        {
          chainId: 4663,
          contract: token.trim() || undefined,
          fee: fee === "auto" ? undefined : fee,
          windowBlocks,
        },
        controller.signal,
      );
      setData(response);
      setStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(
        error instanceof ApiError && error.message
          ? error.message
          : t("trades.error.generic"),
      );
      setStatus("error");
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <p className={LABEL}>{t("trades.page.eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-[#f4ece4] sm:text-4xl">
        {t("trades.page.title")}
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[#b8b0a7]">
        {t("trades.page.intro")}
      </p>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void submit();
        }}
        className={`${CARD} mt-8 p-5 sm:p-6`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>{t("trades.form.tokenLabel")}</span>
            <input
              type="text"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                resetResult();
              }}
              placeholder={t("trades.form.tokenPlaceholder")}
              spellCheck={false}
              autoComplete="off"
              className="mt-2 w-full rounded-sm border border-[#4a443f] bg-[#171615] px-3 py-2 font-mono text-[13px] text-[#f4ece4] outline-none focus-visible:ring-2 focus-visible:ring-[#fa6c34]"
            />
            <span className="mt-2 block text-[12px] text-[#8f837b]">
              {t("trades.form.tokenHint")}
            </span>
          </label>
          <div className="grid gap-4">
            <label className="block">
              <span className={LABEL}>{t("trades.form.feeLabel")}</span>
              <select
                value={String(fee)}
                onChange={(event) => {
                  setFee(
                    event.target.value === "auto"
                      ? "auto"
                      : (Number(event.target.value) as FeeChoice),
                  );
                  resetResult();
                }}
                className="mt-2 w-full rounded-sm border border-[#4a443f] bg-[#171615] px-3 py-2 text-[13px] text-[#f4ece4] outline-none focus-visible:ring-2 focus-visible:ring-[#fa6c34]"
              >
                <option value="auto">{t("trades.form.feeAuto")}</option>
                {OBSERVED_TRADES_FEE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t("trades.form.feeOption", {
                      fee: option,
                      pct: option / 10_000,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>{t("trades.form.windowLabel")}</span>
              <select
                value={String(windowBlocks)}
                onChange={(event) => {
                  setWindowBlocks(Number(event.target.value));
                  resetResult();
                }}
                className="mt-2 w-full rounded-sm border border-[#4a443f] bg-[#171615] px-3 py-2 text-[13px] text-[#f4ece4] outline-none focus-visible:ring-2 focus-visible:ring-[#fa6c34]"
              >
                {OBSERVED_TRADES_WINDOW_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t("trades.form.windowOption", { blocks: option })}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div
          role="region"
          aria-label={t("trades.consent.title")}
          className="mt-5 rounded-sm border border-[#5b4a42] bg-[#241f1c] p-4"
        >
          <p className="text-[13px] font-semibold text-[#f4ece4]">
            {t("trades.consent.title")}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#b8b0a7]">
            {t("trades.consent.body")}
          </p>
          <button
            type="submit"
            disabled={status === "loading"}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-sm border border-[#fa6c34] bg-[#fa6c34] px-5 text-[13px] font-semibold text-[#1d1d1d] outline-none transition-colors hover:bg-[#ff7c48] focus-visible:ring-2 focus-visible:ring-[#ffd0bc] disabled:opacity-60"
          >
            {status === "loading"
              ? t("trades.consent.loading")
              : t("trades.consent.button")}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="mt-6">
        {status === "error" && (
          <div className={`${CARD} border-[#7a3b2a] p-5`} role="alert">
            <p className="text-[15px] font-semibold text-[#f4ece4]">
              {t("trades.error.title")}
            </p>
            <p className="mt-1 text-[13px] text-[#e0a08a]">{message}</p>
            <button
              type="button"
              onClick={() => void submit()}
              className="mt-3 min-h-[40px] rounded-sm border border-[#fa6c34] px-4 text-[13px] font-medium text-[#fa6c34] outline-none focus-visible:ring-2 focus-visible:ring-[#ffd0bc]"
            >
              {t("trades.error.retry")}
            </button>
          </div>
        )}
        {status === "ready" && data && <Result data={data} />}
      </div>
    </main>
  );
}

function Result({ data }: { data: ObservedTradesResponse }) {
  const { t } = useI18n();
  const baseSymbol = data.pair.base.symbol ?? shortAddress(data.pair.base.address);
  const quoteSymbol = data.pair.quote.symbol ?? shortAddress(data.pair.quote.address);
  return (
    <section className="space-y-5">
      <article className={`${CARD} p-5 sm:p-6`}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className={LABEL}>{t("trades.result.pairLabel")}</dt>
            <dd className="mt-1 text-[14px] text-[#f4ece4]">
              {baseSymbol} / {quoteSymbol}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>{t("trades.result.poolLabel")}</dt>
            <dd className="mt-1 break-all font-mono text-[12px] text-[#e9e0d1]">
              {explorerAddressUrl(data.pair.pool) ? (
                <a
                  href={explorerAddressUrl(data.pair.pool) ?? undefined}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline decoration-dotted hover:text-[#fa6c34]"
                >
                  {data.pair.pool}
                </a>
              ) : (
                data.pair.pool
              )}
              <span className="ml-2 text-[#aaa39b]">fee {data.pair.fee}</span>
            </dd>
          </div>
          <div>
            <dt className={LABEL}>
              {t("trades.result.windowLabel", {
                from: data.window.fromBlock,
                to: data.window.toBlock,
              })}
            </dt>
            <dd className="mt-1 text-[13px] text-[#e9e0d1]">
              {t("trades.result.windowValue", {
                fromTime: formatTimestamp(data.window.fromTime),
                toTime: formatTimestamp(data.window.toTime),
              })}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>{t("trades.result.scannedLabel")}</dt>
            <dd className="mt-1 text-[13px] text-[#e9e0d1]">
              {t("trades.result.scannedValue", {
                scanned: data.coverage.logsScanned,
                matched: data.coverage.matchedLogs,
                cap: data.coverage.logCap,
              })}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>{t("trades.result.methodLabel")}</dt>
            <dd className="mt-1 text-[13px] text-[#e9e0d1]">
              {t("trades.result.methodValue")}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>{t("trades.result.rpcLabel")}</dt>
            <dd className="mt-1 text-[13px] text-[#e9e0d1]">
              {data.coverage.rpcUnits}
            </dd>
          </div>
        </dl>
        {data.window.notes.length > 0 && (
          <div className="mt-4 border-t border-[#34312f] pt-3">
            <p className={LABEL}>{t("trades.result.notes")}</p>
            <ul className="mt-2 space-y-1 text-[13px] text-[#b8b0a7]">
              {data.window.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </article>

      {data.observations.length === 0 ? (
        <article className={`${CARD} p-5 sm:p-6`}>
          <h2 className="text-[16px] font-semibold text-[#f4ece4]">
            {t("trades.empty.title")}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#b8b0a7]">
            {t("trades.empty.body")}
          </p>
        </article>
      ) : (
        <article className={`${CARD} p-5 sm:p-6`}>
          <h2 className="text-[16px] font-semibold text-[#f4ece4]">
            {t("trades.summary.observed", {
              count: data.observations.length,
            })}
          </h2>
          <ol className="mt-4 space-y-3" aria-label={t("trades.table.caption")}>
            {data.observations.map((observation) => (
              <Observation
                key={observation.id}
                observation={observation}
                baseSymbol={baseSymbol}
                quoteSymbol={quoteSymbol}
              />
            ))}
          </ol>
        </article>
      )}

      <article className={`${CARD} p-5 sm:p-6`}>
        <h2 className="text-[15px] font-semibold text-[#f4ece4]">
          {t("trades.limitations.title")}
        </h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-[#b8b0a7]">
          {data.limitations.map((limitation) => (
            <li key={limitation} className="border-t border-[#34312f] pt-2">
              {limitation}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-[#34312f] pt-3 text-[12px] leading-relaxed text-[#8f837b]">
          <span className={LABEL}>{t("trades.privacy.label")}: </span>
          {data.privacy.disclosure}
        </p>
      </article>
    </section>
  );
}

function Observation({
  observation,
  baseSymbol,
  quoteSymbol,
}: {
  observation: ObservedTradeObservation;
  baseSymbol: string;
  quoteSymbol: string;
}) {
  const { t } = useI18n();
  const txUrl = explorerTxUrl(observation.txHash);
  return (
    <li className="rounded-sm border border-[#34312f] bg-[#1b1a19] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${
            observation.side === "buy"
              ? "bg-[#1f3a2b] text-[#8fd0a8]"
              : "bg-[#3a231f] text-[#e0a08a]"
          }`}
        >
          {t(tradeSideKey(observation.side))}
        </span>
        <span className="font-mono text-[14px] text-[#f4ece4]">
          {observation.notionalQuote} {quoteSymbol}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
        <div>
          <dt className={LABEL}>{t("trades.table.base")}</dt>
          <dd className="mt-0.5 font-mono text-[#e9e0d1]">
            {observation.baseAmount} {baseSymbol}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t("trades.table.quote")}</dt>
          <dd className="mt-0.5 font-mono text-[#e9e0d1]">
            {observation.quoteAmount} {quoteSymbol}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t("trades.table.sender")}</dt>
          <dd className="mt-0.5 break-all font-mono text-[#e9e0d1]">
            {observation.transactionSender
              ? shortAddress(observation.transactionSender)
              : "—"}{" "}
            <span className="font-sans text-[#8f837b]">
              ({t(senderTypeKey(observation.transactionSenderType))})
            </span>
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t("trades.table.tx")}</dt>
          <dd className="mt-0.5 break-all font-mono text-[#e9e0d1]">
            block {observation.blockNumber} · log {observation.logIndex}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t("trades.table.eventSender")}</dt>
          <dd className="mt-0.5 break-all font-mono text-[#8f837b]">
            {shortAddress(observation.eventSender) || "—"}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>{t("trades.table.eventRecipient")}</dt>
          <dd className="mt-0.5 break-all font-mono text-[#8f837b]">
            {shortAddress(observation.eventRecipient) || "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
        {txUrl && (
          <a
            href={txUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="min-h-[40px] inline-flex items-center text-[#fa6c34] hover:text-[#ff8a5c]"
          >
            {t("trades.table.viewTx")}
          </a>
        )}
        {observation.transactionSenderType === "eoa" &&
          observation.transactionSender && (
            <FollowWalletAction
              address={observation.transactionSender}
              chainId={OBSERVED_TRADES_CHAIN_ID}
              classification={followClassification(
                observation.transactionSenderType,
              )}
              variant="row"
              className="min-h-[40px]"
            />
          )}
      </div>
    </li>
  );
}
