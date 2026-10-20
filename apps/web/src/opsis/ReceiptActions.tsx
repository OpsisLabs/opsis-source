import { validateReceipt, type Receipt } from "@rh-chain/shared";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { ReceiptDownload } from "./ReceiptDownload";

export function ReceiptActions({ receipt }: { receipt: unknown }) {
  const { t } = useI18n();
  let validated: Receipt;
  try {
    validated = validateReceipt(receipt);
  } catch {
    return null;
  }
  return (
    <div className="opsis-receipt-actions">
      <p className="opsis-small">{t("receipts.computation")}</p>
      <ReceiptDownload receipt={validated} />{" "}
      <Link to="/verify">{t("receipts.verifyLink")}</Link>
    </div>
  );
}
