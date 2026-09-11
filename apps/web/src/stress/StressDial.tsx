import type { KeyboardEvent, PointerEvent } from "react";
import { dialPercent } from "./dial";

export function StressDial({
  value,
  label,
  description,
  onChange,
}: {
  value: number;
  label: string;
  description: string;
  onChange: (value: number) => void;
}) {
  const angle = ((100 - value) / 200) * Math.PI;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(
      dialPercent(
        ((event.clientX - bounds.left) / bounds.width) * 300,
        ((event.clientY - bounds.top) / bounds.height) * 185,
      ),
    );
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      PageUp: value + 10,
      PageDown: value - 10,
      Home: -100,
      End: 100,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(Math.min(100, Math.max(-100, next)));
  };
  return (
    <div
      className="stress-dial"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-describedby={description}
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value > 0 ? "+" : ""}${value}%`}
      onKeyDown={keyboard}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      <svg viewBox="0 0 300 185" aria-hidden="true">
        <path
          className="stress-dial-track"
          d="M25 158 A125 125 0 0 1 275 158"
        />
        <path
          className="stress-dial-fill"
          d="M25 158 A125 125 0 0 1 275 158"
          pathLength="200"
          strokeDasharray={`${value + 100} 200`}
        />
        {Array.from({ length: 21 }, (_, i) => {
          const tick = Math.PI - (i / 20) * Math.PI;
          return (
            <line
              key={i}
              x1={150 + Math.cos(tick) * 112}
              y1={158 - Math.sin(tick) * 112}
              x2={150 + Math.cos(tick) * (i % 5 === 0 ? 103 : 108)}
              y2={158 - Math.sin(tick) * (i % 5 === 0 ? 103 : 108)}
            />
          );
        })}
        <text x="150" y="17" textAnchor="middle">
          0%
        </text>
        <text x="7" y="182">
          −100%
        </text>
        <text x="293" y="182" textAnchor="end">
          +100%
        </text>
        <text className="stress-dial-value" x="150" y="138" textAnchor="middle">
          {value > 0 ? "+" : ""}
          {value}%
        </text>
        <circle
          className="stress-dial-handle"
          cx={150 + Math.cos(angle) * 125}
          cy={158 - Math.sin(angle) * 125}
          r="7"
        />
      </svg>
    </div>
  );
}
