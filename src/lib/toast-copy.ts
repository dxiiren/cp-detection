import type {
  ClipboardEventRecord,
  ClipboardEventType,
  ClipboardMethod,
  ClipboardTarget,
} from './types'

export interface ToastCopy {
  title: string
  description: string
  level: 'info' | 'warning'
}

/** Sonner's own default. Long enough to read a short line, short enough not to pile up. */
export const DEFAULT_TOAST_SECONDS = 4
/** Below this a toast flashes and vanishes, which reads as "detection broke". */
export const MIN_TOAST_SECONDS = 1
/** Past a minute, pin it instead — that is what `keepToastsOpen` is for. */
export const MAX_TOAST_SECONDS = 60

export interface ToastTimingSettings {
  keepToastsOpen: boolean
  toastSeconds: number
}

/**
 * Coerces whatever a number input produced into a usable dwell time. A cleared
 * field reports '' which becomes NaN; without this that would silently mean a
 * zero-second toast.
 */
export function clampToastSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return Number.isNaN(seconds) ? DEFAULT_TOAST_SECONDS : MAX_TOAST_SECONDS
  }
  return Math.min(
    MAX_TOAST_SECONDS,
    Math.max(MIN_TOAST_SECONDS, Math.round(seconds)),
  )
}

/** Milliseconds for sonner, or Infinity when the user has pinned toasts open. */
export function toastDuration(settings: ToastTimingSettings): number {
  if (settings.keepToastsOpen) return Infinity
  return clampToastSeconds(settings.toastSeconds) * 1_000
}

const VERB: Record<ClipboardEventType, string> = {
  paste: 'Pasted',
  copy: 'Copied',
  cut: 'Cut',
  drop: 'Dropped',
}

/** Text arriving in a field is the interesting direction; leaving it is not. */
const DIRECTION: Record<ClipboardEventType, 'into' | 'from'> = {
  paste: 'into',
  drop: 'into',
  copy: 'from',
  cut: 'from',
}

const METHOD: Record<ClipboardMethod, string> = {
  keyboard: 'keyboard',
  'right-click': 'right-click',
  drag: 'drag & drop',
  unknown: 'an unknown route',
}

const plural = (n: number, noun: string) =>
  n === 1 ? `1 ${noun}` : `${n} ${noun}s`

/**
 * What was moved, in the unit that actually makes sense for it. Reporting an
 * image as "0 chars" reads as a detector that failed rather than a paste that
 * carried a file.
 */
function quantity(record: ClipboardEventRecord): string {
  if (record.payloadKind === 'files') return plural(record.files, 'file')
  if (record.payloadKind === 'empty') return 'nothing'
  return plural(record.chars, 'char')
}

export function toastCopy(record: ClipboardEventRecord): ToastCopy {
  const via = `via ${METHOD[record.method]}`
  const shape = record.payloadKind === 'html' ? `${via} · formatted text` : via

  return {
    title: `${VERB[record.type]} ${quantity(record)} ${
      DIRECTION[record.type]
    } ${record.targetLabel}`,
    description: record.preview ? `${shape} · “${record.preview}”` : shape,
    level:
      record.type === 'paste' || record.type === 'drop' ? 'warning' : 'info',
  }
}

export function blockedCopy(target: ClipboardTarget) {
  return {
    title: 'Paste blocked',
    description: `${target.label} does not accept pasted text`,
  }
}
