import { CLIENT_PREVIEW_LIMIT, previewOf } from './redact'
import type { ClipboardEventRecord } from './types'

/**
 * Turns the session log into something a person can take away — CSV for a
 * spreadsheet, JSON for a script. Pure on purpose: strings in, strings out,
 * clock injected. The Blob/anchor mechanics live in the component that calls
 * this, same seam as attribution.ts and its DOM adapter.
 *
 * The export does not trust the store to have redacted — the same stance the
 * server takes towards the client. Every preview is re-cut at
 * `CLIENT_PREVIEW_LIMIT` on the way out, so even a record that somehow held a
 * full clipboard payload cannot leave through a download.
 */

const COLUMNS = [
  'id',
  'type',
  'method',
  'targetLabel',
  'targetKind',
  'chars',
  'payloadKind',
  'files',
  'trusted',
  'preview',
  'at',
] as const

/**
 * Rebuilt field by field rather than spread, like `sanitizeIncomingPayload`:
 * a future property on the record type must be exported deliberately, not by
 * accident. This is also where the preview boundary is re-applied.
 */
function exportRow(record: ClipboardEventRecord): ClipboardEventRecord {
  return {
    id: record.id,
    type: record.type,
    method: record.method,
    targetLabel: record.targetLabel,
    targetKind: record.targetKind,
    chars: record.chars,
    payloadKind: record.payloadKind,
    files: record.files,
    trusted: record.trusted,
    preview: previewOf(record.preview, CLIENT_PREVIEW_LIMIT),
    at: record.at,
  }
}

/**
 * One CSV cell, two defences:
 *
 * RFC 4180 — anything holding a comma, quote or line break is quoted and its
 * quotes doubled, so a label like `Delivery "notes", floor 2` cannot shift
 * every later column.
 *
 * Formula injection — clipboard contents are attacker-controlled by
 * definition, and Excel executes any cell starting with `=`, `+`, `-` or `@`.
 * A leading apostrophe demotes it back to text; without it, this export is an
 * exfiltration primitive dressed as a feature.
 */
function csvCell(value: string | number | boolean): string {
  let text = String(value)

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`

  return text
}

/** CRLF line endings: RFC 4180's, and the ones spreadsheets actually expect. */
export function toCsv(records: Array<ClipboardEventRecord>): string {
  const rows = records.map(exportRow).map((row) =>
    COLUMNS.map((column) =>
      // Epoch milliseconds help nobody in a spreadsheet cell.
      column === 'at' ? new Date(row.at).toISOString() : csvCell(row[column]),
    ).join(','),
  )

  return [COLUMNS.join(','), ...rows].join('\r\n')
}

/** JSON keeps `at` as epoch milliseconds — this shape is for machines. */
export function toJson(records: Array<ClipboardEventRecord>): string {
  return JSON.stringify(records.map(exportRow), null, 2)
}

/**
 * `2023-11-14T22-13-20` rather than ISO's colons: `:` is illegal in a Windows
 * filename, and a download that errors on save reads as a broken feature.
 */
export function exportFilename(format: 'csv' | 'json', at: number): string {
  const stamp = new Date(at).toISOString().slice(0, 19).replaceAll(':', '-')
  return `cp-detection-events-${stamp}.${format}`
}
