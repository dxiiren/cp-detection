import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TOAST_SECONDS,
  MAX_TOAST_SECONDS,
  MIN_TOAST_SECONDS,
} from './toast-copy'
import {
  MAX_EVENTS,
  clearEvents,
  clipboardStore,
  recordEvent,
  resetClipboardStore,
  setSetting,
} from './event-store'
import type { ClipboardEventRecord } from './types'

const make = (
  over: Partial<ClipboardEventRecord> = {},
): ClipboardEventRecord => ({
  id: 'e1',
  type: 'paste',
  method: 'keyboard',
  targetLabel: 'Email',
  targetKind: 'input',
  chars: 5,
  preview: 'hello',
  payloadKind: 'text',
  files: 0,
  trusted: true,
  at: 1_700_000_000_000,
  ...over,
})

beforeEach(() => {
  resetClipboardStore()
})

describe('settings', () => {
  it('protects fields by default and keeps previews off the wire by default', () => {
    expect(clipboardStore.state.settings).toEqual({
      blockProtectedFields: true,
      sendPreviewToServer: false,
      keepToastsOpen: false,
      toastSeconds: DEFAULT_TOAST_SECONDS,
    })
  })

  it('toggles a single setting without disturbing the others', () => {
    setSetting('sendPreviewToServer', true)

    expect(clipboardStore.state.settings).toMatchObject({
      blockProtectedFields: true,
      sendPreviewToServer: true,
      keepToastsOpen: false,
    })
  })

  it('clamps a toast duration typed outside the sane range', () => {
    // The store is the last line of defence: a 0-second toast would flash and
    // vanish, which reads as "detection stopped working".
    setSetting('toastSeconds', 0)
    expect(clipboardStore.state.settings.toastSeconds).toBe(MIN_TOAST_SECONDS)

    setSetting('toastSeconds', 99_999)
    expect(clipboardStore.state.settings.toastSeconds).toBe(MAX_TOAST_SECONDS)

    setSetting('toastSeconds', Number.NaN)
    expect(clipboardStore.state.settings.toastSeconds).toBe(
      DEFAULT_TOAST_SECONDS,
    )
  })

  it('leaves other settings alone when clamping', () => {
    setSetting('keepToastsOpen', true)
    setSetting('toastSeconds', -1)

    expect(clipboardStore.state.settings.keepToastsOpen).toBe(true)
  })
})

describe('events', () => {
  it('starts empty', () => {
    expect(clipboardStore.state.events).toEqual([])
  })

  it('keeps the newest event first', () => {
    recordEvent(make({ id: 'first' }))
    recordEvent(make({ id: 'second' }))

    expect(clipboardStore.state.events.map((e) => e.id)).toEqual([
      'second',
      'first',
    ])
  })

  it('drops the oldest once the cap is reached', () => {
    for (let i = 0; i < MAX_EVENTS + 5; i++) {
      recordEvent(make({ id: `e${i}` }))
    }

    const events = clipboardStore.state.events
    expect(events).toHaveLength(MAX_EVENTS)
    expect(events[0].id).toBe(`e${MAX_EVENTS + 4}`)
    expect(events.at(-1)?.id).toBe('e5')
  })

  it('clears', () => {
    recordEvent(make())
    clearEvents()

    expect(clipboardStore.state.events).toEqual([])
  })

  it('clearing leaves settings alone', () => {
    setSetting('blockProtectedFields', false)
    recordEvent(make())
    clearEvents()

    expect(clipboardStore.state.settings.blockProtectedFields).toBe(false)
  })

  it('notifies subscribers', () => {
    const seen = vi.fn()
    const sub = clipboardStore.subscribe(seen)

    recordEvent(make())

    expect(seen).toHaveBeenCalled()
    sub.unsubscribe()
  })

  it('replaces the array rather than mutating it, so React sees the change', () => {
    const before = clipboardStore.state.events
    recordEvent(make())

    expect(clipboardStore.state.events).not.toBe(before)
  })
})
