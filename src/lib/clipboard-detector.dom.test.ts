import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installClipboardDetector } from './clipboard-detector'
import type { ClipboardEventRecord } from './types'

/**
 * jsdom does not implement ClipboardEvent/DataTransfer faithfully, so these
 * specs hand the adapter the shape it actually reads: an event carrying
 * something with getData(). Real clipboard fidelity is the Playwright suite's
 * job — see tests/e2e/clipboard.spec.ts.
 */
function clipboardEvent(type: string, text: string) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  })
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  })
  return event
}

function transferEvent(type: string, text: string, inputType?: string) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  })
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: () => text },
  })
  if (inputType) Object.defineProperty(event, 'inputType', { value: inputType })
  return event
}

const shortcut = (key: string, over: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    bubbles: true,
    ...over,
  })

let events: Array<ClipboardEventRecord>
let clock: number
let teardown: () => void = () => {}

const field = () => document.querySelector('#email') as HTMLInputElement

function install(over: Parameters<typeof installClipboardDetector>[0] = {}) {
  teardown = installClipboardDetector({
    onEvent: (record) => events.push(record),
    now: () => clock,
    ...over,
  })
}

beforeEach(() => {
  events = []
  clock = 1_700_000_000_000
  document.body.innerHTML = `
    <label for="email">Email</label>
    <input id="email" />
    <div id="outside">prose</div>
  `
})

afterEach(() => {
  teardown()
  document.body.innerHTML = ''
})

describe('installClipboardDetector', () => {
  it('detects a paste on a field it was never bound to', () => {
    install()
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'paste',
      targetLabel: 'Email',
      targetKind: 'input',
      chars: 5,
    })
  })

  it('attributes a paste that follows the shortcut to the keyboard', () => {
    install()
    field().dispatchEvent(shortcut('v'))
    clock += 20
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events[0].method).toBe('keyboard')
  })

  it('attributes a paste with no shortcut to right-click', () => {
    install()
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events[0].method).toBe('right-click')
  })

  it('reports copy and cut', () => {
    install()
    field().dispatchEvent(clipboardEvent('copy', 'hello'))
    field().dispatchEvent(clipboardEvent('cut', 'hello'))

    expect(events.map((e) => e.type)).toEqual(['copy', 'cut'])
  })

  it('measures a copy by what is selected, not by clipboardData', () => {
    // During copy/cut the ClipboardEvent's data is for *writing*: reading it
    // back yields "". The copied text has to come from the selection instead.
    install()
    const input = field()
    input.value = 'abcdefghij'
    input.setSelectionRange(2, 7)

    input.dispatchEvent(clipboardEvent('copy', ''))

    expect(events[0]).toMatchObject({
      type: 'copy',
      chars: 5,
      preview: 'cdefg',
    })
  })

  it('measures a cut the same way', () => {
    install()
    const input = field()
    input.value = 'abcdefghij'
    input.setSelectionRange(0, 10)

    input.dispatchEvent(clipboardEvent('cut', ''))

    expect(events[0]).toMatchObject({ type: 'cut', chars: 10 })
  })

  it('falls back to clipboardData when a page overrides the copy', () => {
    install()
    const input = field()
    input.value = ''

    input.dispatchEvent(clipboardEvent('copy', 'page-supplied'))

    expect(events[0].chars).toBe(13)
  })

  it('reports a drop', () => {
    install()
    field().dispatchEvent(transferEvent('drop', 'dragged'))

    expect(events[0]).toMatchObject({ type: 'drop', method: 'drag' })
  })

  it('logs one record when a paste is followed by its beforeinput', () => {
    install()
    field().dispatchEvent(clipboardEvent('paste', 'hello'))
    clock += 2
    field().dispatchEvent(
      transferEvent('beforeinput', 'hello', 'insertFromPaste'),
    )

    expect(events).toHaveLength(1)
  })

  it('catches a paste that only surfaces as beforeinput', () => {
    install()
    field().dispatchEvent(
      transferEvent('beforeinput', 'hello', 'insertFromPaste'),
    )

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('paste')
  })

  it('ignores ordinary typing', () => {
    install()
    field().dispatchEvent(transferEvent('beforeinput', 'h', 'insertText'))

    expect(events).toEqual([])
  })

  it('sees events even when a field handler stops propagation', () => {
    install()
    field().addEventListener('paste', (e) => e.stopPropagation())
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events).toHaveLength(1)
  })

  it('still logs a copy from ordinary page text', () => {
    install()
    document
      .querySelector('#outside')!
      .dispatchEvent(clipboardEvent('copy', 'prose'))

    expect(events[0]).toMatchObject({
      type: 'copy',
      targetKind: 'document',
      targetLabel: 'the page',
    })
  })

  it('marks a dispatched event as not genuine', () => {
    // Every event in this file is synthetic, so isTrusted is false throughout.
    // Real user events set it true — that difference is exactly what an exam
    // platform checks, so it is recorded rather than filtered on. Filtering
    // would silently hide the interesting cases.
    install()
    field().dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events[0].trusted).toBe(false)
  })

  it('mints ids that stay unique across page loads', () => {
    // The server dedupes by id, so a per-instance counter is not enough: a
    // fresh page starting again at 1 would have its events silently discarded
    // as replays of the previous visitor's.
    install()
    field().dispatchEvent(clipboardEvent('paste', 'first'))
    teardown()

    const second: Array<ClipboardEventRecord> = []
    const stop = installClipboardDetector({
      onEvent: (record) => second.push(record),
      now: () => clock,
    })
    field().dispatchEvent(clipboardEvent('paste', 'second'))
    stop()

    expect(events[0].id).not.toBe(second[0].id)
  })

  it('sees the real field inside a shadow root, not its host', () => {
    // Event retargeting rewrites `target` to the shadow HOST, so a paste into
    // a web component's input would be labelled as the component. The composed
    // path still holds the element the user actually typed into.
    install()
    const host = document.createElement('div')
    host.id = 'widget'
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const inner = document.createElement('input')
    inner.setAttribute('aria-label', 'Card number')
    shadow.append(inner)

    inner.dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events[0]).toMatchObject({
      targetLabel: 'Card number',
      targetKind: 'input',
    })
  })

  it('stops listening after teardown', () => {
    install()
    teardown()
    field().dispatchEvent(clipboardEvent('paste', 'hello'))
    field().dispatchEvent(transferEvent('drop', 'dragged'))
    field().dispatchEvent(shortcut('v'))

    expect(events).toEqual([])
  })
})

describe('what was actually on the clipboard', () => {
  /** A clipboard carrying files, and optionally some text alongside them. */
  function payloadEvent(
    type: string,
    { text = '', html = '', files = 0 } = {},
  ) {
    const event = new Event(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
    })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (format: string) =>
          format === 'text/html' ? html : format === 'text/plain' ? text : '',
        types: [
          ...(text ? ['text/plain'] : []),
          ...(html ? ['text/html'] : []),
          ...(files ? ['Files'] : []),
        ],
        files: { length: files },
      },
    })
    return event
  }

  it('reports plain text as text', () => {
    install()
    field().dispatchEvent(payloadEvent('paste', { text: 'hello' }))

    expect(events[0]).toMatchObject({ payloadKind: 'text', chars: 5, files: 0 })
  })

  it('recognises a pasted image or file, which carries no text at all', () => {
    // Reading only text/plain reported this as "Pasted 0 chars", which reads
    // as a detector that failed rather than a paste that held a file.
    install()
    field().dispatchEvent(payloadEvent('paste', { files: 2 }))

    expect(events[0]).toMatchObject({
      payloadKind: 'files',
      files: 2,
      chars: 0,
    })
  })

  it('falls back to the HTML flavour when there is no plain text', () => {
    // Copying from Word or Excel can leave text/plain empty while text/html
    // holds the content.
    install()
    field().dispatchEvent(
      payloadEvent('paste', { html: '<p>Hello <b>there</b></p>' }),
    )

    expect(events[0]).toMatchObject({ payloadKind: 'html' })
    expect(events[0].preview).toBe('Hello there')
    expect(events[0].chars).toBe(11)
  })

  it('prefers plain text when the clipboard carries both', () => {
    install()
    field().dispatchEvent(
      payloadEvent('paste', { text: 'plain', html: '<b>rich</b>' }),
    )

    expect(events[0]).toMatchObject({ payloadKind: 'text', chars: 5 })
  })

  it('reports a genuinely empty clipboard as empty', () => {
    install()
    field().dispatchEvent(payloadEvent('paste', {}))

    expect(events[0]).toMatchObject({ payloadKind: 'empty', chars: 0 })
  })
})

describe('sensitive fields', () => {
  it('counts a paste into a password field but never keeps its contents', () => {
    // The whole point of this app is that it does not hoard clipboard text.
    // A password field is where that promise actually matters.
    install()
    document.body.insertAdjacentHTML(
      'beforeend',
      '<label for="pw">Password</label><input id="pw" type="password" />',
    )
    const pw = document.querySelector('#pw')!

    pw.dispatchEvent(clipboardEvent('paste', 'hunter2-correct-horse'))

    expect(events[0]).toMatchObject({
      targetLabel: 'Password',
      chars: 21,
      preview: '',
    })
    expect(JSON.stringify(events)).not.toContain('hunter2')
  })

  it('withholds contents from a field the page flagged sensitive', () => {
    install()
    document.body.insertAdjacentHTML(
      'beforeend',
      '<input id="acct" aria-label="Account number" data-sensitive />',
    )

    document
      .querySelector('#acct')!
      .dispatchEvent(clipboardEvent('paste', '4111111111111111'))

    expect(events[0].preview).toBe('')
    expect(events[0].chars).toBe(16)
  })
})

describe('same-origin iframes', () => {
  /**
   * Attaches an iframe and waits a tick.
   *
   * New frames are found by a MutationObserver, whose callbacks are
   * microtasks, so a frame is watched on the tick after it appears rather than
   * synchronously. That is the real shape of it: frames are mounted during a
   * render and pasted into much later.
   */
  async function addIframe(id: string) {
    const frame = document.createElement('iframe')
    frame.id = id
    document.body.append(frame)
    const inner = frame.contentDocument!
    inner.body.innerHTML =
      '<label for="inner">Card number</label><input id="inner" />'
    await Promise.resolve()
    return { frame, inner }
  }

  it('detects a paste inside a same-origin iframe', async () => {
    // Events inside an iframe never reach the parent document, so a detector
    // bound only to the top-level page is blind to them entirely.
    install()
    const { inner } = await addIframe('f1')

    inner
      .querySelector('#inner')!
      .dispatchEvent(clipboardEvent('paste', 'hello'))

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      targetLabel: 'Card number',
      targetKind: 'input',
      chars: 5,
    })
  })

  it('picks up an iframe added after it was installed', async () => {
    // Frames appear late — lazily rendered widgets, payment fields.
    install()
    const { inner } = await addIframe('f2')

    inner
      .querySelector('#inner')!
      .dispatchEvent(clipboardEvent('paste', 'later'))

    expect(events).toHaveLength(1)
  })

  it('stops listening inside iframes on teardown', async () => {
    install()
    const { inner } = await addIframe('f3')
    teardown()

    inner
      .querySelector('#inner')!
      .dispatchEvent(clipboardEvent('paste', 'ignored'))

    expect(events).toEqual([])
  })

  it('does not log the same paste once per document', async () => {
    install()
    const { inner } = await addIframe('f4')

    inner
      .querySelector('#inner')!
      .dispatchEvent(clipboardEvent('paste', 'once'))

    expect(events).toHaveLength(1)
  })

  it('carries on when a frame cannot be reached', () => {
    // A cross-origin frame throws on contentDocument. That must not take the
    // detector down with it — the rest of the page still needs watching.
    install()
    const hostile = document.createElement('iframe')
    Object.defineProperty(hostile, 'contentDocument', {
      get() {
        throw new Error('cross-origin')
      },
    })
    document.body.append(hostile)

    expect(() =>
      field().dispatchEvent(clipboardEvent('paste', 'still works')),
    ).not.toThrow()
    expect(events).toHaveLength(1)
  })
})

describe('blocking a protected field', () => {
  it('cancels the paste and reports it as blocked', () => {
    const onBlocked = vi.fn()
    install({ shouldBlock: (el) => el.id === 'email', onBlocked })

    const event = clipboardEvent('paste', 'hello')
    field().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(onBlocked).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Email' }),
    )
    expect(events).toEqual([])
  })

  it('also cancels the beforeinput a blocked paste would produce', () => {
    install({ shouldBlock: () => true, onBlocked: vi.fn() })

    const event = transferEvent('beforeinput', 'hello', 'insertFromPaste')
    field().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(events).toEqual([])
  })

  it('leaves copy and cut alone on a protected field', () => {
    install({ shouldBlock: () => true, onBlocked: vi.fn() })

    const event = clipboardEvent('copy', 'hello')
    field().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(events).toHaveLength(1)
  })

  it('does not block when the predicate says no', () => {
    install({ shouldBlock: () => false, onBlocked: vi.fn() })

    const event = clipboardEvent('paste', 'hello')
    field().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(events).toHaveLength(1)
  })
})
