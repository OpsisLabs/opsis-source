import { useEffect, useRef } from "react";

/**
 * Live orange dot-matrix animation: a chain of blocks streaming left,
 * with transaction pulses traveling along the links and block "halos".
 */
export default function ChainVisual() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ORANGE = "#fa6c34";
    const BONE = "rgba(214,204,186,";

    interface Pulse {
      t: number; // 0..1 position along the link between block i and i+1
      link: number;
      speed: number;
    }
    const pulses: Pulse[] = [];
    for (let i = 0; i < 7; i++) {
      pulses.push({ t: Math.random(), link: i, speed: 0.35 + Math.random() * 0.4 });
    }

    const start = performance.now();

    const draw = (now: number) => {
      const time = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      // background dot field (dim)
      const gap = 14;
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          const shimmer = 0.05 + 0.035 * Math.sin(time * 0.8 + x * 0.02 + y * 0.03);
          ctx.fillStyle = `rgba(214,204,186,${shimmer})`;
          ctx.fillRect(x, y, 1.4, 1.4);
        }
      }

      const midY = h * 0.5;
      const spacing = 150;
      const offset = (time * 40) % spacing;
      const blockCount = Math.ceil(w / spacing) + 2;

      // links
      ctx.strokeStyle = "rgba(250,108,52,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = -1; i < blockCount; i++) {
        const bx = i * spacing - offset + spacing;
        const wave = Math.sin(time * 1.2 + i * 0.9) * 8;
        const size = 30;

        // halo
        const haloR = 34 + 10 * Math.sin(time * 1.6 + i);
        ctx.strokeStyle = "rgba(250,108,52,0.18)";
        ctx.strokeRect(bx - haloR, midY + wave - haloR, haloR * 2, haloR * 2);

        // block: dot-matrix square
        const dotGap = 6;
        for (let dy = -size; dy <= size; dy += dotGap) {
          for (let dx = -size; dx <= size; dx += dotGap) {
            const edge = Math.abs(dx) > size - dotGap || Math.abs(dy) > size - dotGap;
            const jitter = Math.sin(time * 2 + dx * 0.4 + dy * 0.3 + i) * 0.5 + 0.5;
            const alpha = edge ? 0.85 : 0.12 + jitter * 0.35;
            ctx.fillStyle = edge ? ORANGE : `rgba(250,108,52,${alpha})`;
            const r = edge ? 1.8 : 1.4;
            ctx.beginPath();
            ctx.arc(bx + dx, midY + wave + dy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // block height label
        ctx.fillStyle = `${BONE}0.4)`;
        ctx.font = "9px 'IBM Plex Mono', monospace";
        const num = 4821337 + i;
        ctx.fillText(`#${num}`, bx - 20, midY + wave + size + 22);
      }

      // pulses traveling along links
      for (const p of pulses) {
        p.t += p.speed / 60;
        if (p.t >= 1) {
          p.t = 0;
          p.link = Math.floor(Math.random() * blockCount);
        }
        const bx1 = p.link * spacing - offset + spacing;
        const wave1 = Math.sin(time * 1.2 + p.link * 0.9) * 8;
        const wave2 = Math.sin(time * 1.2 + (p.link + 1) * 0.9) * 8;
        const px = bx1 + p.t * spacing;
        const py = midY + wave1 + (wave2 - wave1) * p.t;
        // glow dot
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 9);
        grad.addColorStop(0, "rgba(250,108,52,0.95)");
        grad.addColorStop(1, "rgba(250,108,52,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd9c4";
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // scanning vertical line
      const sx = ((time * 60) % (w + 200)) - 100;
      const sgrad = ctx.createLinearGradient(sx - 60, 0, sx, 0);
      sgrad.addColorStop(0, "rgba(250,108,52,0)");
      sgrad.addColorStop(1, "rgba(250,108,52,0.12)");
      ctx.fillStyle = sgrad;
      ctx.fillRect(sx - 60, 0, 60, h);
      ctx.fillStyle = "rgba(250,108,52,0.5)";
      ctx.fillRect(sx, 0, 1, h);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
