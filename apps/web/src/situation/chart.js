import { chartTheme } from "./chart-theme.js";
import { signed } from "./analysis.js";
export function drawChart(
  canvas,
  series,
  minutes,
  hover = null,
  locale = "en",
) {
  const theme = chartTheme(canvas);
  const zh = locale === "zh-CN";
  const r = canvas.getBoundingClientRect(),
    d = devicePixelRatio || 1;
  canvas.width = r.width * d;
  canvas.height = r.height * d;
  const c = canvas.getContext("2d");
  c.scale(d, d);
  const w = r.width,
    h = r.height,
    left = 48,
    right = w - 20,
    top = 27,
    bottom = h - 28;
  const vals = series.flatMap((s) =>
    s.points.map((p) => p.change).filter((v) => v != null),
  );
  let limit = Math.max(0.05, ...vals.map(Math.abs)) * 1.2;
  const x = (m) => left + ((m + minutes) / (minutes * 2)) * (right - left),
    y = (v) => bottom - ((v + limit) / (limit * 2)) * (bottom - top);
  c.fillStyle = theme.panel;
  c.fillRect(x(0), top, right - x(0), bottom - top);
  c.font = "10px monospace";
  for (const v of [-limit, 0, limit]) {
    c.strokeStyle = theme.line;
    c.setLineDash(v === 0 ? [3, 4] : []);
    c.beginPath();
    c.moveTo(left, y(v));
    c.lineTo(right, y(v));
    c.stroke();
    c.fillStyle = theme.soft;
    c.fillText(signed(v), 0, y(v) + 3);
  }
  c.setLineDash([]);
  for (const v of [-minutes, -minutes / 2, 0, minutes / 2, minutes]) {
    c.fillStyle = theme.soft;
    c.fillText(
      v === 0 ? "T0" : `${v > 0 ? "+" : ""}${v}${zh ? "分" : "m"}`,
      x(v) - 12,
      h - 7,
    );
  }
  c.fillStyle = theme.soft;
  c.fillText(zh ? "发布前" : "BEFORE", left + 6, 12);
  c.fillStyle = theme.soft;
  c.fillText(zh ? "发布后" : "AFTER PUBLICATION", x(0) + 9, 12);
  const colors = { weth: theme.accent, cbbtc: theme.ink, pons: theme.purple };
  for (const s of series) {
    c.strokeStyle = colors[s.id];
    c.lineWidth = 2;
    c.beginPath();
    let pen = false;
    for (const p of s.points) {
      if (p.change == null) {
        pen = false;
        continue;
      }
      if (!pen) {
        c.moveTo(x(p.relative), y(p.change));
        pen = true;
      } else c.lineTo(x(p.relative), y(p.change));
    }
    c.stroke();
    for (const p of s.points) {
      if (p.change == null) continue;
      c.fillStyle = colors[s.id];
      c.beginPath();
      c.arc(x(p.relative), y(p.change), 2.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.strokeStyle = theme.accent;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x(0), top - 6);
  c.lineTo(x(0), bottom);
  c.stroke();
  if (hover != null) {
    const m =
      Math.round(
        (((Math.max(left, Math.min(right, hover)) - left) / (right - left)) *
          minutes *
          2) /
          5,
      ) *
        5 -
      minutes;
    c.strokeStyle = theme.ink;
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(x(m), top);
    c.lineTo(x(m), bottom);
    c.stroke();
    c.setLineDash([]);
    const lines = series.map((s) => ({
      s,
      p: s.points.find((p) => p.relative === m),
    }));
    const bx = Math.min(Math.max(left, x(m) + 12), right - 148);
    c.fillStyle = theme.panel;
    c.fillRect(bx, top + 13, 143, 19 + lines.length * 18);
    c.strokeStyle = theme.line;
    c.strokeRect(bx, top + 13, 143, 19 + lines.length * 18);
    c.fillStyle = theme.soft;
    c.fillText(
      `${m >= 0 ? "+" : ""}${m} ${zh ? "分钟（相对发布）" : "MIN FROM PUBLICATION"}`,
      bx + 8,
      top + 28,
    );
    lines.forEach(({ s, p }, i) => {
      c.fillStyle = colors[s.id];
      c.fillText(
        `${s.symbol}   ${signed(p?.change)}`,
        bx + 8,
        top + 46 + i * 18,
      );
    });
  }
}
