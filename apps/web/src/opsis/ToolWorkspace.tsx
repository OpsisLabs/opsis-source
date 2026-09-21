import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { useCopy } from "./copy";
const pages: Record<string, [string, string, string, string, string]> = {
  "/watch": [
    "03 / WATCH",
    "Follow the changes.",
    "跟踪变化。",
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
    "Look behind the token.",
    "查看代币背后的证据。",
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
    "Move the assumptions.",
    "调整假设。",
    "Change the allocation or price shock and see how the hypothetical portfolio responds.",
    "调整资产分配或价格冲击，查看假设投资组合如何变化。",
  ],
  "/biggest-trades": [
    "RESEARCH / OBSERVED SWAPS",
    "See the activity in context.",
    "理解活动的背景。",
    "Compare observed swaps in a bounded sample, with exact transactions and source coverage.",
    "比较有限样本中的已观察兑换，查看确切交易及来源覆盖范围。",
  ],
  "/research/details": [
    "RESEARCH / DEEP DIVE",
    "Follow the public trail.",
    "追踪公开线索。",
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
      {page && (
        <header className="opsis-studio-heading">
          <div>
            <p className="opsis-kicker">{page[0]}</p>
            <h1>{c(page[1], page[2])}</h1>
          </div>
          <p>{c(page[3], page[4])}</p>
        </header>
      )}
      <div className="opsis-legacy opsis-engine-content">{children}</div>
    </section>
  );
}
