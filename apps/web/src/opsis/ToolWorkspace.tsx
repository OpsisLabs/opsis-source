import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useCopy } from "./copy";
const pages: Record<string, [string, string, string, string, string]> = {
  "/research/events": [
    "RESEARCH / EVENTS",
    "World & markets",
    "世界与市场",
    "Explore captured market observations beside dated reports and their sources.",
    "对照注明日期的报道及其来源，查看采集的市场观测数据。",
  ],
  "/verify": ["VERIFY / ON THIS DEVICE", "Check an Opsis receipt.", "核对 Opsis 凭据。", "Signature, key and inclusion proof are checked in your browser; the receipt never leaves it.", "签名、密钥与包含证明均在浏览器中核对；凭据不会离开浏览器。"],
  "/status": ["", "Data status", "数据状态", "Source capabilities and evidence coverage across Opsis tools.", "Opsis 工具的数据源功能与证据覆盖范围。"],
  "/community": ["", "Community", "社区", "Share feedback in a private draft and see what has shipped.", "在私密草稿中分享反馈，查看已发布的更新。"],
  "/privacy": ["", "Privacy", "隐私", "How information flows, what stays on your device and the choices you control.", "了解信息流向、保留在设备上的内容，以及由您控制的选择。"],
  "/terms": ["", "Terms", "条款", "How to use Opsis tools and data.", "如何使用 Opsis 工具与数据。"],
  "/watch": [
    "03 / WATCH",
    "What changed in this wallet?",
    "这个钱包有什么变化？",
    "Your wallets, your timeline. Compare saved checks in a private workspace.",
    "您的钱包、您的时间线。在私密工作区比较保存的核查。",
  ],
  "/saved": [
    "SAVED / ON THIS DEVICE",
    "Keep your own perspective.",
    "保留自己的视角。",
    "Your research, holdings and notes, encrypted together on this device.",
    "您的研究、持仓和笔记一起加密保存在此设备上。",
  ],
  "/rwa": [
    "RESEARCH / ASSET PROOF",
    "Stock-token check",
    "股票代币核查",
    "Inspect the identity, backing and redemption evidence behind a claim.",
    "检查声明背后的身份、支持资产和赎回证据。",
  ],
  "/swap": [
    "TRADE CHECK / SWAP PREVIEW",
    "See what the swap costs.",
    "了解兑换成本。",
    "Change the amount. Inspect the quote. Review the costs before leaving for the venue.",
    "调整数量，检查报价，在前往交易场所前审查成本。",
  ],
  "/simulate": [
    "TRADE CHECK / SCENARIOS",
    "Test the trade before the trade.",
    "交易前测试情景。",
    "Compare a hypothetical amount with the same public quote conditions.",
    "在相同公开报价条件下比较假设数量。",
  ],
  "/stress-test": [
    "TRADE CHECK / PORTFOLIO",
    "Portfolio shocks",
    "投资组合冲击",
    "Test a market move on a hypothetical portfolio. Local arithmetic, not a forecast.",
    "在假设投资组合上测试市场变动。本地算术，不是预测。",
  ],
  "/biggest-trades": [
    "RESEARCH / OBSERVED SWAPS",
    "Big trades",
    "大额交易",
    "Compare observed swaps in a bounded sample, with exact transactions and source coverage.",
    "比较有限样本中的已观察兑换，查看确切交易及来源覆盖范围。",
  ],
  "/research/details": [
    "RESEARCH / DEEP DIVE",
    "Detailed research",
    "详细研究",
    "Inspect an exact public identity, ask a question and follow its sources.",
    "检查确切的公开标识，提出问题并追溯来源。",
  ],
};
export default function ToolWorkspace({ children }: { children: ReactNode }) {
  const { pathname } = useLocation(),
    c = useCopy(),
    page = pages[pathname];
  return (
    <section
      className={`opsis-tool-workspace ${page ? "opsis-tool-workspace-native" : ""}`}
      data-tool={pathname.slice(1)}
    >
      {page &&
        !["/research/events", "/research/details", "/rwa"].includes(pathname) && (
        <header className="opsis-studio-heading">
          <div>
            <h1>{c(page[1], page[2])}</h1>
          </div>
          <p>{c(page[3], page[4])}</p>
        </header>
      )}
      <div className="opsis-legacy opsis-engine-content">{children}</div>
    </section>
  );
}
