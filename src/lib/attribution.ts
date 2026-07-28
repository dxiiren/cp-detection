import { CLIENT_PREVIEW_LIMIT, previewOf } from './redact'
import type {
  ClipboardEventRecord,
  ClipboardMethod,
  ClipboardTarget,
  PayloadKind,
} from './types'

/**
 * How long a keydown or a drop is allowed to explain a clipboard event that
 * follows it. Long enough to cover a slow event loop, short enough that an
 * unrelated earlier keypress cannot take the credit.
 */
export const ATTRIBUTION_WINDOW_MS = 300

/**
 * How long a paste or drop may still claim the InputEvent that echoes it.
 *
 * Far wider than `ATTRIBUTION_WINDOW_MS` because it answers a different
 * question. That window asks "did that Ctrl+V cause this paste?", where being
 * generous means letting an unrelated keypress take the credit. This one asks
 * "is this InputEvent the one the paste I just logged was always going to
 * produce?", and the honest answer is almost always yes — the pair is a single
 * dispatch. Being *ungenerous* here is what costs: a missed suppression logs
 * one paste twice.
 *
 * It is a backstop rather than the mechanism. The suppression is one-shot (see
 * `consumeEcho`), so this only has to stop a token going stale after a paste
 * that never produced an InputEvent at all — a paste into a non-editable
 * target, say — from swallowing an unrelated paste much later.
 */
export const ECHO_WINDOW_MS = 2_000

/** InputEvent types that mean "text arrived from somewhere other than typing". */
const PASTE_INPUT_TYPES = new Set([
  'insertFromPaste',
  'insertFromPasteAsQuotation',
  'insertFromYank',
])
const DROP_INPUT_TYPES = new Set(['insertFromDrop'])

export type ShortcutAction = 'copy' | 'cut' | 'paste'

export interface KeyDescriptor {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export type Signal =
  | { kind: 'shortcut'; action: ShortcutAction; at: number }
  | {
      kind: 'clipboard'
      type: ShortcutAction
      text: string
      target: ClipboardTarget
      at: number
      trusted?: boolean
      payloadKind?: PayloadKind
      files?: number
    }
  | {
      kind: 'drop'
      text: string
      target: ClipboardTarget
      at: number
      trusted?: boolean
      payloadKind?: PayloadKind
      files?: number
    }
  | {
      kind: 'insert'
      inputType: string
      text: string
      target: ClipboardTarget
      at: number
      trusted?: boolean
      payloadKind?: PayloadKind
      files?: number
    }

export interface Attributor {
  /** Returns a record to log, or null when the signal is noise or a duplicate. */
  observe: (signal: Signal) => ClipboardEventRecord | null
}

/**
 * Decides whether a keypress is a clipboard shortcut. Kept separate from the
 * state machine because "is this Ctrl+V?" is a different question from "did
 * that Ctrl+V cause this paste?", and both are easier to get right apart.
 */
export function classifyShortcut(k: KeyDescriptor): ShortcutAction | null {
  const key = k.key.toLowerCase()

  // Shift+Insert is the older paste binding and predates Ctrl+V on some systems.
  if (key === 'insert' && k.shiftKey) return 'paste'

  if (!k.ctrlKey && !k.metaKey) return null
  if (key === 'v') return 'paste'
  if (key === 'c') return 'copy'
  if (key === 'x') return 'cut'
  return null
}

export function createAttributor(
  options: {
    windowMs?: number
    echoWindowMs?: number
    idPrefix?: string
  } = {},
): Attributor {
  const windowMs = options.windowMs ?? ATTRIBUTION_WINDOW_MS
  const echoWindowMs = options.echoWindowMs ?? ECHO_WINDOW_MS
  const idPrefix = options.idPrefix ?? 'evt'

  let seq = 0
  const lastShortcutAt: Record<ShortcutAction, number> = {
    copy: -Infinity,
    cut: -Infinity,
    paste: -Infinity,
  }
  let lastDropAt = -Infinity

  /**
   * Set when a paste or drop is logged, and spent by the InputEvent that
   * echoes it. A token rather than a timestamp comparison, because "have I
   * already logged this action?" is a question about *which* event, not about
   * how long ago: the previous version suppressed anything within 300ms of the
   * last record, which both logged a paste twice when the browser was slow to
   * deliver the InputEvent, and silently dropped a genuine paste-bar paste
   * that happened to follow any other event too closely.
   */
  let pendingEcho: number | null = null

  const withinWindow = (then: number, now: number) => now - then <= windowMs

  /** One shot: whether spent on a real echo or found stale, the token is gone. */
  const consumeEcho = (at: number) => {
    if (pendingEcho === null) return false
    const isEcho = at - pendingEcho <= echoWindowMs
    pendingEcho = null
    return isEcho
  }

  const record = (
    type: ClipboardEventRecord['type'],
    method: ClipboardMethod,
    text: string,
    target: ClipboardTarget,
    at: number,
    // Absent means trust was never measured (a caller other than the DOM
    // adapter). The adapter always supplies it, so this default is for tests.
    trusted = true,
    payloadKind: PayloadKind = 'text',
    files = 0,
  ): ClipboardEventRecord => {
    return {
      id: `${idPrefix}-${++seq}`,
      type,
      method,
      targetLabel: target.label,
      targetKind: target.kind,
      chars: text.length,
      payloadKind,
      files,
      // Sensitive fields are counted but never quoted — not locally, not on
      // the wire, regardless of any setting. That a password was pasted is a
      // detection signal; the password itself is not ours to keep.
      preview: target.sensitive ? '' : previewOf(text, CLIENT_PREVIEW_LIMIT),
      trusted,
      at,
    }
  }

  /**
   * The inference itself. A drag wins over the keyboard because a drop is a
   * far more specific signal; absent either, the user reached for a menu.
   */
  const methodFor = (action: ShortcutAction, at: number): ClipboardMethod => {
    if (action === 'paste' && withinWindow(lastDropAt, at)) return 'drag'
    if (withinWindow(lastShortcutAt[action], at)) return 'keyboard'
    return 'right-click'
  }

  return {
    observe(signal) {
      switch (signal.kind) {
        case 'shortcut':
          lastShortcutAt[signal.action] = signal.at
          return null

        case 'clipboard':
          // Only a paste writes into the field, so only a paste has an
          // InputEvent coming. Arming this for copy and cut is what let a copy
          // suppress the paste that followed it.
          if (signal.type === 'paste') pendingEcho = signal.at
          return record(
            signal.type,
            methodFor(signal.type, signal.at),
            signal.text,
            signal.target,
            signal.at,
            signal.trusted,
            signal.payloadKind,
            signal.files,
          )

        case 'drop':
          lastDropAt = signal.at
          pendingEcho = signal.at
          return record(
            'drop',
            'drag',
            signal.text,
            signal.target,
            signal.at,
            signal.trusted,
            signal.payloadKind,
            signal.files,
          )

        case 'insert': {
          const isPaste = PASTE_INPUT_TYPES.has(signal.inputType)
          const isDrop = DROP_INPUT_TYPES.has(signal.inputType)
          if (!isPaste && !isDrop) return null

          // Already accounted for by the ClipboardEvent or drop that preceded
          // it. Consuming the token here is what makes this survive a slow
          // browser without ever swallowing a second, genuine paste.
          if (consumeEcho(signal.at)) return null

          return isDrop
            ? record(
                'drop',
                'drag',
                signal.text,
                signal.target,
                signal.at,
                signal.trusted,
                signal.payloadKind,
                signal.files,
              )
            : record(
                'paste',
                methodFor('paste', signal.at),
                signal.text,
                signal.target,
                signal.at,
                signal.trusted,
                signal.payloadKind,
                signal.files,
              )
        }
      }
    },
  }
}
