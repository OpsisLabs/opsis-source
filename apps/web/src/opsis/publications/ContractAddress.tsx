import { useId, useState } from "react";
import { Copy } from "lucide-react";
import { useCopy } from "../copy";
import {
  copyableContract,
  copyContract,
  publicContract,
} from "./public-contract";

export default function ContractAddress({
  compact = false,
}: {
  /** One-line pill for the landing hero and the workspace top bar. */
  compact?: boolean;
}) {
  const c = useCopy();
  const id = useId();
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const [busy, setBusy] = useState(false);
  const configured = copyableContract(publicContract);
  const copy = async () => {
    setBusy(true);
    setResult(
      (await copyContract(publicContract, navigator.clipboard))
        ? "copied"
        : "failed",
    );
    setBusy(false);
  };
  if (compact)
    return (
      <section
        className="opsis-ca opsis-ca-compact"
        aria-label={c("Contract address", "合约地址")}
      >
        <link rel="stylesheet" href="/opsis-site/contract-address.css" />
        <label htmlFor={id} className="opsis-ca-tag">
          CA
        </label>
        <input
          id={id}
          readOnly
          spellCheck={false}
          value={configured ? publicContract.address : ""}
          placeholder={c("Not launched yet", "尚未发布")}
          title={
            configured
              ? `${publicContract.address} · ${publicContract.chain}`
              : undefined
          }
          aria-describedby={`${id}-status`}
        />
        <button
          type="button"
          disabled={!configured || busy}
          aria-label={c("Copy contract address", "复制合约地址")}
          onClick={copy}
        >
          <Copy size={14} aria-hidden="true" />
          {result === "copied" ? c("Copied", "已复制") : c("Copy", "复制")}
        </button>
        <span id={`${id}-status`} aria-live="polite" className="opsis-ca-sr">
          {!configured
            ? c("No contract address published yet", "尚未公布合约地址")
            : result === "copied"
              ? c("Address copied.", "地址已复制。")
              : result === "failed"
                ? c(
                    "Copy unavailable. Select the address and copy it manually.",
                    "无法复制。请选中地址并手动复制。",
                  )
                : publicContract.chain}
        </span>
      </section>
    );
  return (
    <section
      className="opsis-ca"
      aria-label={c("Contract address", "合约地址")}
    >
      <link rel="stylesheet" href="/opsis-site/contract-address.css" />
      <label htmlFor={id}>{c("CA · Contract address", "CA · 合约地址")}</label>
      <div className="opsis-ca-control">
        <input
          id={id}
          readOnly
          spellCheck={false}
          value={configured ? publicContract.address : ""}
          placeholder="—"
          aria-describedby={`${id}-status`}
        />
        <button
          type="button"
          disabled={!configured || busy}
          onClick={copy}
        >
          <Copy size={14} aria-hidden="true" />
          {busy ? c("Copying…", "正在复制…") : c("Copy CA", "复制地址")}
        </button>
      </div>
      <p className="opsis-ca-chain">
        {c("Chain", "网络")}{" "}
        <span>
          {configured ? publicContract.chain : c("Not published", "尚未公布")}
        </span>
      </p>
      <p id={`${id}-status`} role="status" aria-live="polite">
        {!configured
          ? c("No contract address published yet", "尚未公布合约地址")
          : result === "copied"
            ? c("Address copied.", "地址已复制。")
            : result === "failed"
              ? c(
                  "Copy unavailable. Select the address and copy it manually.",
                  "无法复制。请选中地址并手动复制。",
                )
              : c(
                  "Check the address and chain together.",
                  "请同时核对地址与网络。",
                )}
      </p>
    </section>
  );
}
