import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { copyText } from "./clipboard";

export function CopyControl({ value, label, className, icon, ariaLabel }: {
  value: string;
  label: string;
  className: string;
  icon?: ReactNode;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return <div className="min-w-0 max-w-full" data-testid="copy-control">
    <button type="button" className={className} aria-label={ariaLabel} onClick={async () => {
      setStatus(await copyText(value) ? "copied" : "failed");
    }}>
      {icon}{status === "copied" ? t("cloud.chat.copied") : label}
    </button>
    <span role="status" className="block font-mono-d text-[10px] text-[#9a938a]">
      {status === "copied" ? t("cloud.chat.copied") : status === "failed" ? t("cloud.chat.copyUnavailable") : ""}
    </span>
    {status === "failed" && <textarea
      readOnly
      aria-label={t("cloud.chat.selectCopyText")}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      className="mt-2 block w-full min-w-0 border border-[#383838] bg-[#1d1d1d] p-2 font-mono-d text-[12px] text-[#e9e0d1]"
    />}
  </div>;
}
