import { canonicalize, validateReceipt, type Receipt } from "@rh-chain/shared";
import { useI18n } from "../i18n";
export function ReceiptDownload({ receipt }: { receipt: Receipt }) {
  const { t } = useI18n();
  const download = () => {
    const url = URL.createObjectURL(new Blob([canonicalize(validateReceipt(receipt))], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "opsis-receipt.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <button className="opsis-action" type="button" onClick={download}>{t("receipts.download")}</button>;
}
