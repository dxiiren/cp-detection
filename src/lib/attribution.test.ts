import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_WINDOW_MS,
  classifyShortcut,
  createAttributor,
} from './attribution'
import { CLIENT_PREVIEW_LIMIT, SERVER_PREVIEW_LIMIT } from './redact'
import type { ClipboardTarget } from './types'

const email: ClipboardTarget = {
  label: 'Email',
  kind: 'input',
  sensitive: false,
}
const T0 = 1_700_000_000_000

const key = (over: Partial<Parameters<typeof classifyShortcut>[0]>) =>
  classifyShortcut({
    key: 'v',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...over,
  })

describe('classifyShortcut', () => {
  it('recognises Ctrl+V and Cmd+V as paste', () => {
    expect(key({ ctrlKey: true })).toBe('paste')
    expect(key({ metaKey: true })).toBe('paste')
  })

  it('recognises Shift+Insert as paste', () => {
    expect(key({ key: 'Insert', shiftKey: true })).toBe('paste')
  })

  it('recognises paste-as-plain-text and capitalised keys', () => {
    expect(key({ ctrlKey: true, shiftKey: true, key: 'V' })).toBe('paste')
  })

  it('recognises copy and cut', () => {
    expect(key({ ctrlKey: true, key: 'c' })).toBe('copy')
    expect(key({ metaKey: true, key: 'x' })).toBe('cut')
  })

  it('ignores unrelated combinations and bare keys', () => {
    expect(key({ ctrlKey: true, key: 'b' })).toBeNull()
    expect(key({})).toBeNull()
    expect(key({ key: 'Insert' })).toBeNull()
  })
})

describe('attribution', () => {
  it('emits nothing for a bare shortcut keypress', () => {
    const a = createAttributor()
    expect(a.observe({ kind: 'shortcut', action: 'paste', at: T0 })).toBeNull()
  })

  it('attributes a paste just after the shortcut to the keyboard', () => {
    const a = createAttributor()
    a.observe({ kind: 'shortcut', action: 'paste', at: T0 })

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0 + 50,
    })

    expect(record).toMatchObject({
      type: 'paste',
      method: 'keyboard',
      targetLabel: 'Email',
      targetKind: 'input',
      chars: 5,
      preview: 'hello',
      at: T0 + 50,
    })
  })

  it('attributes a paste with no recent shortcut to right-click', () => {
    const a = createAttributor()
    a.observe({ kind: 'shortcut', action: 'paste', at: T0 })

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0 + 5_000,
    })

    expect(record?.method).toBe('right-click')
  })

  it('does not let a copy shortcut vouch for a later paste', () => {
    const a = createAttributor()
    a.observe({ kind: 'shortcut', action: 'copy', at: T0 })

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0 + 20,
    })

    expect(record?.method).toBe('right-click')
  })

  it('reports a drop as its own kind of event', () => {
    const a = createAttributor()

    const record = a.observe({
      kind: 'drop',
      text: 'dragged',
      target: email,
      at: T0,
    })

    expect(record).toMatchObject({ type: 'drop', method: 'drag', chars: 7 })
  })

  it('attributes a paste immediately after a drop to the drag', () => {
    const a = createAttributor()
    a.observe({ kind: 'drop', text: 'dragged', target: email, at: T0 })

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'dragged',
      target: email,
      at: T0 + 10,
    })

    expect(record?.method).toBe('drag')
  })

  it('collapses one user action into one record, not two', () => {
    const a = createAttributor()
    a.observe({ kind: 'shortcut', action: 'paste', at: T0 })
    const fromPaste = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0 + 10,
    })
    const fromInsert = a.observe({
      kind: 'insert',
      inputType: 'insertFromPaste',
      text: 'hello',
      target: email,
      at: T0 + 12,
    })

    expect(fromPaste).not.toBeNull()
    expect(fromInsert).toBeNull()
  })

  it('collapses them however long the browser takes to deliver the second', () => {
    // The InputEvent normally follows the ClipboardEvent within a millisecond,
    // but a large paste on a busy main thread stretches the gap — measured at
    // a full second under a loaded test run, which logged the paste twice.
    // Whether the two belong together is not a question about elapsed time.
    const a = createAttributor()
    a.observe({ kind: 'shortcut', action: 'paste', at: T0 })
    a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'x'.repeat(139),
      target: email,
      at: T0 + 10,
    })

    const echo = a.observe({
      kind: 'insert',
      inputType: 'insertFromPaste',
      text: 'x'.repeat(139),
      target: email,
      at: T0 + 1_000,
    })

    expect(echo).toBeNull()
  })

  it('swallows the echo once, not every insert that follows', () => {
    // A second paste arriving by the beforeinput path alone is a real event.
    // Suppressing on "something was emitted recently" drops it.
    const a = createAttributor()
    a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'first',
      target: email,
      at: T0,
    })
    a.observe({
      kind: 'insert',
      inputType: 'insertFromPaste',
      text: 'first',
      target: email,
      at: T0 + 5,
    })

    const second = a.observe({
      kind: 'insert',
      inputType: 'insertFromPaste',
      text: 'second',
      target: email,
      at: T0 + 50,
    })

    expect(second).toMatchObject({ type: 'paste', chars: 6 })
  })

  it('does not let a copy swallow the paste that follows it', () => {
    // Copy and cut have no InputEvent of their own, so they have no echo to
    // suppress — and a paste-bar paste moments later is a separate action.
    const a = createAttributor()
    a.observe({
      kind: 'clipboard',
      type: 'copy',
      text: 'copied',
      target: email,
      at: T0,
    })

    const paste = a.observe({
      kind: 'insert',
      inputType: 'insertFromPaste',
      text: 'pasted',
      target: email,
      at: T0 + 20,
    })

    expect(paste).toMatchObject({ type: 'paste', chars: 6 })
  })

  it('still catches a paste that only surfaces as beforeinput', () => {
    // The mobile paste-bar path: no ClipboardEvent, only an InputEvent.
    const a = createAttributor()

    const record = a.observe({
      kind: 'insert',
      inputType: 'insertFromPaste',
      text: 'hello',
      target: email,
      at: T0,
    })

    expect(record).toMatchObject({ type: 'paste', method: 'right-click' })
  })

  it('does not double-count a drop that also reports insertFromDrop', () => {
    const a = createAttributor()
    a.observe({ kind: 'drop', text: 'dragged', target: email, at: T0 })

    const dupe = a.observe({
      kind: 'insert',
      inputType: 'insertFromDrop',
      text: 'dragged',
      target: email,
      at: T0 + 5,
    })

    expect(dupe).toBeNull()
  })

  it('ignores insertions that are ordinary typing', () => {
    const a = createAttributor()

    expect(
      a.observe({
        kind: 'insert',
        inputType: 'insertText',
        text: 'h',
        target: email,
        at: T0,
      }),
    ).toBeNull()
  })

  it('attributes copy and cut the same way', () => {
    const a = createAttributor()
    a.observe({ kind: 'shortcut', action: 'copy', at: T0 })
    const copied = a.observe({
      kind: 'clipboard',
      type: 'copy',
      text: 'hello',
      target: email,
      at: T0 + 10,
    })
    const cut = a.observe({
      kind: 'clipboard',
      type: 'cut',
      text: 'hello',
      target: email,
      at: T0 + 20,
    })

    expect(copied).toMatchObject({ type: 'copy', method: 'keyboard' })
    expect(cut).toMatchObject({ type: 'cut', method: 'right-click' })
  })

  it('counts the raw characters but keeps only an excerpt', () => {
    const a = createAttributor()
    const long = 'y'.repeat(500)

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: long,
      target: email,
      at: T0,
    })

    expect(record?.chars).toBe(500)
    expect(record?.preview).toBe('y'.repeat(CLIENT_PREVIEW_LIMIT) + '…')
  })

  it('keeps a readable excerpt, not the 80 chars the server is allowed', () => {
    // Regression guard: the client excerpt and the server cap are separate
    // numbers, and a toast truncated to the server's cap reads as cut off.
    const a = createAttributor()

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'word '.repeat(40),
      target: email,
      at: T0,
    })

    expect(record!.preview.length).toBeGreaterThan(SERVER_PREVIEW_LIMIT)
  })

  it("carries the browser's own view of whether the event was genuine", () => {
    const a = createAttributor()

    const scripted = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0,
      trusted: false,
    })

    expect(scripted?.trusted).toBe(false)
  })

  it('assumes genuine when trust was not measured', () => {
    const a = createAttributor()

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0,
    })

    expect(record?.trusted).toBe(true)
  })

  it('gives every record a distinct id', () => {
    const a = createAttributor()
    const ids = [0, 1, 2].map(
      (i) =>
        a.observe({
          kind: 'drop',
          text: 'x',
          target: email,
          at: T0 + i * 1_000,
        })?.id,
    )

    expect(new Set(ids).size).toBe(3)
    expect(ids.every(Boolean)).toBe(true)
  })

  it('honours a custom attribution window', () => {
    const a = createAttributor({ windowMs: 1_000 })
    a.observe({ kind: 'shortcut', action: 'paste', at: T0 })

    const record = a.observe({
      kind: 'clipboard',
      type: 'paste',
      text: 'hello',
      target: email,
      at: T0 + ATTRIBUTION_WINDOW_MS + 200,
    })

    expect(record?.method).toBe('keyboard')
  })
})
