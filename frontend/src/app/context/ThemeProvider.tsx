import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Global theme provider for TFS.
 *
 * Strategy:
 *  - attribute="class"  → toggles the `.dark` class on <html>, matching the
 *    existing Tailwind v4 `@custom-variant dark (&:is(.dark *))` setup.
 *  - defaultTheme="dark" → the app keeps its current dark look out of the box.
 *  - enableSystem        → first-time visitors with no saved preference inherit
 *    their OS light/dark setting.
 *  - storageKey="tfs-theme" → persisted in localStorage so the choice survives
 *    reloads and is shared across tabs.
 *  - disableTransitionOnChange is intentionally NOT used; we control transitions
 *    in CSS via [data-theme-booting] so the very first paint is flash-free while
 *    later toggles animate smoothly.
 *
 * next-themes injects a tiny inline script that sets the class BEFORE React
 * hydrates, which prevents the flash-of-incorrect-theme (FOUC).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="tfs-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
