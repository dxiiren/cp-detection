/**
 * Theme resolution, as pure functions.
 *
 * `styles.css` has carried a full `.dark` token set and `@custom-variant dark`
 * from the start, but nothing ever added the class, so none of it was
 * reachable. This is the missing half.
 *
 * Same seam as the rest: no DOM, no storage, no `matchMedia`. The hook in
 * `hooks/use-theme.ts` is the adapter that supplies those.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'cp-detection-theme'

const PREFERENCES: ReadonlyArray<ThemePreference> = ['light', 'dark', 'system']

/** What to actually render, given the choice and what the OS reports. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/** The toggle order. `system` last, so the default is one press from anywhere. */
export function nextPreference(current: ThemePreference): ThemePreference {
  const index = PREFERENCES.indexOf(current)
  // An unrecognised value has no position in the cycle; start it over rather
  // than wrap a -1 into the last entry.
  if (index === -1) return 'light'
  return PREFERENCES[(index + 1) % PREFERENCES.length]
}

/**
 * localStorage is shared with every other script on the origin, and with
 * whatever an older version of this app wrote. Anything unrecognised means
 * "no stated preference", which is `system`.
 */
export function parsePreference(value: unknown): ThemePreference {
  return PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : 'system'
}

/**
 * The blocking script that applies the theme before the first paint.
 *
 * It has to be inline and synchronous in `<head>`: doing this in an effect
 * means the light theme paints first and is then repainted dark, which is the
 * flash every themed site is judged on. Kept to one expression, and wrapped in
 * try/catch because `localStorage` throws outright when cookies are blocked —
 * an exception here would abort before the document renders.
 */
export function themeInitScript(key: string = THEME_STORAGE_KEY): string {
  return (
    `!function(){try{var p=localStorage.getItem(${JSON.stringify(key)});` +
    `var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);` +
    `var e=document.documentElement;e.classList.toggle("dark",d);` +
    `e.style.colorScheme=d?"dark":"light"}catch(_){}}()`
  )
}
