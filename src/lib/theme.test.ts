import { describe, expect, it } from 'vitest'
import {
  THEME_STORAGE_KEY,
  nextPreference,
  parsePreference,
  resolveTheme,
  themeInitScript,
} from './theme'

describe('resolveTheme', () => {
  it('honours an explicit choice over what the OS wants', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the OS when the choice is to follow the OS', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('nextPreference', () => {
  it('cycles light -> dark -> system and back', () => {
    expect(nextPreference('light')).toBe('dark')
    expect(nextPreference('dark')).toBe('system')
    expect(nextPreference('system')).toBe('light')
  })

  it('returns to a known state from a corrupted one', () => {
    expect(nextPreference('nonsense' as never)).toBe('light')
  })
})

describe('parsePreference', () => {
  it('accepts the three it knows', () => {
    expect(parsePreference('light')).toBe('light')
    expect(parsePreference('dark')).toBe('dark')
    expect(parsePreference('system')).toBe('system')
  })

  it('falls back to following the OS for anything else', () => {
    // localStorage is shared with every other script on the origin and with
    // whatever an older version of this app wrote there.
    for (const value of [null, undefined, '', 'DARK', 'true', 42, {}]) {
      expect(parsePreference(value)).toBe('system')
    }
  })
})

describe('themeInitScript', () => {
  const script = themeInitScript()

  it('reads the same key the app writes', () => {
    expect(script).toContain(THEME_STORAGE_KEY)
  })

  it('applies the class the stylesheet keys off', () => {
    expect(script).toContain('dark')
    expect(script).toContain('classList')
  })

  it('sets colorScheme so form controls and scrollbars follow', () => {
    expect(script).toContain('colorScheme')
  })

  it('cannot take the page down', () => {
    // It runs before anything else, and localStorage throws outright when
    // cookies are blocked. An exception here would leave a blank document.
    expect(script).toContain('try')
    expect(script).toContain('catch')
  })

  it('is a single self-executing expression safe to inline', () => {
    expect(script).not.toContain('\n')
    expect(script).not.toContain('</script')
  })
})
