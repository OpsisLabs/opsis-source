export type Theme = "light" | "dark";

// A first-party preference cookie, like the product-tour flag: browser storage
// APIs stay unused (see apps/api/test/privacy-static.test.ts).
const THEME_COOKIE = "opsis_theme";

export function savedTheme(): Theme | null {
  try {
    const entry = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${THEME_COOKIE}=`));
    const value = entry?.slice(THEME_COOKIE.length + 1);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function initialTheme(): Theme {
  // D15: the default is electric-blue navigation around the light paper surface;
  // the dark surface is an explicit choice.
  return savedTheme() ?? "light";
}

export function persistTheme(theme: Theme): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE}=${theme}; Max-Age=31536000; Path=/; SameSite=Strict${secure}`;
  } catch {
    /* Cookies may be unavailable. */
  }
}
