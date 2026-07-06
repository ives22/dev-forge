import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../lib/storage";

export type ThemeMode = "dark" | "light";

export function useTheme(options: { persist?: boolean } = {}) {
  const { persist = true } = options;
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    void getSetting<ThemeMode>("theme", "dark").then((stored) => setThemeState(stored));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    if (persist) void setSetting("theme", theme);
  }, [persist, theme]);

  return {
    theme,
    toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark"))
  };
}
