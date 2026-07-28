import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOAST_SECONDS,
  MAX_TOAST_SECONDS,
  MIN_TOAST_SECONDS,
  blockedCopy,
  clampToastSeconds,
  toastDuration,
  toastCopy,
} from './toast-copy'
import type { ClipboardEventRecord } from './types'

const make = (
  over: Partial<ClipboardEventRecord> = {},
): ClipboardEventRecord => ({
  id: 'e1',
  type: 'paste',
  method: 'keyboard',
  targetLabel: 'Email',
  targetKind: 'input',
  chars: 42,
  preview: 'acme-corp',
  payloadKind: 'text',
  files: 0,
  trusted: true,
  at: 1_700_000_000_000,
  ...over,
})

describe('toast titles', () => {
  it('names the action, the size and the field', () => {
    expect(toastCopy(make()).title).toBe('Pasted 42 chars into Email')
  })

  it('uses "into" for arrivals and "from" for departures', () => {
    expect(toastCopy(make({ type: 'copy' })).title).toBe(
      'Copied 42 chars from Email',
    )
    expect(toastCopy(make({ type: 'cut' })).title).toBe(
      'Cut 42 chars from Email',
    )
    expect(toastCopy(make({ type: 'drop' })).title).toBe(
      'Dropped 42 chars into Email',
    )
  })

  it('says "1 char", not "1 chars"', () => {
    expect(toastCopy(make({ chars: 1 })).title).toBe('Pasted 1 char into Email')
  })

  it('handles a zero-length clipboard without reading oddly', () => {
    expect(toastCopy(make({ chars: 0 })).title).toBe(
      'Pasted 0 chars into Email',
    )
  })
})

describe('toast descriptions', () => {
  it('names how the action was triggered', () => {
    expect(toastCopy(make({ method: 'keyboard' })).description).toContain(
      'via keyboard',
    )
    expect(toastCopy(make({ method: 'right-click' })).description).toContain(
      'via right-click',
    )
    expect(toastCopy(make({ method: 'drag' })).description).toContain(
      'via drag & drop',
    )
    expect(toastCopy(make({ method: 'unknown' })).description).toContain(
      'via an unknown route',
    )
  })

  it('quotes the preview alongside the method', () => {
    expect(toastCopy(make({ preview: 'acme-corp' })).description).toBe(
      'via keyboard · “acme-corp”',
    )
  })

  it('drops the quoted part when there is nothing to show', () => {
    expect(toastCopy(make({ preview: '' })).description).toBe('via keyboard')
  })
})

describe('non-text clipboards', () => {
  it('counts files rather than characters', () => {
    expect(
      toastCopy(make({ payloadKind: 'files', files: 3, chars: 0 })).title,
    ).toBe('Pasted 3 files into Email')
  })

  it('says "1 file", not "1 files"', () => {
    expect(
      toastCopy(make({ payloadKind: 'files', files: 1, chars: 0 })).title,
    ).toBe('Pasted 1 file into Email')
  })

  it('notes when the clipboard was rich text rather than plain', () => {
    expect(
      toastCopy(make({ payloadKind: 'html', chars: 12 })).description,
    ).toContain('formatted text')
  })

  it('is honest about an empty clipboard instead of reporting 0 chars', () => {
    expect(toastCopy(make({ payloadKind: 'empty', chars: 0 })).title).toBe(
      'Pasted nothing into Email',
    )
  })
})

describe('toast severity', () => {
  it('treats text arriving in a field as the noteworthy case', () => {
    expect(toastCopy(make({ type: 'paste' })).level).toBe('warning')
    expect(toastCopy(make({ type: 'drop' })).level).toBe('warning')
  })

  it('treats text leaving a field as informational', () => {
    expect(toastCopy(make({ type: 'copy' })).level).toBe('info')
    expect(toastCopy(make({ type: 'cut' })).level).toBe('info')
  })
})

describe('how long a toast stays', () => {
  const settings = (over = {}) => ({
    keepToastsOpen: false,
    toastSeconds: DEFAULT_TOAST_SECONDS,
    ...over,
  })

  it('converts the chosen seconds into milliseconds', () => {
    expect(toastDuration(settings({ toastSeconds: 9 }))).toBe(9_000)
  })

  it('stays on screen indefinitely when pinned', () => {
    expect(toastDuration(settings({ keepToastsOpen: true }))).toBe(Infinity)
  })

  it('ignores the seconds entirely while pinned', () => {
    expect(
      toastDuration(settings({ keepToastsOpen: true, toastSeconds: 2 })),
    ).toBe(Infinity)
  })

  it('clamps a value typed outside the sane range', () => {
    expect(toastDuration(settings({ toastSeconds: 0 }))).toBe(
      MIN_TOAST_SECONDS * 1_000,
    )
    expect(toastDuration(settings({ toastSeconds: 9_999 }))).toBe(
      MAX_TOAST_SECONDS * 1_000,
    )
  })
})

describe('clampToastSeconds', () => {
  it('passes a sane value through', () => {
    expect(clampToastSeconds(8)).toBe(8)
  })

  it('pulls out-of-range values to the nearest bound', () => {
    expect(clampToastSeconds(-5)).toBe(MIN_TOAST_SECONDS)
    expect(clampToastSeconds(10_000)).toBe(MAX_TOAST_SECONDS)
  })

  it('falls back to the default for anything not a number', () => {
    // A cleared number input reports '' -> NaN; that must not become a
    // zero-duration toast that vanishes before it can be read.
    expect(clampToastSeconds(Number.NaN)).toBe(DEFAULT_TOAST_SECONDS)
    expect(clampToastSeconds(Number.POSITIVE_INFINITY)).toBe(MAX_TOAST_SECONDS)
  })

  it('rounds fractional input', () => {
    expect(clampToastSeconds(4.6)).toBe(5)
  })
})

describe('blocked pastes', () => {
  it('leads with the refusal and names the field', () => {
    const copy = blockedCopy({
      label: 'Confirm email',
      kind: 'input',
      sensitive: false,
    })

    expect(copy.title).toBe('Paste blocked')
    expect(copy.description).toBe('Confirm email does not accept pasted text')
  })
})
