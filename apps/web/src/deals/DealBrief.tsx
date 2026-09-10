import { useState } from "react";
import { shoppingLinks, type ShoppingBrief } from "./model";
const empty: ShoppingBrief = { name: "", set: "", number: "", printing: "", condition: "", grader: "", grade: "" };
export function DealBrief() {
  const [brief, setBrief] = useState(empty);
  let links: ReturnType<typeof shoppingLinks> | null = null;
  try { links = shoppingLinks(brief); } catch { /* Incomplete brief has no links. */ }
  return <section aria-label="Collectible shopping brief" className="space-y-4 border border-[#555] bg-[#242424] p-5 text-[#e9e0d1]">
    <h2 className="text-2xl">Find the exact card—not a similar listing.</h2>
    <p>Start with a precise search, inspect the listing yourself, then save comparable offers below. Search results are not verified matches. No live marketplace or sold-price feed is connected by default.</p>
    <div className="grid gap-3 sm:grid-cols-2">{Object.keys(empty).map(key => <label key={key} className="capitalize">{key === "number" ? "Collector number" : key}<input className="mt-2 block w-full border border-[#555] bg-[#1d1d1d] p-3" maxLength={80} value={brief[key as keyof ShoppingBrief]} onChange={event => setBrief({ ...brief, [key]: event.target.value })} /></label>)}</div>
    <p className="text-sm">These fields stay here until you click a search link. Clicking sends the search terms to eBay. Never enter certificate numbers or private ownership notes in this brief.</p>
    {links ? <div className="flex flex-wrap gap-4"><a className="min-h-[44px] text-[#fa6c34] underline" href={links.listings} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Search asking-price listings on eBay</a><a className="min-h-[44px] text-[#fa6c34] underline" href={links.completed} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Inspect sold listings on eBay</a></div> : <p role="status">Enter name, set and collector number to build the search.</p>}
    <p>Asking prices are not sold prices or appraisals. For each offer below, match printing, condition, grader and grade exactly in CONDITION / VARIANT. Enter shipping, taxes and other costs explicitly; unknown costs must remain unknown. Different currencies are not ranked together.</p>
  </section>;
}
