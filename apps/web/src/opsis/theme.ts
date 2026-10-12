export type Theme = "light" | "dark";
const themeKey = "opsis-theme";
export function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(themeKey);
    return value === "light" || value === "dark" ? value : null;
  } catch { return null; }
}
export function initialTheme(): Theme {
  const saved = savedTheme();
  if (saved) return saved;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function persistTheme(theme: Theme): void {
  try { localStorage.setItem(themeKey, theme); } catch { /* Storage may be unavailable. */ }
}
