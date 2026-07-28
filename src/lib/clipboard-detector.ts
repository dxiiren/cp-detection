import { classifyShortcut, createAttributor } from './attribution'
import { describeTarget, isElement, tagOf } from './describe-target'
import type {
  ClipboardEventRecord,
  ClipboardTarget,
  PayloadKind,
} from './types'

export interface DetectorOptions {
  /** Called once per detected clipboard action. */
  onEvent?: (record: ClipboardEventRecord) => void
  /** Return true to refuse a paste into this element. */
  shouldBlock?: (element: Element) => boolean
  /** Called instead of `onEvent` when a paste was refused. */
  onBlocked?: (target: ClipboardTarget) => void
  /** Injected for tests; production uses the wall clock. */
  now?: () => number
  windowMs?: number
  doc?: Document | null
}

const noop = () => {}

/** The shape both ClipboardEvent.clipboardData and DragEvent.dataTransfer share. */
interface TransferLike {
  getData: (type: string) => string
  types?: ReadonlyArray<string>
  files?: { length: number }
}

const textFrom = (source: TransferLike | null | undefined) =>
  source?.getData('text/plain') ?? ''

/** Turns markup into the text a person would see, for a length worth reporting. */
function textFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * What was actually on the clipboard.
 *
 * Reading only `text/plain` reported an image as "Pasted 0 chars" — which
 * reads as a detector that failed rather than a paste that held a file. Word
 * and Excel can likewise leave `text/plain` empty while `text/html` carries
 * everything.
 */
function readPayload(source: TransferLike | null | undefined): {
  text: string
  kind: PayloadKind
  files: number
} {
  const text = textFrom(source)
  if (text) return { text, kind: 'text', files: 0 }

  const files = source?.files?.length ?? 0
  if (files > 0) return { text: '', kind: 'files', files }

  const html = source?.getData('text/html') ?? ''
  if (html) return { text: textFromHtml(html), kind: 'html', files: 0 }

  return { text: '', kind: 'empty', files: 0 }
}

/**
 * The element the user actually interacted with.
 *
 * Shadow DOM retargets `event.target` to the shadow HOST, so a paste into a
 * web component's input would be attributed to the component rather than the
 * field. The composed path still starts at the real element.
 */
function realTarget(event: Event): EventTarget | null {
  // Empty for an event that has finished dispatching; fall back to `target`
  // rather than returning undefined.
  const path = event.composedPath()
  return path.length > 0 ? path[0] : event.target
}

/**
 * What the user actually copied.
 *
 * A ClipboardEvent's `clipboardData` is write-only during copy/cut — reading
 * it back gives "" unless the page deliberately overrode the copy. So the
 * length has to come from the selection: from the field's own selection range
 * for inputs and textareas, whose internal selection is invisible to
 * `getSelection()`, and from the document selection otherwise.
 */
function selectedText(target: EventTarget | null, doc: Document): string {
  // Tag names rather than `instanceof`: an element inside an iframe belongs to
  // that frame's realm and fails every instanceof check made from this one.
  if (isElement(target) && ['input', 'textarea'].includes(tagOf(target))) {
    const field = target as HTMLInputElement
    const { selectionStart, selectionEnd, value } = field
    if (selectionStart !== null && selectionEnd !== null) {
      return value.slice(selectionStart, selectionEnd)
    }
  }
  // The selection lives in the document the element belongs to, which is not
  // necessarily the top-level one.
  const owner = isElement(target) ? target.ownerDocument : doc
  return owner.getSelection()?.toString() ?? ''
}

/**
 * Translates DOM events into the plain records `attribution.ts` understands.
 * Deliberately thin: every decision worth testing lives upstream of here.
 *
 * Listeners are attached to the document in the CAPTURE phase, which is what
 * makes "detects on any input" true — the event is observed on the way down,
 * before a field's own handler can stopPropagation() or preventDefault() it.
 */
export function installClipboardDetector(
  options: DetectorOptions = {},
): () => void {
  const doc = options.doc ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return noop // server render: nothing to listen to

  const {
    onEvent = noop,
    onBlocked = noop,
    shouldBlock,
    now = () => Date.now(),
    windowMs,
  } = options

  // Record ids double as the server's dedupe key, so they must not repeat
  // across page loads. The randomness lives here rather than in
  // `attribution.ts`, which stays deterministic for its unit specs.
  // Not crypto.randomUUID(): that is undefined outside a secure context, and
  // this needs to work when the demo is served over plain HTTP on a LAN.
  const attributor = createAttributor({
    windowMs,
    idPrefix: Math.random().toString(36).slice(2, 10),
  })
  const emit = (record: ClipboardEventRecord | null) => {
    if (record) onEvent(record)
  }

  const blocked = (event: Event) => {
    const el = realTarget(event)
    if (!shouldBlock || !isElement(el) || !shouldBlock(el)) {
      return false
    }
    event.preventDefault()
    onBlocked(describeTarget(el))
    return true
  }

  const onKeyDown = (event: Event) => {
    const action = classifyShortcut(event as KeyboardEvent)
    if (action) attributor.observe({ kind: 'shortcut', action, at: now() })
  }

  const onClipboard = (type: 'copy' | 'cut' | 'paste') => (event: Event) => {
    // Only paste is refusable — blocking a copy would just be user-hostile.
    if (type === 'paste' && blocked(event)) return

    const node = realTarget(event)
    const payload = readPayload((event as ClipboardEvent).clipboardData)
    const selected = type === 'paste' ? '' : selectedText(node, doc)
    const text = selected || payload.text

    emit(
      attributor.observe({
        kind: 'clipboard',
        type,
        text,
        payloadKind: selected ? 'text' : payload.kind,
        files: payload.files,
        target: describeTarget(node),
        at: now(),
        trusted: event.isTrusted,
      }),
    )
  }

  const onDrop = (event: Event) => {
    const node = realTarget(event)
    const payload = readPayload((event as DragEvent).dataTransfer)

    emit(
      attributor.observe({
        kind: 'drop',
        text: payload.text,
        payloadKind: payload.kind,
        files: payload.files,
        target: describeTarget(node),
        at: now(),
        trusted: event.isTrusted,
      }),
    )
  }

  const onBeforeInput = (event: Event) => {
    const { inputType, dataTransfer, data } = event as InputEvent
    if (inputType === 'insertFromPaste' && blocked(event)) return

    const payload = readPayload(dataTransfer)
    const text = payload.text || (data ?? '')

    emit(
      attributor.observe({
        kind: 'insert',
        inputType,
        text,
        payloadKind: text
          ? payload.kind === 'empty'
            ? 'text'
            : payload.kind
          : payload.kind,
        files: payload.files,
        target: describeTarget(realTarget(event)),
        at: now(),
        trusted: event.isTrusted,
      }),
    )
  }

  const listeners: Array<[string, EventListener]> = [
    ['keydown', onKeyDown],
    ['copy', onClipboard('copy')],
    ['cut', onClipboard('cut')],
    ['paste', onClipboard('paste')],
    ['drop', onDrop],
    ['beforeinput', onBeforeInput],
  ]

  /**
   * Every document being watched. An iframe is a separate document with its
   * own event path — nothing inside one ever reaches the parent — so a
   * detector bound only to the top-level page is blind to a paste into any
   * embedded field. Payment forms and third-party widgets are exactly that.
   *
   * Cross-origin frames are unreachable by design and are skipped; nothing can
   * be done about them from here, and trying must not break the rest.
   */
  const watched = new Set<Document>()

  const watch = (target: Document) => {
    if (watched.has(target)) return
    watched.add(target)
    for (const [type, handler] of listeners) {
      target.addEventListener(type, handler, true)
    }
  }

  const watchFrames = (root: Document) => {
    for (const frame of Array.from(root.querySelectorAll('iframe'))) {
      try {
        const inner = frame.contentDocument
        // `about:blank` frames report a document before they have navigated;
        // re-checking on load is what catches them once they have.
        if (inner) watch(inner)
        frame.addEventListener('load', () => {
          try {
            if (frame.contentDocument) watch(frame.contentDocument)
          } catch {
            // Navigated somewhere cross-origin. Nothing to do.
          }
        })
      } catch {
        // Cross-origin from the start.
      }
    }
  }

  watch(doc)
  watchFrames(doc)

  // Frames appear late: lazily rendered widgets, a card field mounted after a
  // user picks a payment method.
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => watchFrames(doc))
  observer?.observe(doc.documentElement, { childList: true, subtree: true })

  return () => {
    observer?.disconnect()
    for (const target of watched) {
      for (const [type, handler] of listeners) {
        target.removeEventListener(type, handler, true)
      }
    }
    watched.clear()
  }
}
