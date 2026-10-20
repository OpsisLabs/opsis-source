import { useEffect, useRef, useState } from "react";
import type { Point3D } from "./lab-data";
import { useCopy } from "./copy";

export default function SpatialPlot({
  points,
  selected,
  onSelect,
  surface = false,
}: {
  points: Point3D[];
  selected?: string;
  onSelect?: (id: string) => void;
  surface?: boolean;
}) {
  const c = useCopy();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const hit = useRef<{ x: number; y: number; point: Point3D }[]>([]);
  const [camera, setCamera] = useState({ yaw: -0.55, pitch: 0.4, zoom: 1 });
  const [projection, setProjection] = useState<"3d" | "2d">("3d");
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const box = el.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      el.width = box.width * dpr;
      el.height = box.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      const styles = getComputedStyle(el);
      const ink = styles.getPropertyValue("--soft").trim() || "#596781";
      const line = styles.getPropertyValue("--line").trim() || "#dce3f2";
      const accent = styles.getPropertyValue("--accent").trim() || "#064af2";
      const scale = Math.min(box.width / 4.2, box.height / 3.4) * camera.zoom;
      const project = (x: number, y: number, z: number) => {
        if (projection === "2d") return { x: box.width / 2 + x * scale, y: box.height * 0.5 - y * scale, depth: z };
        const rx = x * Math.cos(camera.yaw) - z * Math.sin(camera.yaw),
          rz = x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
        return {
          x: box.width / 2 + rx * scale,
          y:
            box.height * 0.52 +
            (-y * Math.cos(camera.pitch) + rz * Math.sin(camera.pitch)) * scale,
          depth: y * Math.sin(camera.pitch) + rz * Math.cos(camera.pitch),
        };
      };
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let n = -1; n <= 1.01; n += 0.2) {
        const a = project(n, -0.85, -1),
          b = project(n, -0.85, 1),
          e = project(-1, -0.85, n),
          f = project(1, -0.85, n);
        if (projection === "2d") {
          const left = project(-1, n, 0), right = project(1, n, 0);
          const top = project(n, 1, 0), bottom = project(n, -1, 0);
          ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y);
          ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(f.x, f.y);
        const wallLeft = project(-1, n, -1), wallRight = project(1, n, -1);
        const wallTop = project(n, 1, -1);
        ctx.moveTo(wallLeft.x, wallLeft.y); ctx.lineTo(wallRight.x, wallRight.y);
        ctx.moveTo(a.x, a.y); ctx.lineTo(wallTop.x, wallTop.y);
        ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.font = "12px OpsisMono, monospace";
      for (const [label, x, y, z] of [
        [surface ? c("CORE SHOCK", "核心冲击") : c("VOLUME", "交易量"), 1.15, -0.85, -1],
        [surface ? c("OTHER SHOCK", "其他冲击") : c("LIQUIDITY", "流动性"), -1, -0.85, 1.15],
        [surface ? c("P/L", "盈亏") : c("24H CHANGE", "24 小时变化"), -1, 1.12, -1],
      ] as const) {
        if (projection === "2d" && z === 1.15) continue;
        const p = project(x, y, z);
        ctx.fillText(label, p.x - 28, p.y);
      }
      hit.current = points
        .map((point) => ({ ...project(point.x, point.y, point.z), point }))
        .sort((a, b) => a.depth - b.depth);
      for (const p of hit.current) {
        const active = p.point.id === selected;
        ctx.fillStyle = active || surface ? accent : p.point.color;
        ctx.globalAlpha = surface ? 0.68 : 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, active ? 7 : surface ? 1.65 : 3.1, 0, Math.PI * 2);
        ctx.fill();
        if (active) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };
    draw();
    const obs = new ResizeObserver(draw);
    obs.observe(el);
    const theme = el.closest("[data-theme]");
    const themeObserver = new MutationObserver(draw);
    if (theme) themeObserver.observe(theme, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { obs.disconnect(); themeObserver.disconnect(); };
  }, [points, camera, selected, surface, projection, c]);
  const inspect = (x: number, y: number) => {
    const el = canvas.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const candidates = hit.current
      .map((p) => ({
        ...p,
        d: Math.hypot(p.x - (x - box.left), p.y - (y - box.top)),
      }))
      .filter((p) => p.d < 16)
      .sort((a, b) => a.d - b.d);
    const p = candidates[0]?.point;
    setHover(p?.label ?? null);
    return p;
  };
  return (
    <div className="opsis-spatial">
      <div className="opsis-spatial-toolbar">
        <div role="group" aria-label={c("Plot projection", "图表投影")}>
          <button type="button" aria-pressed={projection === "3d"} onClick={() => setProjection("3d")}>3D</button>
          <button type="button" aria-pressed={projection === "2d"} onClick={() => setProjection("2d")}>2D</button>
        </div>
        <span>
          {projection === "3d" ? c("DRAG TO ROTATE / + − TO ZOOM", "拖动旋转 / 加减缩放") : c("X / Y PROJECTION · + − TO ZOOM", "X / Y 投影 · 加减缩放")}
        </span>
        <div>
          <a href="#lab-observations">{c("Table", "表格")}</a>
          <button
            type="button"
            aria-label={c("Zoom out", "缩小")}
            onClick={() =>
              setCamera((v) => ({ ...v, zoom: Math.max(0.55, v.zoom - 0.15) }))
            }
          >
            −
          </button>
          <button
            type="button"
            aria-label={c("Zoom in", "放大")}
            onClick={() =>
              setCamera((v) => ({ ...v, zoom: Math.min(2, v.zoom + 0.15) }))
            }
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setCamera({ yaw: -0.55, pitch: 0.4, zoom: 1 })}
          >
            {c("Reset view", "重置视图")} ↺
          </button>
        </div>
      </div>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label={c(
          projection === "2d"
            ? "Interactive X/Y projection. Plus and minus zoom. Select a point or use the equivalent table and inspector for exact values."
            : surface
            ? "Interactive portfolio shock surface. Arrow keys rotate; plus and minus zoom. Exact selected scenario is shown beside the plot."
            : "Interactive captured pool map. Arrow keys rotate; plus and minus zoom. Select a pool in the table for its exact values.",
          projection === "2d" ? "交互 X/Y 投影。加减键缩放。选择点或使用表格与详情面板查看精确数据。" : "交互三维图。方向键旋转，加减键缩放。精确数据见旁边面板和表格。",
        )}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "-",
              "=",
            ].includes(e.key)
          ) {
            e.preventDefault();
            setCamera((v) => ({
              ...v,
              yaw:
                v.yaw +
                (e.key === "ArrowLeft"
                  ? -0.12
                  : e.key === "ArrowRight"
                    ? 0.12
                    : 0),
              pitch: Math.max(
                -1,
                Math.min(
                  1,
                  v.pitch +
                    (e.key === "ArrowUp"
                      ? 0.08
                      : e.key === "ArrowDown"
                        ? -0.08
                        : 0),
                ),
              ),
              zoom: Math.max(
                0.55,
                Math.min(
                  2,
                  v.zoom +
                    (["+", "="].includes(e.key)
                      ? 0.1
                      : e.key === "-"
                        ? -0.1
                        : 0),
                ),
              ),
            }));
          }
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && projection === "3d") {
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
            setCamera((v) => ({
              ...v,
              yaw: v.yaw + dx * 0.007,
              pitch: Math.max(-1, Math.min(1, v.pitch + dy * 0.005)),
            }));
            d.x = e.clientX;
            d.y = e.clientY;
          } else inspect(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (!drag.current?.moved) {
            const p = inspect(e.clientX, e.clientY);
            if (p) onSelect?.(p.id);
          }
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={() => setHover(null)}
      />
      <div className="opsis-spatial-caption" aria-live="polite">
        {hover ??
          c(
            surface
              ? "2,501 deterministic shock pairs · no probabilities"
              : `${points.length} captured pools · select a point to inspect`,
            surface
              ? "2,501 个确定性冲击组合 · 无概率"
              : `${points.length} 个历史资金池 · 选择点查看`,
          )}
      </div>
    </div>
  );
}
