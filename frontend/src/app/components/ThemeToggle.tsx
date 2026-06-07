import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  /** Compact icon-only button (e.g. for the header bar). */
  variant?: "icon" | "switch";
  className?: string;
}

/**
 * Accessible Bright / Dark mode toggle.
 *
 * - Reads & writes the persisted theme via next-themes.
 * - `resolvedTheme` is used (not `theme`) so "system" resolves to the actual
 *   active theme for correct icon + aria state.
 * - Guards against SSR/first-paint hydration mismatch with a `mounted` flag.
 * - Fully keyboard operable and screen-reader labelled.
 */
export function ThemeToggle({ variant = "icon", className = "" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const label = `Switch to ${isDark ? "bright" : "dark"} mode`;

  // Before mount we don't know the resolved theme — render a neutral
  // placeholder of identical size to avoid layout shift.
  if (!mounted) {
    return (
      <span
        aria-hidden
        className={`inline-flex w-9 h-9 rounded-xl ${className}`}
        style={{ border: "1px solid var(--border)" }}
      />
    );
  }

  if (variant === "switch") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={!isDark}
        aria-label={label}
        onClick={() => setTheme(next)}
        className={`relative inline-flex items-center h-7 w-12 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
        style={{ background: "var(--switch-background)" }}
      >
        <span
          className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-background shadow transition-transform"
          style={{ transform: isDark ? "translateX(4px)" : "translateX(26px)" }}
        >
          {isDark ? (
            <Moon size={11} className="text-foreground" />
          ) : (
            <Sun size={11} className="text-primary" />
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
      className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors duration-200 hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      style={{ border: "1px solid var(--border)" }}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
