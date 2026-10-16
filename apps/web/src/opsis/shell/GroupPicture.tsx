import { useCopy } from "../copy";
import type { ToolGroup } from "../shell-model";

export default function GroupPicture({ group }: { group: ToolGroup["id"] }) {
  const c = useCopy();
  return (
    <svg
      className="opsis-group-picture"
      viewBox="0 0 240 140"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {group === "lookup" &&
        [155, 124, 111, 86, 64].map((width, index) => (
          <g key={index}>
            <path
              d={`M30 ${25 + index * 21}h180`}
              stroke="currentColor"
              strokeWidth="10"
              opacity=".12"
            />
            <path
              d={`M30 ${25 + index * 21}h${width}`}
              stroke="currentColor"
              strokeWidth="10"
            />
          </g>
        ))}
      {group === "trade" && (
        <>
          <path
            d="M12 38h83v50H12zM145 38h83v50h-83zM105 64h30m-7-7 7 7-7 7"
            stroke="currentColor"
          />
          <text x="53" y="26" textAnchor="middle">
            {c("IN", "输入")}
          </text>
          <text x="186" y="26" textAnchor="middle">
            {c("OUT", "输出")}
          </text>
          <text x="53" y="68" textAnchor="middle">
            {c("Size", "数量")}
          </text>
          <text x="186" y="68" textAnchor="middle">
            {c("Output", "输出量")}
          </text>
          <text x="120" y="116" textAnchor="middle">
            {c("Estimate", "估算")}
          </text>
        </>
      )}
      {group === "watch" && (
        <>
          <path d="M20 59h200" stroke="currentColor" />
          {[20, 120, 220].map((x, index) => (
            <g key={x}>
              <circle cx={x} cy="59" r="5" fill="currentColor" />
              <text x={x} y="89" textAnchor="middle">
                {c("Check", "核查")} {index + 1}
              </text>
            </g>
          ))}
          <text x="120" y="124" textAnchor="middle">
            {c("On this device", "在此设备上")}
          </text>
        </>
      )}
      {group === "data" &&
        Array.from({ length: 210 }, (_, index) => {
          const column = index % 21,
            row = Math.floor(index / 21);
          return (
            <circle
              key={index}
              cx={16 + column * 10 + row * 1.4}
              cy={30 + row * 8 + Math.sin(column * 0.5 + row * 0.3) * 21}
              r="1.1"
              fill="currentColor"
              opacity={0.35 + row * 0.055}
            />
          );
        })}
    </svg>
  );
}
