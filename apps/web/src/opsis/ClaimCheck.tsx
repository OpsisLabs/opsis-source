import { useEffect, useRef, useState } from "react";
import {
  claimTypes,
  extractClaims,
  launchpads,
  type Claim,
  type ClaimCandidate,
  type ClaimObservation,
  type ClaimResponse,
  type ClaimType,
} from "@rh-chain/shared";
import { useI18n } from "../i18n";
import { lookup } from "../i18n/translate";
import type { Capabilities } from "./model";
import { addressConfirmed, initialClaim, requestClaims } from "./claims-model";
import { ReceiptActions } from "./ReceiptActions";
import { ExplorerLink } from "./ExplorerLink";
import "./utility-workspace.css";
import "./claims.css";
export default function ClaimCheck({
  capabilities,
  previewKey = "",
}: {
  capabilities: Pick<Capabilities, "claimCheck" | "receipts">;
  previewKey?: string;
}) {
  return capabilities.claimCheck === true ? (
    <EnabledClaims previewKey={previewKey} receipts={capabilities.receipts === true} />
  ) : null;
}
function EnabledClaims({ previewKey, receipts }: { previewKey: string; receipts: boolean }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<
    Array<{
      claim: Claim;
      matchedText?: string;
      foundBy?: ClaimCandidate["foundBy"];
    }>
  >([]);
  const [type, setType] = useState<ClaimType>("ownership");
  const [address, setAddress] = useState(""),
    [confirmedAddress, setConfirmedAddress] = useState("");
  const [postTime, setPostTime] = useState("");
  const [result, setResult] = useState<ClaimResponse | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const change = () => {
    setResult(null);
    setError(false);
  };
  const update = (index: number, claim: Claim) => {
    change();
    setCandidates((rows) =>
      rows.map((r, i) => (i === index ? { ...r, claim } : r)),
    );
  };
  const run = async () => {
    if (!addressConfirmed(address, confirmedAddress)) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    change();
    try {
      setResult(
        await requestClaims(
          {
            address,
            confirmedAddress,
            claims: candidates.map((r) => r.claim),
            ...(postTime ? { postTime: new Date(postTime).toISOString() } : {}),
          },
          true,
          previewKey,
          controller.signal,
        ),
      );
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="utility-ws claim-ws">
      <header className="utility-ws-panel">
        <h1>{t("claims.title")}</h1>
        <p>{t("claims.intro")}</p>
        <p>{t("claims.privacy")}</p>
      </header>
      <fieldset disabled={busy}>
        <section className="utility-ws-panel">
          <label htmlFor="claim-post">{t("claims.paste")}</label>
          <textarea
            id="claim-post"
            value={text}
            maxLength={20000}
            onChange={(e) => {
              setText(e.target.value);
              change();
            }}
          />
          <button
            type="button"
            onClick={() => {
              change();
              setCandidates(extractClaims(text));
            }}
          >
            {t("claims.find")}
          </button>
          <label htmlFor="claim-type">{t("claims.type")}</label>
          <select
            id="claim-type"
            value={type}
            onChange={(e) => setType(e.target.value as ClaimType)}
          >
            {claimTypes.map((k) => (
              <option key={k} value={k}>
                {t(`claims.${k}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={candidates.length >= 32}
            onClick={() => {
              change();
              setCandidates((rows) => [...rows, { claim: initialClaim(type) }]);
            }}
          >
            {t("claims.add")}
          </button>
          <ol>
            {candidates.map((candidate, i) => {
              const c = candidate.claim;
              return (
                <li key={i}>
                  <h2>{t(`claims.${c.type}`)}</h2>
                  <p>
                    {t(
                      candidate.foundBy === "pattern"
                        ? "claims.pattern"
                        : "claims.manual",
                    )}
                    {candidate.matchedText && (
                      <>
                        : <q>{candidate.matchedText}</q>
                      </>
                    )}
                  </p>
                  <p>{t(`claims.definition.${c.type}`)}</p>
                  {"expected" in c && (
                    <label>
                      {t("claims.expected")}
                      <select
                        value={String(c.expected)}
                        onChange={(e) =>
                          update(i, {
                            ...c,
                            expected: e.target.value === "true",
                          })
                        }
                      >
                        <option value="true">{t("claims.yes")}</option>
                        <option value="false">{t("claims.no")}</option>
                      </select>
                    </label>
                  )}
                  {"comparison" in c && (
                    <>
                      <label>
                        {t("claims.comparison")}
                        <select
                          value={c.comparison}
                          onChange={(e) =>
                            update(i, {
                              ...c,
                              comparison: e.target.value as typeof c.comparison,
                            })
                          }
                        >
                          {(["under", "over", "equal"] as const).map((k) => (
                            <option key={k} value={k}>
                              {t(`claims.${k}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("claims.percent")}
                        <input
                          inputMode="decimal"
                          value={c.percent}
                          onChange={(e) =>
                            update(i, { ...c, percent: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  {c.type === "launchpad" && (
                    <label>
                      {t("claims.launchpad")}
                      <select
                        value={c.launchpad}
                        onChange={(e) =>
                          update(i, {
                            ...c,
                            launchpad: e.target.value as typeof c.launchpad,
                          })
                        }
                      >
                        {launchpads.map((k) => (
                          <option key={k} value={k}>
                            {k === "launcher" ? t("claims.launcher") : k}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {c.type === "tax" &&
                    (["buy", "sell"] as const).map((k) => (
                      <label key={k}>
                        {t(`claims.${k}`)}
                        <input
                          inputMode="decimal"
                          value={c[k] ?? ""}
                          onChange={(e) =>
                            update(i, { ...c, [k]: e.target.value || null })
                          }
                        />
                      </label>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      change();
                      setCandidates((rows) => rows.filter((_, n) => n !== i));
                    }}
                  >
                    {t("claims.remove")}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="utility-ws-panel">
          <p>{t("claims.reminder")}</p>
          <label htmlFor="claim-address">{t("claims.address")}</label>
          <input
            id="claim-address"
            value={address}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              change();
              setAddress(e.target.value.trim());
              setConfirmedAddress("");
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={addressConfirmed(address, confirmedAddress)}
              disabled={
                !/^0x[\da-f]{40}$/i.test(address) || /^0x0{40}$/i.test(address)
              }
              onChange={(e) => {
                change();
                setConfirmedAddress(e.target.checked ? address : "");
              }}
            />
            {t("claims.confirm")}
          </label>
          {addressConfirmed(address, confirmedAddress) && (
            <p>
              {t("claims.confirmed")}: <code>{confirmedAddress}</code>
            </p>
          )}
          <label htmlFor="claim-time">{t("claims.time")}</label>
          <input
            id="claim-time"
            type="datetime-local"
            value={postTime}
            onChange={(e) => {
              change();
              setPostTime(e.target.value);
            }}
          />
          <button
            type="button"
            disabled={
              !addressConfirmed(address, confirmedAddress) || !candidates.length
            }
            onClick={() => void run()}
          >
            {t(busy ? "claims.busy" : "claims.run")}
          </button>
        </section>
      </fieldset>
      <div aria-live="polite">
        {busy && <p>{t("claims.busy")}</p>}
        {error && <p role="alert">{t("claims.error")}</p>}
        {result && <ClaimResults result={result} receipts={receipts} />}
      </div>
    </div>
  );
}

export function ClaimResults({ result, receipts = false }: { result: ClaimResponse; receipts?: boolean }) {
  const { t, locale } = useI18n();
  const detail = (value: string) => {
    const key = `claims.detail.${value}`;
    return lookup(locale, key) ?? value;
  };
  const observation = (o: ClaimObservation, historical: boolean) => (
    <section className="utility-ws-panel claim-results">
      <h2>{t(historical ? "claims.post" : "claims.current")}</h2>
      {o.block ? (
        <p>
          <strong>{o.block.number}</strong> · <time>{o.block.timestamp}</time>
          <br />
          <code>{o.block.hash}</code>
        </p>
      ) : (
        <p>{t("claims.unknownBlock")}</p>
      )}
      {o.results.map((r, i) => (
        <article key={i}>
          <h3>
            {locale === "en"
              ? r.wording
              : `区块 ${o.block?.number ?? "—"} 的链上数据：${t(`claims.${r.status}`)}`}
          </h3>
          <p>
            {t(`claims.${r.claim.type}`)}
            {"comparison" in r.claim && (
              <>
                {" "}
                · {t(`claims.${r.claim.comparison}`)} {r.claim.percent}%
              </>
            )}
            {"expected" in r.claim && (
              <> · {t(r.claim.expected ? "claims.yes" : "claims.no")}</>
            )}
            {r.claim.type === "launchpad" && (
              <>
                {" "}
                ·{" "}
                {r.claim.launchpad === "launcher"
                  ? t("claims.launcher")
                  : r.claim.launchpad}
              </>
            )}
          </p>
          <p>
            <strong>{t("claims.definition")}: </strong>
            {t(`claims.definition.${r.claim.type}`)}
          </p>
          {r.reason && (
            <p>
              {t("claims.reason")}: {detail(r.reason)}
            </p>
          )}
          <ClaimEvidence evidence={r.evidence} />
        </article>
      ))}
    </section>
  );
  return (
    <>
      {observation(result.current, false)}
      {result.post && observation(result.post, true)}
      {receipts && <ReceiptActions receipt={result.receipt} />}
    </>
  );
}

export function ClaimEvidence({ evidence }: { evidence: Record<string, string> }) {
  const { t, locale } = useI18n();
  return <dl aria-label={t("claims.evidence")}>
    {Object.entries(evidence).map(([key, value]) => <div key={key}>
      <dt>{lookup(locale, `claims.evidenceKey.${key}`) ?? key}</dt>
      <dd>{(key === "recipients" ? value.split(", ") : [value]).map((part, index) => <span key={index}>
        {index > 0 && ", "}{lookup(locale, `claims.detail.${part}`) ?? part}<ExplorerLink kind={key === "transactionHash" ? "tx" : key === "token" || key === "tokenAddress" ? "token" : "address"} value={part} />
      </span>)}</dd>
    </div>)}
  </dl>;
}
