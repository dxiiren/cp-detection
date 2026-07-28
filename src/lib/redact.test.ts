import { describe, expect, it } from 'vitest'
import {
  CLIENT_PREVIEW_LIMIT,
  SERVER_PREVIEW_LIMIT,
  previewOf,
  sanitizeIncomingPayload,
  toServerPayload,
} from './redact'
import type { ClipboardEventRecord } from './types'

const record: ClipboardEventRecord = {
  id: 'e1',
  type: 'paste',
  method: 'keyboard',
  targetLabel: 'Email',
  targetKind: 'input',
  chars: 34,
  preview: 'acme-corp-invoice-2026@example.com',
  payloadKind: 'text',
  files: 0,
  trusted: true,
  at: 1_700_000_000_000,
}

describe('previewOf', () => {
  it('leaves short text alone', () => {
    expect(previewOf('hello')).toBe('hello')
  })

  it('leaves text of exactly the limit alone', () => {
    const exact = 'x'.repeat(SERVER_PREVIEW_LIMIT)
    expect(previewOf(exact, SERVER_PREVIEW_LIMIT)).toBe(exact)
  })

  it('truncates past the limit and marks the elision', () => {
    const long = 'x'.repeat(SERVER_PREVIEW_LIMIT + 20)
    const result = previewOf(long, SERVER_PREVIEW_LIMIT)
    expect(result).toBe('x'.repeat(SERVER_PREVIEW_LIMIT) + '…')
  })

  it('cuts at a word boundary rather than mid-word', () => {
    // A preview that stops halfway through a word reads as broken text
    // rather than as a deliberate excerpt.
    const text = 'ForcePaste Smart Clipboard Typer simulates real typing'

    expect(previewOf(text, 30)).toBe('ForcePaste Smart Clipboard…')
  })

  it('falls back to a hard cut when one word is longer than the limit', () => {
    expect(previewOf('x'.repeat(50), 10)).toBe('xxxxxxxxxx…')
  })

  it('does not leave trailing punctuation dangling on the cut', () => {
    expect(previewOf('one, two, three, four', 12)).toBe('one, two…')
  })

  it('collapses whitespace so a pasted block does not wreck the toast', () => {
    expect(previewOf('  line one\n\n\tline two  ')).toBe('line one line two')
  })

  it('survives an empty string', () => {
    expect(previewOf('')).toBe('')
  })

  it('does not chew through a multi-megabyte paste', () => {
    // Someone pastes a CSV. Running a whitespace regex over the whole string
    // to produce an 80-character excerpt blocks the main thread for no reason;
    // only the head of the string can ever be shown.
    const huge = 'lorem ipsum '.repeat(400_000) // ~4.8 MB

    const started = performance.now()
    const result = previewOf(huge, 80)
    const elapsed = performance.now() - started

    expect(result.length).toBeLessThanOrEqual(81)
    expect(elapsed, `previewOf took ${Math.round(elapsed)}ms`).toBeLessThan(50)
  })

  it('shows a person far more of their own clipboard than it ever sends', () => {
    // Your screen is not the network. The client keeps a generous excerpt so
    // the toast is readable; the server cap stays tight regardless.
    expect(CLIENT_PREVIEW_LIMIT).toBeGreaterThan(SERVER_PREVIEW_LIMIT)
  })
})

describe('toServerPayload', () => {
  it('omits the preview key entirely when previews are not opted in', () => {
    const payload = toServerPayload(record, { sendPreview: false })

    expect('preview' in payload).toBe(false)
    expect(JSON.stringify(payload)).not.toContain('acme-corp')
  })

  it('still reports the shape of the paste without its contents', () => {
    const payload = toServerPayload(record, { sendPreview: false })

    expect(payload).toEqual({
      id: 'e1',
      type: 'paste',
      method: 'keyboard',
      targetLabel: 'Email',
      targetKind: 'input',
      chars: 34,
      payloadKind: 'text',
      files: 0,
      trusted: true,
      at: 1_700_000_000_000,
    })
  })

  it('always tells the server whether the event was genuine', () => {
    // Trust is metadata about the event, not clipboard contents — a
    // script-generated paste is exactly what a server most wants to know
    // about, so it travels regardless of the preview setting.
    const scripted = { ...record, trusted: false }

    expect(toServerPayload(scripted, { sendPreview: false }).trusted).toBe(
      false,
    )
    expect(toServerPayload(scripted, { sendPreview: true }).trusted).toBe(false)
  })

  it('includes a truncated preview only when explicitly opted in', () => {
    const long = { ...record, preview: 'y'.repeat(200), chars: 200 }
    const payload = toServerPayload(long, { sendPreview: true })

    expect(payload.preview).toBe('y'.repeat(SERVER_PREVIEW_LIMIT) + '…')
  })

  it('never carries text beyond the preview limit, opted in or not', () => {
    const secret = 'p'.repeat(5_000)
    const leaked = toServerPayload(
      { ...record, preview: secret, chars: secret.length },
      { sendPreview: true },
    )

    expect((leaked.preview ?? '').length).toBeLessThanOrEqual(
      SERVER_PREVIEW_LIMIT + 1,
    )
  })
})

// The client is not the only place this can go wrong. A bug or a hand-rolled
// request could post the whole clipboard; the server should refuse it on its
// own terms rather than trusting the sender to have redacted anything.
describe('sanitizeIncomingPayload', () => {
  const wire = {
    id: 'e1',
    type: 'paste',
    method: 'keyboard',
    targetLabel: 'Email',
    targetKind: 'input',
    chars: 34,
    payloadKind: 'text',
    files: 0,
    trusted: true,
    at: 1_700_000_000_000,
  }

  it('accepts a well-formed payload unchanged', () => {
    expect(sanitizeIncomingPayload(wire)).toEqual(wire)
  })

  it('drops fields it never asked for', () => {
    const sneaky = { ...wire, text: 'the entire clipboard', cookie: 'abc' }

    const clean = sanitizeIncomingPayload(sneaky)

    expect(clean).toEqual(wire)
    expect(JSON.stringify(clean)).not.toContain('entire clipboard')
  })

  it('truncates an oversized preview instead of storing it', () => {
    const clean = sanitizeIncomingPayload({
      ...wire,
      preview: 'z'.repeat(9_999),
    })

    expect(clean.preview).toBe('z'.repeat(SERVER_PREVIEW_LIMIT) + '…')
  })

  it('rejects a payload missing the fields that make it meaningful', () => {
    expect(() => sanitizeIncomingPayload({ id: 'e1' })).toThrow()
    expect(() => sanitizeIncomingPayload(null)).toThrow()
  })

  it('rejects an unknown event type or method rather than storing it', () => {
    expect(() =>
      sanitizeIncomingPayload({ ...wire, type: 'exfiltrate' }),
    ).toThrow()
    expect(() =>
      sanitizeIncomingPayload({ ...wire, method: 'telepathy' }),
    ).toThrow()
  })

  it('refuses a payload that does not state whether it was genuine', () => {
    // Defaulting a missing flag to `true` would let a scripted client hide
    // simply by omitting the field.
    expect(() => sanitizeIncomingPayload({ ...wire, trusted: 'yes' })).toThrow()
    const { trusted: _omitted, ...withoutTrust } = wire
    expect(() => sanitizeIncomingPayload(withoutTrust)).toThrow()
  })

  it('refuses a negative or non-numeric character count', () => {
    expect(() => sanitizeIncomingPayload({ ...wire, chars: -1 })).toThrow()
    expect(() => sanitizeIncomingPayload({ ...wire, chars: 'lots' })).toThrow()
  })
})
