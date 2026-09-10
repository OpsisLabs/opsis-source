import { useId, useRef, useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import configuration from "./official-token.json";
import { resolveOfficialToken } from "./official-token-config";

const token = resolveOfficialToken(configuration);

export default function OfficialContract() {
  const titleId = useId();
  const helpId = useId();
  const fallback = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "manual">("idle");

  const copy = async () => {
    if (token.status !== "published" || copyState === "copying") return;
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(token.address);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
      requestAnimationFrame(() => { fallback.current?.focus(); fallback.current?.select(); });
    }
  };

  return (
    <section aria-labelledby={titleId} data-official-contract className="min-w-0 border-y border-[#654333] bg-[#24211f] px-5 py-4 text-[#f4ece4] sm:px-8">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 xl:flex-row xl:items-center xl:gap-8">
        <div className="flex shrink-0 items-start gap-3">
          <ShieldAlert size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-[#ff996f]" />
          <div>
            <h2 id={titleId} className="text-[16px] font-semibold leading-snug">Official ChainScout contract</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[#c2b7ae]">Check here. Don’t trust a ticker alone.</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {token.status === "published" ? <>
            <p className="mb-2 text-[14px] font-medium text-[#ffb08a]">{token.network} · Chain ID {token.chainId}</p>
            <button type="button" onClick={() => void copy()} disabled={copyState === "copying"} aria-label="Copy official ChainScout contract address" aria-describedby={helpId} className="flex min-h-[48px] w-full items-center gap-3 rounded-sm border border-[#fa6c34] bg-[#fa6c34] px-3 py-3 text-left text-[#1d1d1d] transition-colors hover:bg-[#ff8552] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffd0bc] disabled:opacity-70">
              <code dir="ltr" className="min-w-0 flex-1 select-text break-all font-mono text-[14px] leading-relaxed sm:text-[16px]">{token.address}</code>
              <span className="flex shrink-0 items-center gap-1.5 text-[14px] font-semibold">{copyState === "copied" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}<span>{copyState === "copied" ? "Copied" : copyState === "copying" ? "Copying…" : "Copy"}</span></span>
            </button>
            <p id={helpId} className="mt-2 text-[14px] leading-relaxed text-[#c2b7ae]">Match the full address and network. You never need to connect a wallet to copy it.</p>
            <p role="status" aria-live="polite" className="sr-only">{copyState === "copied" ? "Official contract address copied to clipboard." : copyState === "manual" ? "Automatic copy was blocked. Select and copy the full address below." : ""}</p>
            {copyState === "manual" && <div className="mt-3">
              <label htmlFor={`${titleId}-manual`} className="mb-2 block text-[14px] leading-relaxed text-[#f4ece4]">Clipboard blocked. Select and copy this full address:</label>
              <textarea id={`${titleId}-manual`} ref={fallback} value={token.address} readOnly rows={2} spellCheck={false} autoCapitalize="off" dir="ltr" onFocus={(event) => event.currentTarget.select()} className="min-h-[72px] w-full resize-none rounded-sm border border-[#887366] bg-[#1d1d1d] p-3 font-mono text-[16px] text-[#f4ece4] outline-none focus:border-[#ff996f]" />
            </div>}
          </> : <>
            <p className="text-[16px] font-semibold leading-relaxed text-[#ffb08a]">{token.status === "not-launched" ? "Not launched yet — no official CA." : "Official contract address unavailable."}</p>
            <p className="mt-1 max-w-[850px] text-[14px] leading-relaxed text-[#d0c5bc]">{token.status === "not-launched" ? "The ChainScout token has not launched. No official contract address has been announced. Ignore tokens claiming to be ChainScout until the address is published here." : "Don’t rely on addresses from DMs, replies or search results. Wait until the official address and network are available here."}</p>
          </>}
        </div>
      </div>
    </section>
  );
}
