export function chartTheme(canvas) {
  const style = getComputedStyle(canvas);
  const color = (token, fallback) =>
    style.getPropertyValue(token).trim() || fallback;
  return {
    panel: color("--panel", "#171717"),
    ink: color("--ink", "#f0e8da"),
    soft: color("--soft", "#aaa39b"),
    line: color("--line", "#877260"),
    accent: color("--accent", "#fa6c34"),
    purple: color("--surface-purple", "#b9a3d0"),
  };
}

export function observeChartTheme(canvas, render) {
  const shell = canvas.closest(".opsis[data-theme]");
  if (!shell) return () => {};
  const observer = new MutationObserver(render);
  observer.observe(shell, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
