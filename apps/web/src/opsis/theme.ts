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
  // D15: the default is electric-blue navigation around the light paper surface;
  // the dark surface is an explicit choice.
  return saved ?? "light";
}
export function persistTheme(theme: Theme): void {
  try { localStorage.setItem(themeKey, theme); } catch { /* Storage may be unavailable. */ }
}
