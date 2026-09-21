import { useEffect, useRef } from "react";
import { useCopy } from "./copy";

export default function Lab({ theme }: { theme: "dark" | "light" }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const applyTheme = () => {
    const root = frame.current?.contentDocument?.documentElement;
    if (root) root.dataset.theme = theme;
  };
  useEffect(() => {
    const root = frame.current?.contentDocument?.documentElement;
    if (root) root.dataset.theme = theme;
  }, [theme]);
  const c = useCopy();
  return (
    <section className="opsis-lab">
      <header className="opsis-heading">
        <p className="opsis-kicker">04 / {c("QUANT LAB", "量化实验室")}</p>
        <h1>{c("Change your perspective.", "换个角度看市场。")}</h1>
        <p>
          {c(
            "Rotate the pool map. Compare tokens. Shape a portfolio scenario.",
            "旋转资金池地图，比较代币，调整投资组合情景。",
          )}
        </p>
      </header>
      <div className="opsis-lab-caption">
        <span className="opsis-kicker">
          {c("CAPTURED · 10 SEP 2026", "已采集 · 2026 年 9 月 10 日")}
        </span>
        <p>
          {c(
            "Dated observations and user-set scenarios. No live prices, probabilities or Monte Carlo forecasts.",
            "历史观察与用户设定的情景。不是实时价格、概率或蒙特卡洛预测。",
          )}
        </p>
        <a href="/quant/" target="_blank" rel="noreferrer">
          {c("Open the frozen Quant Lab ↗", "打开冻结版量化实验室 ↗")}
        </a>
      </div>
      <iframe
        ref={frame}
        onLoad={applyTheme}
        className="opsis-lab-frame"
        title="Opsis interactive Quant Lab"
        src="/opsis-lab/index.html"
      />
      <details className="opsis-lab-methods">
        <summary>
          {c(
            "What these views can—and cannot—show",
            "这些视图能显示什么、不能显示什么",
          )}
        </summary>
        <p>
          {c(
            "The pool map shows captured liquidity, volume and price change. The portfolio surface evaluates two user-selected shocks under explicit fixed assumptions. It does not estimate the probability of those shocks. Historical simulation and Monte Carlo methods need validated time series before they can be added.",
            "资金池地图显示采集时的流动性、交易量和价格变化。投资组合曲面基于明确固定假设评估两种用户设定的冲击，不估计冲击概率。历史模拟和蒙特卡洛方法需先获得已验证的时间序列。",
          )}
        </p>
      </details>
    </section>
  );
}
