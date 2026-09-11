import { signed } from "./analysis.js";
export function drawChart(canvas, series, minutes, hover = null) {
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
  c.fillStyle = "#fa6c3407";
  c.fillRect(x(0), top, right - x(0), bottom - top);
  c.font = "10px monospace";
  for (const v of [-limit, 0, limit]) {
    c.strokeStyle = v === 0 ? "#877260" : "#393631";
    c.setLineDash(v === 0 ? [3, 4] : []);
    c.beginPath();
    c.moveTo(left, y(v));
    c.lineTo(right, y(v));
    c.stroke();
    c.fillStyle = "#a79b8f";
    c.fillText(signed(v), 0, y(v) + 3);
  }
  c.setLineDash([]);
  for (const v of [-minutes, -minutes / 2, 0, minutes / 2, minutes]) {
    c.fillStyle = "#a79b8f";
    c.fillText(v === 0 ? "T0" : `${v > 0 ? "+" : ""}${v}m`, x(v) - 12, h - 7);
  }
  c.fillStyle = "#8f8379";
  c.fillText("BEFORE", left + 6, 12);
  c.fillStyle = "#edaa80";
  c.fillText("AFTER PUBLICATION", x(0) + 9, 12);
  const colors = { weth: "#fa6c34", cbbtc: "#f0e8da", pons: "#9c8faf" };
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
  c.strokeStyle = "#fa6c34";
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
    c.strokeStyle = "#f0e8da77";
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
    c.fillStyle = "#171717ed";
    c.fillRect(bx, top + 13, 143, 19 + lines.length * 18);
    c.strokeStyle = "#655244";
    c.strokeRect(bx, top + 13, 143, 19 + lines.length * 18);
    c.fillStyle = "#ccae98";
    c.fillText(
      `${m >= 0 ? "+" : ""}${m} MIN FROM PUBLICATION`,
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
