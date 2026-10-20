import { useEffect, useRef, useState } from "react";
import type { ReceiptChecks } from "@rh-chain/shared";
import { useI18n } from "../i18n";
import type { Capabilities } from "./model";
import { verifyBrowserReceipt } from "./receipt-verification";
import "./receipts.css";
export default function ReceiptVerify({ capabilities }: { capabilities: Pick<Capabilities, "receipts"> }) {
  // The route renders the shell's unavailable state; this guard keeps a direct render inert too.
  return capabilities.receipts === true ? <EnabledVerify /> : null;
}
function EnabledVerify() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ReceiptChecks | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const revision = useRef(0);
  useEffect(() => () => { pending.current?.abort(); revision.current++; }, []);
  const clear = () => { pending.current?.abort(); revision.current++; setResult(null); setError(false); setBusy(false); };
  const change = (value: string) => { clear(); setText(value); };
  const file = async (value?: File) => {
    clear(); const at = revision.current;
    if (!value) return;
    if (value.size > 2_000_000) { setText(""); setError(true); return; }
    try { const content = await value.text(); if (at === revision.current) setText(content); }
    catch { if (at === revision.current) setError(true); }
  };
  const verify = async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    const at = ++revision.current;
    setBusy(true); setError(false); setResult(null);
    try { const checked = await verifyBrowserReceipt(text, true, controller.signal); if (at === revision.current) setResult(checked); }
    catch { if (at === revision.current) setError(true); }
    finally { if (at === revision.current) setBusy(false); }
  };
  const receipt = result?.receipt;
  return <section className="opsis-panel opsis-receipts">
    <h2>{t("receipts.title")}</h2>
    <p>{t("receipts.meaning")}</p><p className="opsis-small">{t("receipts.privacy")}</p>
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void file(event.dataTransfer.files[0]); }}>
      <label htmlFor="receipt-json">{t("receipts.input")}</label>
      <textarea id="receipt-json" rows={12} value={text} onChange={(event) => change(event.target.value)} spellCheck={false} />
      <label htmlFor="receipt-file">{t("receipts.file")}</label>
      <input id="receipt-file" type="file" accept=".json,application/json" onChange={(event) => { void file(event.target.files?.[0]); event.target.value = ""; }} />
    </div>
    <button className="opsis-action" type="button" disabled={busy || !text} onClick={() => void verify()}>{t(busy ? "receipts.checking" : "receipts.verify")}</button>
    <div aria-live="polite">
      {error && <p role="alert">{t("receipts.error")}</p>}
      {result && <>
        <h2>{t(result.valid ? "receipts.passed" : "receipts.failed")}</h2>
        <dl>{([ ["schema", result.schema], ["canonical", result.canonical], ["signature", result.signature], ["keyValidity", result.keyValidity], ["merkle", result.merkle] ] as const).map(([key, value]) => <div key={key}><dt>{t(`receipts.${key}`)}</dt><dd>{t(value === null ? "receipts.absent" : value ? "receipts.pass" : "receipts.fail")}</dd></div>)}
          <div><dt>{t("receipts.timestamp")}</dt><dd>{t(result.timestamp === "absent" ? "receipts.absent" : result.timestamp === "pending" ? "receipts.pending" : "receipts.attested")}</dd></div>
        </dl>
        {receipt && <>
          <h3>{t("receipts.tool")}</h3><p>{receipt.tool}</p>
          <h3>{t("receipts.block")}</h3><p>{receipt.chainId} · {receipt.block.number} · {receipt.block.timestamp}</p><code>{receipt.block.hash}</code>
          <h3>{t("receipts.sources")}</h3><ul>{receipt.sources.map((source) => <li key={source.id}>{source.provider} · {source.fetchedAt}<br /><code>{source.url}</code></li>)}</ul>
        </>}
      </>}
    </div>
  </section>;
}
