// Keep three.js and texture requests behind an actual mounted globe.
// Importing or prefetching the route does not start loading either texture.
export function createGlobe(el, events, onSelect, onError) {
  let renderer;
  let disposed = false;
  let rotating = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pending = [];
  const call = (method, ...args) => {
    if (disposed) return;
    if (renderer) return renderer[method](...args);
    pending.push([method, args]);
  };
  void import("./globe-renderer.js")
    .then(({ createGlobe: mount }) => {
      if (disposed) return;
      renderer = mount(el, events, onSelect);
      for (const [method, args] of pending) renderer[method](...args);
      pending.length = 0;
    })
    .catch(() => {
      if (disposed) return;
      // The page owns the visible error; the inline notice is only a fallback.
      if (onError) {
        onError();
        return;
      }
      const notice = document.createElement("p");
      notice.setAttribute("role", "status");
      notice.textContent = document.documentElement.lang.startsWith("zh")
        ? "无法加载地球视图。新闻和图表控件仍可使用。"
        : "The globe could not load. News and chart controls remain available.";
      el.replaceChildren(notice);
    });
  return {
    setLocale(locale) {
      call("setLocale", locale);
    },
    select(index) {
      rotating = false;
      call("select", index);
    },
    reset() {
      rotating = true;
      call("reset");
    },
    toggle() {
      rotating = !rotating;
      call("toggle");
      return rotating;
    },
    dispose() {
      disposed = true;
      pending.length = 0;
      renderer?.dispose();
    },
  };
}
