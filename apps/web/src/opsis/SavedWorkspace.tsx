import { Link, useLocation } from "react-router";
import Vault from "../pages/Vault";
import ReportShelf from "./ReportShelf";
import { useCopy } from "./copy";
import type { Capabilities } from "./model";
export default function SavedWorkspace({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const { search } = useLocation();
  const reports = new URLSearchParams(search).get("view") === "reports";
  return (
    <>
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
      {reports ? <ReportShelf capabilities={capabilities} /> : <Vault />}
    </>
  );
}
