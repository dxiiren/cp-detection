import { Download } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { exportFilename, toCsv, toJson } from '#/lib/export'
import type { ClipboardEventRecord } from '#/lib/types'

/**
 * The DOM half of the export seam. Everything about WHAT leaves — columns,
 * escaping, the re-applied preview boundary — is `lib/export.ts` and is unit
 * tested; this component only owns the browser mechanics of handing a blob to
 * the user, which is why it is this thin.
 */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ExportButtons({
  records,
}: {
  records: Array<ClipboardEventRecord>
}) {
  const empty = records.length === 0

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        data-testid="export-csv"
        disabled={empty}
        onClick={() =>
          download(
            exportFilename('csv', Date.now()),
            toCsv(records),
            'text/csv;charset=utf-8',
          )
        }
      >
        <Download aria-hidden="true" />
        Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="export-json"
        disabled={empty}
        onClick={() =>
          download(
            exportFilename('json', Date.now()),
            toJson(records),
            'application/json',
          )
        }
      >
        <Download aria-hidden="true" />
        Export JSON
      </Button>
    </div>
  )
}
