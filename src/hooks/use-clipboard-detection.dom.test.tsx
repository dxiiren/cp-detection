import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clipboardStore,
  resetClipboardStore,
  setSetting,
} from '#/lib/event-store'
import { useClipboardDetection } from './use-clipboard-detection'

// sonner renders through a portal with animations; asserting on the call is a
// truer test of "what did we say" than scraping the rendered toast.
const toast = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast }))

function clipboardEvent(type: string, text: string) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  })
  return event
}

const field = (selector = '#email') =>
  document.querySelector(selector) as HTMLInputElement

beforeEach(() => {
  resetClipboardStore()
  toast.info.mockClear()
  toast.warning.mockClear()
  toast.error.mockClear()
  document.body.innerHTML = `
    <label for="email">Email</label>
    <input id="email" />
    <label for="confirm-email">Confirm email</label>
    <input id="confirm-email" data-protect-paste />
  `
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useClipboardDetection', () => {
  it('reports that it is not detecting until the effect has run', () => {
    // Server-rendered markup looks identical to live markup, so the page needs
    // a way to say "listeners are attached" — both for the UI and for tests
    // that would otherwise act before hydration and silently prove nothing.
    const { result } = renderHook(() => useClipboardDetection())

    expect(result.current.detecting).toBe(true)
  })

  it('logs a paste to the store', () => {
    renderHook(() => useClipboardDetection())
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(clipboardStore.state.events).toHaveLength(1)
    expect(clipboardStore.state.events[0]).toMatchObject({
      type: 'paste',
      targetLabel: 'Email',
    })
  })

  it('warns on text arriving in a field', () => {
    renderHook(() => useClipboardDetection())
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(toast.warning).toHaveBeenCalledWith(
      'Pasted 5 chars into Email',
      expect.objectContaining({ description: expect.stringContaining('via ') }),
    )
  })

  it('is merely informative when text leaves a field', () => {
    renderHook(() => useClipboardDetection())
    field().dispatchEvent(clipboardEvent('copy', 'hello'))

    expect(toast.info).toHaveBeenCalledWith(
      'Copied 5 chars from Email',
      expect.anything(),
    )
  })

  it('hands each record to the caller so it can be shipped onwards', () => {
    const onRecord = vi.fn()
    renderHook(() => useClipboardDetection({ onRecord }))
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(onRecord).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'paste' }),
    )
  })

  it('forwards to the latest callback, not the one from first render', () => {
    // The listeners are installed once, so an inline arrow from the caller
    // must not be frozen into that first closure.
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ onRecord }) => useClipboardDetection({ onRecord }),
      { initialProps: { onRecord: first } },
    )

    rerender({ onRecord: second })
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  describe('how long toasts stay', () => {
    it('uses the configured dwell time', () => {
      renderHook(() => useClipboardDetection())
      setSetting('toastSeconds', 9)

      field().dispatchEvent(clipboardEvent('paste', 'hello'))

      expect(toast.warning).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ duration: 9_000 }),
      )
    })

    it('pins the toast open when asked', () => {
      renderHook(() => useClipboardDetection())
      setSetting('keepToastsOpen', true)

      field().dispatchEvent(clipboardEvent('paste', 'hello'))

      expect(toast.warning).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ duration: Infinity }),
      )
    })

    it('reads the setting at event time, not at mount', () => {
      // Same reason as the block toggle: listeners are installed once, so a
      // captured value here would freeze the duration at whatever it was on
      // first render.
      renderHook(() => useClipboardDetection())
      setSetting('toastSeconds', 2)

      field().dispatchEvent(clipboardEvent('copy', 'hello'))

      expect(toast.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ duration: 2_000 }),
      )
    })

    it('applies the same dwell time to a blocked paste', () => {
      renderHook(() => useClipboardDetection())
      setSetting('toastSeconds', 7)

      field('#confirm-email').dispatchEvent(clipboardEvent('paste', 'hello'))

      expect(toast.error).toHaveBeenCalledWith(
        'Paste blocked',
        expect.objectContaining({ duration: 7_000 }),
      )
    })
  })

  describe('protected fields', () => {
    it('refuses the paste and says so', () => {
      renderHook(() => useClipboardDetection())

      const event = clipboardEvent('paste', 'hello')
      field('#confirm-email').dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(toast.error).toHaveBeenCalledWith(
        'Paste blocked',
        expect.objectContaining({
          description: 'Confirm email does not accept pasted text',
        }),
      )
      expect(clipboardStore.state.events).toHaveLength(0)
    })

    it('leaves unprotected fields alone', () => {
      renderHook(() => useClipboardDetection())

      const event = clipboardEvent('paste', 'hello')
      field().dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
    })

    it('respects the setting being turned off without a remount', () => {
      // The listeners are installed once; a stale closure over the settings
      // would keep blocking here.
      renderHook(() => useClipboardDetection())
      setSetting('blockProtectedFields', false)

      const event = clipboardEvent('paste', 'hello')
      field('#confirm-email').dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
      expect(clipboardStore.state.events).toHaveLength(1)
    })
  })

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useClipboardDetection())
    unmount()

    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(clipboardStore.state.events).toHaveLength(0)
    expect(toast.warning).not.toHaveBeenCalled()
  })
})
