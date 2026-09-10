import { useEffect, useRef, useState } from "react";
import type { ScoutSwapQuote } from "../swap/api";
import { renderTradeCard, tradeCard } from "./trade-card";

export function TradeCard({ quote, weth, usdg, reference, deadline }: { quote: ScoutSwapQuote; weth: string; usdg: string; reference: string; deadline: number }) {
  const [includeBalances, setIncludeBalances] = useState(false);
  const [image, setImage] = useState<{ url: string; preview: string; file: File } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const imageUrl = useRef<string | null>(null);
  const clearImage = () => { generation.current++; if (imageUrl.current) URL.revokeObjectURL(imageUrl.current); imageUrl.current = null; setImage(null); setBusy(false); setError(""); };
  useEffect(() => () => { generation.current++; if (imageUrl.current) URL.revokeObjectURL(imageUrl.current); }, []);
  const create = async () => {
    clearImage();
    const current = generation.current;
    setBusy(true);
    try {
      if (performance.now() >= deadline) throw new Error("Quote expired. Request a fresh preview.");
      const card = tradeCard(quote, weth, usdg, reference, includeBalances);
      const blob = await renderTradeCard(card);
      // The deployed image policy allows local data images, not blob images.
      // Keep the revocable blob URL for downloads; neither representation leaves the browser.
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image preview failed. Please try again."));
        reader.onerror = () => reject(new Error("Image preview failed. Please try again."));
        reader.readAsDataURL(blob);
      });
      if (generation.current !== current) return;
      if (performance.now() >= deadline || Date.now() >= Date.parse(quote.expiresAt)) throw new Error("Quote expired. Request a fresh preview.");
      const url = URL.createObjectURL(blob);
      imageUrl.current = url;
      setImage({ url, preview, file: new File([blob], "chainscout-trade-card.png", { type: "image/png" }) });
    } catch (failure) { if (generation.current === current) setError(failure instanceof Error ? failure.message : "Image export unavailable."); }
    finally { if (generation.current === current) setBusy(false); }
  };
  const share = async () => {
    if (!image) return;
    try { await navigator.share({ files: [image.file], title: "ChainScout Trade Card" }); }
    catch (failure) { if (!(failure instanceof DOMException && failure.name === "AbortError")) setError("Sharing is unavailable. Use Download PNG instead."); }
  };
  return <section aria-label="Trade Card" className="space-y-5 border border-[#555] bg-[#242424] p-5 sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-sm uppercase tracking-widest text-[#fa6c34]">Your what-if</p><span className="text-sm text-[#b5ada2]">Robinhood Chain · No trade executed</span></div>
    <h2 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{quote.input.amount} {quote.input.symbol} <span className="text-[#fa6c34]">→</span></h2>
    <div className="grid gap-5 sm:grid-cols-2">
      <div><p className="text-sm text-[#b5ada2]">Expected output</p><p className="mt-2 break-all text-3xl font-semibold">{quote.output.amount} <span className="text-lg">{quote.output.symbol}</span></p></div>
      <div><p className="text-sm text-[#b5ada2]">Minimum output at quoted tolerance</p><p className="mt-2 break-all text-2xl text-[#fa6c34]">{quote.output.minimumReceived} <span className="text-lg">{quote.output.symbol}</span></p></div>
    </div>
    {quote.simulation.status === "warning" && <p role="status" className="text-sm text-[#fa6c34]">Provider check returned a warning. Review the quote details below.</p>}
    <div className="border-t border-[#555] pt-5">
      <h3 className="text-xl">Make it a Trade Card.</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#b5ada2]">Preview and download an image to share. It includes the trade amount, quote outputs and timestamp. Wallet addresses, Vault data and entered balances are excluded by default. Nothing is uploaded or posted.</p>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#fa6c34]" checked={includeBalances} onChange={event => { clearImage(); setIncludeBalances(event.target.checked); }} />Include my entered balances in the image</label>
      <button onClick={() => void create()} disabled={busy} className="mt-3 min-h-12 bg-[#fa6c34] px-5 py-3 font-semibold text-[#1d1d1d] disabled:opacity-50">{busy ? "Creating card…" : "Create share card"}</button>
      {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
      {image && <div className="mt-5 space-y-4">
        <p role="status" className="text-sm">Card ready. Review it before sharing. Downloads are unencrypted images outside your Vault.</p>
        <img src={image.preview} alt="Your Trade Card preview, including the selected quote and disclosure fields" width={1200} height={1200} className="w-full max-w-xl border border-[#555]" />
        <div className="flex flex-wrap gap-3"><a href={image.url} download="chainscout-trade-card.png" className="inline-flex min-h-12 items-center border border-[#fa6c34] px-5 py-3 text-[#fa6c34]">Download PNG</a>
          {typeof navigator.canShare === "function" && navigator.canShare({ files: [image.file] }) && <button onClick={() => void share()} className="min-h-12 border border-[#fa6c34] px-5 py-3 text-[#fa6c34]">Share image</button>}
        </div>
      </div>}
    </div>
  </section>;
}
