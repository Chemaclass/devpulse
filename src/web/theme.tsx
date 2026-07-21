import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type TTheme = "light" | "dark";

const STORAGE_KEY = "devpulse-theme";

const ThemeContext = createContext<{ theme: TTheme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

function initialTheme(): TTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<TTheme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#eef1e6" : "#0f1310");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
