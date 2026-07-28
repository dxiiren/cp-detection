import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from '#/lib/theme'
import { applyTheme, useTheme } from './use-theme'

/** jsdom has no real media query engine; this is the switch the hook reads. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    })),
  )

  return {
    emit: (nowMatches: boolean) => {
      for (const fn of listeners) {
        fn({ matches: nowMatches } as MediaQueryListEvent)
      }
    },
    listenerCount: () => listeners.size,
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('applyTheme', () => {
  it('adds and removes the class the stylesheet keys off', () => {
    const root = document.documentElement

    applyTheme('dark', root)
    expect(root.classList.contains('dark')).toBe(true)

    applyTheme('light', root)
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('sets colorScheme so native controls follow', () => {
    applyTheme('dark', document.documentElement)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})

describe('useTheme', () => {
  it('follows the OS when nothing has been chosen', () => {
    stubMatchMedia(true)

    const { result } = renderHook(() => useTheme())

    expect(result.current.preference).toBe('system')
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('honours a stored preference over the OS', () => {
    stubMatchMedia(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('cycles and persists the choice', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => result.current.cycle())

    expect(result.current.preference).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    act(() => result.current.cycle())

    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('reacts when the OS flips while following it', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')

    act(() => media.emit(true))

    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignores the OS once a preference is set', () => {
    const media = stubMatchMedia(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const { result } = renderHook(() => useTheme())

    act(() => media.emit(true))

    expect(result.current.theme).toBe('light')
  })

  it('stops listening when unmounted', () => {
    const media = stubMatchMedia(false)
    const { unmount } = renderHook(() => useTheme())

    expect(media.listenerCount()).toBe(1)
    unmount()
    expect(media.listenerCount()).toBe(0)
  })

  it('survives storage being unavailable', () => {
    // Blocked cookies make localStorage.setItem throw. A click must not.
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('access denied')
      })

    expect(() => act(() => result.current.cycle())).not.toThrow()
    expect(result.current.preference).toBe('light')

    setItem.mockRestore()
  })
})
