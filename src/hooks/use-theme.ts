import { useCallback, useEffect, useState } from 'react'
import {
  THEME_STORAGE_KEY,
  nextPreference,
  parsePreference,
  resolveTheme,
} from '#/lib/theme'
import type { ResolvedTheme, ThemePreference } from '#/lib/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches

/** Applies the resolved theme to the document, the same way the init script does. */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement) {
  root.classList.toggle('dark', theme === 'dark')
  // Not cosmetic: this is what makes native scrollbars, form controls and the
  // canvas behind the page follow the theme rather than staying stubbornly
  // light behind dark content.
  root.style.colorScheme = theme
}

/**
 * The DOM adapter over `lib/theme.ts`.
 *
 * Starts at `system` on both the server and the first client render so the
 * markup matches and hydration stays quiet; the stored preference is read in
 * an effect. That is only a description of the *toggle's* state — the document
 * itself was already themed correctly before first paint by the inline script
 * in the root head, so nothing flashes.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>('system')
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    setPreference(parsePreference(localStorage.getItem(THEME_STORAGE_KEY)))
    setSystemDark(prefersDark())

    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) =>
      setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const theme = resolveTheme(preference, systemDark)

  useEffect(() => {
    applyTheme(theme, document.documentElement)
  }, [theme])

  const cycle = useCallback(() => {
    setPreference((current) => {
      const next = nextPreference(current)
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // Cookies blocked. The theme still applies for this page view; it just
        // will not be remembered, which is better than throwing on a click.
      }
      return next
    })
  }, [])

  return { preference, theme, cycle }
}
