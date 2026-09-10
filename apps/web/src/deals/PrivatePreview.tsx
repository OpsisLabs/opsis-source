import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { privateApi } from "../dashboard/http";
import { setDealPreviewToken } from "./preview-token";
import { useI18n } from "../i18n";
const Vault = lazy(() => import("../pages/Vault"));

export default function PrivatePreview() {
  const { t } = useI18n();
  const [key, setKey] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex, nofollow"; document.head.append(meta);
    return () => { pending.current?.abort(); setDealPreviewToken(""); meta.remove(); };
  }, []);
  useEffect(() => {
    if (expiresAt === null) return;
    const timeout = setTimeout(() => { setDealPreviewToken(""); setExpiresAt(null); setError(t("cloud.deals.preview.expired")); }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [expiresAt, t]);
  async function unlock() {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setDealPreviewToken(key); setKey("");
    try {
      const response = await privateApi<{ expiresAt: string }>("/v1/private/deals/access", {}, controller.signal);
      if (controller.signal.aborted) return;
      const expires = Date.parse(response.expiresAt);
      if (!Number.isFinite(expires) || expires <= Date.now() || expires - Date.now() > 3600_000) throw new Error(t("cloud.deals.preview.invalidWindow"));
      setExpiresAt(expires);
    } catch { if (!controller.signal.aborted) { setDealPreviewToken(""); setError(t("cloud.deals.preview.unavailable")); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  if (expiresAt !== null) return <><div className="m-5 border border-[#fa6c34] p-4 text-[#e9e0d1]"><p>{t("cloud.deals.preview.testBanner")}</p><button className="mt-2 min-h-11 text-[#fa6c34] underline" onClick={() => { setDealPreviewToken(""); setExpiresAt(null); }}>{t("cloud.deals.preview.close")}</button></div><Suspense fallback={<p>{t("cloud.deals.preview.loading")}</p>}><Vault previewDeals /></Suspense></>;
  return <main className="mx-auto max-w-xl space-y-4 p-8 text-[#e9e0d1]"><h1 className="text-3xl">{t("cloud.deals.preview.title")}</h1><p>{t("cloud.deals.preview.intro")}</p><form className="space-y-4" onSubmit={e => { e.preventDefault(); void unlock(); }}><label>{t("cloud.deals.preview.accessKey")}<input type="password" autoComplete="off" className="mt-2 block w-full border border-[#555] bg-[#242424] p-3" value={key} onChange={e => setKey(e.target.value)} /></label><button disabled={busy || !/^[a-f0-9]{64}$/.test(key)} className="min-h-11 bg-[#fa6c34] px-4 text-[#1d1d1d] disabled:opacity-50">{t("cloud.deals.preview.open")}</button></form>{error && <p role="alert">{error}</p>}</main>;
}
