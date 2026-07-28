export type ClipboardEventType = 'copy' | 'cut' | 'paste' | 'drop'

/**
 * How the user triggered it. No browser API reports this — it is inferred
 * from event timing in `attribution.ts`, so treat it as a strong guess.
 */
export type ClipboardMethod = 'keyboard' | 'right-click' | 'drag' | 'unknown'

export type TargetKind = 'input' | 'textarea' | 'contenteditable' | 'document'

/** What the clipboard was actually carrying, not just how long it was. */
export type PayloadKind = 'text' | 'html' | 'files' | 'empty'

export interface ClipboardTarget {
  label: string
  kind: TargetKind
  /**
   * A password, one-time code, card number, or anything the page tagged with
   * `data-sensitive`. The event is still logged; its contents never are.
   */
  sensitive: boolean
}

export interface ClipboardEventRecord {
  id: string
  type: ClipboardEventType
  method: ClipboardMethod
  targetLabel: string
  targetKind: TargetKind
  chars: number
  payloadKind: PayloadKind
  /** How many files were on the clipboard; 0 for anything text-shaped. */
  files: number
  /**
   * Truncated. Client-side only unless the user opts into sending it, and
   * always empty for a sensitive field regardless of any setting.
   */
  preview: string
  /**
   * The browser's `Event.isTrusted`: true for a real user action, false for
   * anything a script dispatched. Recorded, never filtered on — an automated
   * paste is the interesting case, not one to hide.
   */
  trusted: boolean
  at: number
}

/** What actually crosses the network. Note the absent `preview` by default. */
export interface ServerEventPayload {
  id: string
  type: ClipboardEventType
  method: ClipboardMethod
  targetLabel: string
  targetKind: TargetKind
  chars: number
  /** Metadata, not content: text vs formatted vs files vs nothing at all. */
  payloadKind: PayloadKind
  files: number
  /**
   * Metadata, not content: whether the browser considered the event genuine.
   * Travels regardless of the preview setting — a script-generated paste is
   * the single thing a server most wants to know about.
   */
  trusted: boolean
  at: number
  preview?: string
}
