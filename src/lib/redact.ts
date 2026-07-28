import type {
  ClipboardEventRecord,
  ClipboardEventType,
  ClipboardMethod,
  PayloadKind,
  ServerEventPayload,
  TargetKind,
} from './types'

/**
 * Two different limits, because your screen and the network are not the same
 * place. The client keeps a generous excerpt so a toast is actually readable;
 * what may cross the wire stays tight no matter what the client holds.
 */
export const SERVER_PREVIEW_LIMIT = 80
export const CLIENT_PREVIEW_LIMIT = 240

/**
 * Squashes clipboard text down to something safe to render: one line, trimmed,
 * and capped. Everything that displays or transmits clipboard text goes through
 * here, so the caps are enforced in one place rather than per caller.
 *
 * Cuts on a word boundary where it can. A preview that stops mid-word reads as
 * corrupted text rather than as a deliberate excerpt.
 */
export function previewOf(text: string, limit = SERVER_PREVIEW_LIMIT): string {
  // Only the head can ever be shown, so only the head is worth normalising.
  // Running the whitespace regex over a multi-megabyte paste blocked the main
  // thread for ~280ms to produce eighty characters. The slice is generous
  // enough that collapsing whitespace inside it cannot leave the result short.
  const sliced = text.length > limit * 8
  const scanned = sliced ? text.slice(0, limit * 8) : text

  const flat = scanned.replace(/\s+/g, ' ').trim()
  // A head that collapses to under the limit still discarded everything after
  // it — mostly-whitespace input — so it is an excerpt and must say so.
  if (flat.length <= limit) return sliced ? `${flat}…` : flat

  const head = flat.slice(0, limit)
  const lastSpace = head.lastIndexOf(' ')

  // No space at all means a single token longer than the limit (a URL, a
  // token, a base64 blob) — there is no boundary to respect, so cut hard.
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head

  return cut.replace(/[\s,;:.!?-]+$/, '') + '…'
}

/**
 * The privacy boundary. The server learns the *shape* of a clipboard event —
 * kind, method, which field, how many characters — and nothing about its
 * contents unless the user has explicitly turned previews on.
 *
 * `preview` is omitted rather than blanked: an absent key cannot leak through
 * a default somewhere downstream.
 */
export function toServerPayload(
  record: ClipboardEventRecord,
  { sendPreview }: { sendPreview: boolean },
): ServerEventPayload {
  const payload: ServerEventPayload = {
    id: record.id,
    type: record.type,
    method: record.method,
    targetLabel: record.targetLabel,
    targetKind: record.targetKind,
    chars: record.chars,
    payloadKind: record.payloadKind,
    files: record.files,
    trusted: record.trusted,
    at: record.at,
  }

  if (sendPreview)
    payload.preview = previewOf(record.preview, SERVER_PREVIEW_LIMIT)

  return payload
}

const TYPES: ReadonlyArray<ClipboardEventType> = [
  'copy',
  'cut',
  'paste',
  'drop',
]
const METHODS: ReadonlyArray<ClipboardMethod> = [
  'keyboard',
  'right-click',
  'drag',
  'unknown',
]
const PAYLOAD_KINDS: ReadonlyArray<PayloadKind> = [
  'text',
  'html',
  'files',
  'empty',
]
const KINDS: ReadonlyArray<TargetKind> = [
  'input',
  'textarea',
  'contenteditable',
  'document',
]

function oneOf<T extends string>(
  allowed: ReadonlyArray<T>,
  value: unknown,
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`clipboard event: invalid ${field}`)
  }
  return value as T
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`clipboard event: invalid ${field}`)
  }
  return value
}

/**
 * The server's own guard on the privacy boundary.
 *
 * `toServerPayload` is what the client *should* send, but the server should
 * not depend on the client having behaved. This rebuilds the payload field by
 * field: anything unrecognised is dropped rather than stored, and a preview is
 * re-truncated here regardless of what arrived.
 */
export function sanitizeIncomingPayload(input: unknown): ServerEventPayload {
  if (typeof input !== 'object' || input === null) {
    throw new Error('clipboard event: expected an object')
  }

  const raw = input as Record<string, unknown>

  if (
    typeof raw.chars !== 'number' ||
    !Number.isFinite(raw.chars) ||
    raw.chars < 0
  ) {
    throw new Error('clipboard event: invalid chars')
  }
  if (typeof raw.at !== 'number' || !Number.isFinite(raw.at)) {
    throw new Error('clipboard event: invalid at')
  }
  // Required, not defaulted: a scripted client must not be able to pass itself
  // off as genuine simply by leaving the field out.
  if (typeof raw.trusted !== 'boolean') {
    throw new Error('clipboard event: invalid trusted')
  }
  const files = raw.files
  if (typeof files !== 'number' || !Number.isFinite(files) || files < 0) {
    throw new Error('clipboard event: invalid files')
  }

  const payload: ServerEventPayload = {
    id: requiredString(raw.id, 'id'),
    type: oneOf(TYPES, raw.type, 'type'),
    method: oneOf(METHODS, raw.method, 'method'),
    targetLabel: requiredString(raw.targetLabel, 'targetLabel'),
    targetKind: oneOf(KINDS, raw.targetKind, 'targetKind'),
    chars: Math.floor(raw.chars),
    payloadKind: oneOf(PAYLOAD_KINDS, raw.payloadKind, 'payloadKind'),
    files: Math.max(0, Math.floor(files)),
    trusted: raw.trusted,
    at: raw.at,
  }

  if (typeof raw.preview === 'string' && raw.preview.length > 0) {
    payload.preview = previewOf(raw.preview, SERVER_PREVIEW_LIMIT)
  }

  return payload
}
