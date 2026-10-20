import { Link, useLocation } from "react-router";
import Vault from "../pages/Vault";
import ReportShelf from "./ReportShelf";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
import "../watch/watch.css";
import "./saved-workspace.css";
export default function SavedWorkspace({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const { search } = useLocation();
  const reports = new URLSearchParams(search).get("view") === "reports";
  return (
    <div className="saved-workspace">
      <nav
        className="opsis-saved-tabs"
        aria-label={c("Saved content", "已保存内容")}
      >
        <Link
          to="/saved?view=portfolio"
          aria-current={!reports ? "page" : undefined}
        >
          {c("Holdings & notes", "持仓与笔记")}
        </Link>
        <Link
          to="/saved?view=reports"
          aria-current={reports ? "page" : undefined}
        >
          {c("Research & trade checks", "研究与交易核查")}
        </Link>
      </nav>
      {reports ? (
        <ReportShelf capabilities={capabilities} />
      ) : (
        <div className="saved-vault-panel">
          <Vault />
        </div>
      )}
      <p className="saved-privacy watch-small">
        {c(
          "Nothing is uploaded. Saved items stay encrypted on this device.",
          "不上传任何内容。已保存项目在此设备上保持加密。",
        )}
      </p>
    </div>
  );
}
