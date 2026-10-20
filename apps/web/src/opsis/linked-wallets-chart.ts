import type { LinkedWalletGraph } from "@rh-chain/shared";
import { CHART_COLORS } from "../charts/theme";
import { shareText } from "./linked-wallets-model";

export function linkedBubbleOption(
  graph: LinkedWalletGraph,
  unknown = "Unknown",
) {
  return {
    animation: false,
    grid: { left: 16, right: 16, top: 16, bottom: 16 },
    xAxis: { show: false, min: -1, max: 10 },
    yAxis: { show: false, min: -1, max: 10 },
    tooltip: { trigger: "item", renderMode: "richText" },
    series: [
      {
        type: "scatter",
        data: graph.holders.map((holder, index) => {
          const group = graph.groups.findIndex((g) =>
            g.members.includes(holder.wallet),
          );
          const basis = holder.share
            ? Number(
                (BigInt(holder.share.numerator) * 10000n) /
                  BigInt(holder.share.denominator),
              ) / 10000
            : 0;
          return {
            name: `${holder.wallet} · ${shareText(holder.share, unknown)}`,
            value: [index % 10, 9 - Math.floor(index / 10)],
            symbolSize: Math.max(8, Math.min(46, 8 + Math.sqrt(basis) * 100)),
            itemStyle: {
              color: CHART_COLORS[Math.max(0, group) % CHART_COLORS.length],
            },
          };
        }),
      },
    ],
  };
}
