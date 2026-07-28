import { Store } from '@tanstack/store'
import { DEFAULT_TOAST_SECONDS, clampToastSeconds } from './toast-copy'
import type { ClipboardEventRecord } from './types'

/** Enough log to be useful in a demo, bounded so a held-down Ctrl+V cannot grow it forever. */
export const MAX_EVENTS = 200

export interface ClipboardSettings {
  /** Whether fields marked as protected actually refuse a paste. */
  blockProtectedFields: boolean
  /**
   * Off by default. Turning this on sends a truncated excerpt of clipboard
   * text to the server; see `toServerPayload` in redact.ts.
   */
  sendPreviewToServer: boolean
  /** Pin toasts on screen until dismissed, ignoring `toastSeconds`. */
  keepToastsOpen: boolean
  /** How long a toast stays, in seconds. Clamped on write by `setSetting`. */
  toastSeconds: number
}

export interface ClipboardState {
  events: Array<ClipboardEventRecord>
  settings: ClipboardSettings
}

const initialState = (): ClipboardState => ({
  events: [],
  settings: {
    blockProtectedFields: true,
    sendPreviewToServer: false,
    keepToastsOpen: false,
    toastSeconds: DEFAULT_TOAST_SECONDS,
  },
})

export const clipboardStore = new Store<ClipboardState>(initialState())

export function recordEvent(record: ClipboardEventRecord) {
  clipboardStore.setState((state) => ({
    ...state,
    events: [record, ...state.events].slice(0, MAX_EVENTS),
  }))
}

export function clearEvents() {
  clipboardStore.setState((state) => ({ ...state, events: [] }))
}

export function setSetting<TKey extends keyof ClipboardSettings>(
  key: TKey,
  value: ClipboardSettings[TKey],
) {
  // Clamped here rather than only at the input, so a bad value cannot reach
  // the store from anywhere — including a future caller that isn't the form.
  // The cast is load-bearing: TypeScript cannot narrow `value` from the key
  // check, and `eslint --fix` has quietly removed it once already.
  const safe =
    key === 'toastSeconds' ? clampToastSeconds(value as number) : value

  clipboardStore.setState((state) => ({
    ...state,
    settings: { ...state.settings, [key]: safe },
  }))
}

/** Test seam: the store is module-level, so specs need a way back to zero. */
export function resetClipboardStore() {
  clipboardStore.setState(initialState)
}
