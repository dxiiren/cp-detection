import { describe, expect, it } from 'vitest'
import { CLIENT_PREVIEW_LIMIT } from './redact'
import { exportFilename, toCsv, toJson } from './export'
import type { ClipboardEventRecord } from './types'

const record: ClipboardEventRecord = {
  id: 'e1',
  type: 'paste',
  method: 'keyboard',
  targetLabel: 'Email',
  targetKind: 'input',
  chars: 34,
  payloadKind: 'text',
  files: 0,
  preview: 'acme-corp-invoice-2026@example.com',
  trusted: true,
  at: 1_700_000_000_000,
}

const HEADER =
  'id,type,method,targetLabel,targetKind,chars,payloadKind,files,trusted,preview,at'

describe('toCsv', () => {
  it('emits a header and one line per record', () => {
    const lines = toCsv([record, { ...record, id: 'e2' }]).split('\r\n')

    expect(lines[0]).toBe(HEADER)
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('e1')
    expect(lines[2]).toContain('e2')
  })

  it('an empty log exports as just the header', () => {
    expect(toCsv([])).toBe(HEADER)
  })

  it('escapes commas and quotes per RFC 4180', () => {
    // Labels come from visible <label> text, which is arbitrary page copy —
    // a comma or a quote in one must not shift every later column.
    const tricky = {
      ...record,
      targetLabel: 'Delivery "notes", floor 2',
    }

    const row = toCsv([tricky]).split('\r\n')[1]

    expect(row).toContain('"Delivery ""notes"", floor 2"')
    // The row still parses back to the right number of columns: split on
    // commas OUTSIDE quotes and count.
    const columns = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []
    expect(columns.length).toBeGreaterThanOrEqual(11)
  })

  it('neutralises spreadsheet formula injection', () => {
    // Clipboard contents are attacker-controlled by definition, and Excel
    // executes any cell starting with = + - or @. An export that turns a
    // pasted string into a live formula is an exfiltration primitive.
    const hostile = {
      ...record,
      preview: '=HYPERLINK("http://evil.example","payroll")',
    }

    const row = toCsv([hostile]).split('\r\n')[1]

    expect(row).not.toContain(',=HYPERLINK')
    expect(row).toContain(`'=HYPERLINK`)
  })

  it('re-truncates the preview at the client boundary, whatever the record holds', () => {
    // The export does not trust the store to have redacted — same stance as
    // the server. Even if a full clipboard payload somehow reached a record,
    // it must not leave through a download.
    const secret = 'p'.repeat(5_000)
    const csv = toCsv([{ ...record, preview: secret, chars: secret.length }])

    expect(csv).not.toContain('p'.repeat(CLIENT_PREVIEW_LIMIT + 2))
    const run = csv.match(/p+/)?.[0] ?? ''
    expect(run.length).toBeLessThanOrEqual(CLIENT_PREVIEW_LIMIT)
  })

  it('renders the timestamp as ISO 8601, not epoch milliseconds', () => {
    // A spreadsheet cell reading 1700000000000 helps nobody.
    expect(toCsv([record])).toContain('2023-11-14T22:13:20.000Z')
  })
})

describe('toJson', () => {
  it('round-trips the record fields', () => {
    const parsed = JSON.parse(toJson([record]))

    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toEqual(record)
  })

  it('applies the same redaction cap as the CSV path', () => {
    const secret = 'q'.repeat(5_000)
    const json = toJson([{ ...record, preview: secret, chars: secret.length }])

    const preview = JSON.parse(json)[0].preview as string
    expect(preview.length).toBeLessThanOrEqual(CLIENT_PREVIEW_LIMIT + 1)
    expect(json).not.toContain('q'.repeat(CLIENT_PREVIEW_LIMIT + 2))
  })

  it('exports only the fields it was asked for', () => {
    // Rebuilt field by field, like the server's sanitiser: a future property
    // on the record type must be exported deliberately, not by accident.
    const decorated = {
      ...record,
      sessionCookie: 'not-yours',
    } as unknown as ClipboardEventRecord

    expect(toJson([decorated])).not.toContain('not-yours')
  })
})

describe('exportFilename', () => {
  it('stamps the moment of export into the name', () => {
    // Injected clock, same as attribution.ts — the pure layer never calls
    // Date.now() itself.
    expect(exportFilename('csv', 1_700_000_000_000)).toBe(
      'cp-detection-events-2023-11-14T22-13-20.csv',
    )
    expect(exportFilename('json', 1_700_000_000_000)).toBe(
      'cp-detection-events-2023-11-14T22-13-20.json',
    )
  })

  it('contains no characters Windows refuses in a filename', () => {
    expect(
      exportFilename('csv', Date.UTC(2026, 0, 31, 23, 59, 59)),
    ).not.toMatch(/[:*?"<>|/\\]/)
  })
})
