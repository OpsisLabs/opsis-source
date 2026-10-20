import { useCopy } from "./copy";

export type ExplorerKind = "address" | "tx" | "token";

export function ExplorerLink({ kind, value }: { kind: ExplorerKind; value: string }) {
  const c = useCopy();
  if (!["address", "tx", "token"].includes(kind) || typeof value !== "string"
    || value.length !== (kind === "tx" ? 66 : 42) || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  const short = `${value.slice(0, 6)}…${value.slice(-4)}`;
  return <a
    className="opsis-explorer-link ml-1 inline-flex size-6 shrink-0 items-center justify-center align-middle hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    href={`https://robinhoodchain.blockscout.com/${kind}/${value}`}
    target="_blank"
    rel="noopener noreferrer"
    referrerPolicy="no-referrer"
    title={c("View on Blockscout ↗", "在 Blockscout 查看 ↗")}
    aria-label={c(`View ${short} on Blockscout`, `在 Blockscout 查看 ${short}`)}
  ><span aria-hidden="true">↗</span></a>;
}
