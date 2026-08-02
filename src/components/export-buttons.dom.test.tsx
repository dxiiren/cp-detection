import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportButtons } from './export-buttons'
import type { ClipboardEventRecord } from '#/lib/types'

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

// jsdom implements neither createObjectURL nor a real download, which is
// exactly right for this layer: the component's whole job is to hand a blob
// and a filename to the browser, so the test captures that hand-off. What the
// blob CONTAINS is the pure layer's business, covered in export.test.ts.
const minted: Array<Blob> = []
const revoked: Array<string> = []
const clicked: Array<{ download: string; href: string }> = []

beforeEach(() => {
  minted.length = 0
  revoked.length = 0
  clicked.length = 0

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      minted.push(blob)
      return `blob:mock-${minted.length}`
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => revoked.push(url),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ download: this.download, href: this.href })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ExportButtons', () => {
  it('downloads the log as CSV with a dated filename', async () => {
    render(<ExportButtons records={[record]} />)

    await userEvent.click(screen.getByTestId('export-csv'))

    expect(minted).toHaveLength(1)
    expect(minted[0].type).toContain('text/csv')

    const text = await minted[0].text()
    expect(text.startsWith('id,type,method')).toBe(true)
    expect(text).toContain('acme-corp-invoice-2026@example.com')

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toMatch(/^cp-detection-events-.+\.csv$/)
  })

  it('downloads the log as JSON that parses back to the records', async () => {
    render(<ExportButtons records={[record]} />)

    await userEvent.click(screen.getByTestId('export-json'))

    expect(minted[0].type).toContain('application/json')
    expect(JSON.parse(await minted[0].text())).toEqual([record])
    expect(clicked[0].download).toMatch(/\.json$/)
  })

  it('revokes the object URL instead of leaking it', async () => {
    render(<ExportButtons records={[record]} />)

    await userEvent.click(screen.getByTestId('export-csv'))

    expect(revoked).toEqual(['blob:mock-1'])
  })

  it('is disabled while there is nothing to export', () => {
    render(<ExportButtons records={[]} />)

    expect(screen.getByTestId('export-csv')).toBeDisabled()
    expect(screen.getByTestId('export-json')).toBeDisabled()
    expect(minted).toHaveLength(0)
  })
})
