'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'kitchen-theme';

/**
 * Light / dark theme, persisted to localStorage. The actual palette lives in CSS
 * (`data-theme` on <html> drives the custom properties in globals.css); this hook
 * just tracks the choice and flips the attribute. An inline script in the root
 * layout sets the attribute before first paint so there's no flash.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    let initial: Theme = 'light';
    try {
      const stored = localStorage.getItem(KEY) as Theme | null;
      initial = stored === 'dark' || stored === 'light'
        ? stored
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {
      /* storage blocked — fall back to light */
    }
    setThemeState(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  };

  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
