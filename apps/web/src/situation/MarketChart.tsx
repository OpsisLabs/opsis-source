import { useEffect, useId, useRef, useState } from "react";
import {
  areaPath,
  axisScale,
  calloutLines,
  nearestObservation,
  observationTimes,
  segments,
  type MarketSeries,
} from "./workspace-chart";

export default function MarketChart({
  series,
  interval,
  domain,
  marker,
  markerTitle,
  volume,
  labels,
  value,
  time,
}: {
  series: MarketSeries[];
  interval: number;
  domain: [number, number] | null;
  marker: number | null;
  markerTitle: string;
  volume: boolean;
  labels: {
    chart: string;
    unit: string;
    volume: string;
    publication: string;
    inspect: string;
    missing: string;
    empty: string;
    start: string;
    end: string;
    dateOnly: string;
    volumeEmpty: string;
  };
  value: (n: number | null) => string;
  time: (n: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [size, setSize] = useState({ width: 560, height: 500 });
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(220, entry.contentRect.width),
        height: Math.max(360, entry.contentRect.height),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const times = observationTimes(series);
  const index = nearestObservation(times, chosen ?? times.at(-1) ?? 0);
  const selectedTime = times[index];
  const { min, max, ticks } = axisScale(series, marker !== null);
  const left = width < 400 ? 58 : 70,
    right = width - 12;
  const top = 76,
    bottom = volume ? height - 166 : height - 38;
  const volumeTop = bottom + 34,
    volumeBottom = height - 34;
  const range = domain ?? [0, 1];
  const x = (n: number) =>
    left + ((n - range[0]) / Math.max(1, range[1] - range[0])) * (right - left);
  const y = (n: number) => bottom - ((n - min) / (max - min)) * (bottom - top);
  const points = series[0]?.points ?? [];
  const hasVolumes = points.some(
    (p) => p.volume !== undefined && Number.isFinite(p.volume) && p.volume >= 0,
  );
  const volumeScale = axisScale([
    {
      id: "volume",
      label: "",
      points: points.map((p) => ({ time: p.time, value: p.volume ?? null })),
    },
  ]);
  const volumeMax = Math.max(1, volumeScale.max);
  const vy = (n: number) =>
    volumeBottom - (n / volumeMax) * (volumeBottom - volumeTop);
  const hasValues = series.some((line) =>
    line.points.some((p) => p.value !== null && Number.isFinite(p.value)),
  );
  const observed = series
    .map((line) => {
      const point = line.points.find((p) => p.time === selectedTime);
      return `${line.label}: ${point?.value == null ? labels.missing : value(point.value)}`;
    })
    .join(" · ");
  const selectedVolume = points.find((p) => p.time === selectedTime)?.volume;
  const last = points.at(-1);
  const endValue =
    last?.value != null && Number.isFinite(last.value) ? last : null;
  const tag = endValue ? value(endValue.value) : "";
  const tagWidth = Math.min(right - left, tag.length * 7 + 14);
  const tickFractions = width < 400 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const markerX = marker !== null ? x(marker) : 0;
  const calloutWidth = Math.min(190, right - left);
  const calloutX = Math.max(
    left,
    Math.min(right - calloutWidth, markerX - calloutWidth / 2),
  );
  const titleLines = calloutLines(markerTitle, calloutWidth - 20);
  const publicationTime =
    marker !== null
      ? new Date(marker).toISOString().slice(11, 19) + " UTC"
      : "";
  return (
    <div className="world-ws-chart">
      <div className="world-ws-chart-box" ref={ref}>
        <svg
          className="world-ws-price"
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={labels.chart}
          onPointerLeave={() => setChosen(null)}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const px = ((event.clientX - box.left) * width) / box.width;
            const target =
              range[0] + ((px - left) / (right - left)) * (range[1] - range[0]);
            const nearest = nearestObservation(times, target);
            if (nearest >= 0) setChosen(times[nearest]);
          }}
        >
          <defs>
            <clipPath id={id + "-clip"}>
              <rect
                x={left - 3}
                y={top - 3}
                width={right - left + 6}
                height={bottom - top + 6}
              />
            </clipPath>
            <linearGradient id={id + "-fill"} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop
                offset="100%"
                stopColor="var(--accent)"
                stopOpacity="0.015"
              />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick} className="world-ws-grid">
              <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
              <text x={left - 9} y={y(tick) + 4} textAnchor="end">
                {hasValues
                  ? value(tick)
                      .replace(/^\$/, "")
                      .replace(/\.00(?=%?$)/, "")
                  : "—"}
              </text>
            </g>
          ))}
          <text
            className="world-ws-axis-label"
            transform={`translate(13 ${(top + bottom) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {labels.unit}
          </text>
          {tickFractions.map((fraction) => {
            const tick = range[0] + (range[1] - range[0]) * fraction;
            return (
              <g key={fraction} className="world-ws-grid">
                <line x1={x(tick)} x2={x(tick)} y1={top} y2={bottom} />
                {volume && (
                  <line
                    x1={x(tick)}
                    x2={x(tick)}
                    y1={volumeTop}
                    y2={volumeBottom}
                  />
                )}
                <text
                  x={x(tick)}
                  y={(volume ? volumeBottom : bottom) + 23}
                  textAnchor={
                    fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
                  }
                >
                  {domain
                    ? time(tick)
                    : fraction === 0
                      ? labels.start
                      : fraction === 1
                        ? labels.end
                        : ""}
                </text>
              </g>
            );
          })}
          <path
            className="world-ws-axis"
            d={`M${left},${top}V${bottom}H${right}`}
          />
          <g clipPath={`url(#${id}-clip)`}>
            {series.map((line) => (
              <g
                key={line.id}
                className={`world-ws-line world-ws-line-${line.id}`}
              >
                {segments(line.points, interval).map((part, i) => (
                  <g key={i}>
                    {line.id === series[0]?.id && (
                      <path
                        className="world-ws-area"
                        d={areaPath(part, x, y, bottom)}
                        fill={`url(#${id}-fill)`}
                      />
                    )}
                    <polyline
                      points={part
                        .map((p) => `${x(p.time)},${y(p.value!)}`)
                        .join(" ")}
                    />
                    {part
                      .filter(
                        (p) =>
                          part.length === 1 ||
                          (p.time === selectedTime && chosen !== null),
                      )
                      .map((p) => (
                        <circle
                          key={p.time}
                          cx={x(p.time)}
                          cy={y(p.value!)}
                          r={4}
                        />
                      ))}
                  </g>
                ))}
              </g>
            ))}
          </g>
          {volume && (
            <g className="world-ws-volume">
              {[0, 0.5, 1].map((fraction) => (
                <g className="world-ws-grid" key={fraction}>
                  <line
                    x1={left}
                    x2={right}
                    y1={vy(fraction * volumeMax)}
                    y2={vy(fraction * volumeMax)}
                  />
                  <text
                    x={left - 9}
                    y={vy(fraction * volumeMax) + 4}
                    textAnchor="end"
                  >
                    {hasVolumes
                      ? new Intl.NumberFormat("en", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(fraction * volumeMax)
                      : "—"}
                  </text>
                </g>
              ))}
              <text
                className="world-ws-axis-label"
                transform={`translate(13 ${(volumeTop + volumeBottom) / 2}) rotate(-90)`}
                textAnchor="middle"
              >
                {labels.volume}
              </text>
              <path
                className="world-ws-axis"
                d={`M${left},${volumeTop}V${volumeBottom}H${right}`}
              />
              {!hasVolumes && (
                <text
                  x={(left + right) / 2}
                  y={(volumeTop + volumeBottom) / 2 + 4}
                  textAnchor="middle"
                >
                  {labels.volumeEmpty}
                </text>
              )}
              {points.map(
                (p) =>
                  p.volume !== undefined &&
                  Number.isFinite(p.volume) &&
                  p.volume >= 0 && (
                    <rect
                      key={p.time}
                      data-testid="volume-bar"
                      x={
                        x(p.time - interval / 2) -
                        Math.min(
                          14,
                          (((right - left) * interval) /
                            Math.max(1, range[1] - range[0])) *
                            0.7,
                        ) /
                          2
                      }
                      y={vy(p.volume)}
                      width={Math.min(
                        14,
                        (((right - left) * interval) /
                          Math.max(1, range[1] - range[0])) *
                          0.7,
                      )}
                      height={volumeBottom - vy(p.volume)}
                    >
                      <title>{`${time(p.time)} · ${p.volume} ETH`}</title>
                    </rect>
                  ),
              )}
            </g>
          )}
          {marker !== null &&
            domain &&
            marker >= domain[0] &&
            marker <= domain[1] && (
              <g className="world-ws-marker" data-testid="publication-marker">
                <line
                  x1={markerX}
                  x2={markerX}
                  y1={68}
                  y2={volume ? volumeBottom : bottom}
                />
                <rect
                  x={calloutX}
                  y={6}
                  width={calloutWidth}
                  height={58}
                  rx={5}
                />
                <title>{`${labels.publication}: ${time(marker)} · ${markerTitle}`}</title>
                <text x={calloutX + 10} y={22} className="world-ws-marker-time">
                  {labels.publication} · {publicationTime}
                </text>
                <text x={calloutX + 10} y={39}>
                  {titleLines[0]}
                </text>
                <text x={calloutX + 10} y={54}>
                  {titleLines[1]}
                </text>
              </g>
            )}
          {marker === null && hasValues && (
            <g className="world-ws-date-context">
              <rect x={left} y={14} width={right - left} height={37} rx={5} />
              <text x={(left + right) / 2} y={37} textAnchor="middle">
                {labels.dateOnly}
              </text>
            </g>
          )}
          {hasValues && chosen !== null && selectedTime !== undefined && (
            <line
              className="world-ws-cursor"
              x1={x(selectedTime)}
              x2={x(selectedTime)}
              y1={top}
              y2={volume ? volumeBottom : bottom}
            />
          )}
          {endValue && (
            <g
              className={`world-ws-latest world-ws-line-${series[0]?.id}`}
              data-testid="latest-close-tag"
            >
              <rect
                x={right - tagWidth}
                y={y(endValue.value!) - 11}
                width={tagWidth}
                height={22}
                rx={3}
              />
              <text
                x={right - tagWidth / 2}
                y={y(endValue.value!) + 4}
                textAnchor="middle"
              >
                {tag}
              </text>
            </g>
          )}
        </svg>
        {!hasValues && (
          <p className="world-ws-chart-empty" role="status">
            {labels.empty}
          </p>
        )}
      </div>
      {times.length > 0 && (
        <div className="world-ws-inspector">
          <output aria-live="polite">
            <time>{time(selectedTime)} UTC</time>
            <span>
              {observed}
              {volume && selectedVolume !== undefined
                ? ` · ${selectedVolume} ETH`
                : ""}
            </span>
          </output>
          <label htmlFor={id + "-sample"} className="sr-only">
            {labels.inspect}
          </label>
          <input
            id={id + "-sample"}
            type="range"
            min={0}
            max={times.length - 1}
            value={index}
            onChange={(event) => setChosen(times[Number(event.target.value)])}
            aria-valuetext={`${time(selectedTime)} UTC · ${observed}`}
          />
        </div>
      )}
    </div>
  );
}
