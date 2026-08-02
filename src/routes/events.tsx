import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { useState } from 'react'
import { ExportButtons } from '#/components/export-buttons'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { clearEvents, clipboardStore } from '#/lib/event-store'
import { listClipboardEvents } from '#/lib/events-log'
import {
  breadcrumbJsonLd,
  canonicalLink,
  jsonLdScript,
  pageMeta,
} from '#/lib/seo'
import { SITE_INDEXABLE, SITE_ORIGIN } from '#/lib/site'
import { PAGES } from '#/lib/site-content'
import type { ClipboardEventRecord, ServerEventPayload } from '#/lib/types'

export const Route = createFileRoute('/events')({
  head: () => ({
    meta: pageMeta({
      origin: SITE_ORIGIN,
      indexable: SITE_INDEXABLE,
      ...PAGES.events,
    }),
    links: [canonicalLink(SITE_ORIGIN, PAGES.events.path)],
    scripts: [
      jsonLdScript(
        breadcrumbJsonLd(SITE_ORIGIN, [
          { name: 'Playground', path: PAGES.home.path },
          { name: 'Events log', path: PAGES.events.path },
        ]),
      ),
    ],
  }),
  component: Events,
})

const TYPE_VARIANT = {
  paste: 'default',
  drop: 'default',
  copy: 'secondary',
  cut: 'secondary',
} as const

const columns: Array<ColumnDef<ClipboardEventRecord>> = [
  {
    accessorKey: 'type',
    header: 'Event',
    cell: ({ row }) => (
      <Badge variant={TYPE_VARIANT[row.original.type]}>
        {row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: 'method',
    header: 'How',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.method}</span>
    ),
  },
  {
    accessorKey: 'trusted',
    header: 'Source',
    // Event.isTrusted: real user actions are true, anything a script
    // dispatched is false. Shown rather than filtered — a scripted paste is
    // the interesting row, not one to hide.
    cell: ({ row }) =>
      row.original.trusted ? (
        <span className="text-muted-foreground">user</span>
      ) : (
        <Badge variant="destructive">script</Badge>
      ),
  },
  { accessorKey: 'targetLabel', header: 'Field' },
  {
    accessorKey: 'chars',
    header: 'Chars',
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.chars}</span>
    ),
  },
  {
    accessorKey: 'preview',
    header: 'Preview',
    // `block`, not the default inline: max-width has no effect on a
    // non-replaced inline element, so the old `max-w-xs truncate` on a <span>
    // silently did nothing and one unbroken 200-character paste dragged the
    // table — and the whole page — far wider than the viewport.
    cell: ({ row }) => (
      <span
        data-testid="preview-cell"
        title={row.original.preview || undefined}
        className="text-muted-foreground block max-w-[16rem] truncate font-mono text-xs"
      >
        {row.original.preview || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'at',
    header: 'When',
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {new Date(row.original.at).toLocaleTimeString()}
      </span>
    ),
  },
]

function EventsTable({
  data,
  testId,
  empty,
}: {
  data: Array<ClipboardEventRecord>
  testId: string
  empty: string
}) {
  const [filter, setFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    // min-w-0 all the way down: a grid/flex child defaults to min-width:auto,
    // which means it refuses to shrink below its content. Without it the
    // table's own overflow-x-auto container can never actually scroll — the
    // page widens instead, and the whole layout breaks sideways.
    <div className="grid min-w-0 gap-4">
      {/* Wraps rather than overflowing, same reason as the tabs row above:
          at 390px the input plus two buttons are wider than the viewport. */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filter events"
          placeholder="Filter by field, method, contents…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-[12rem] flex-1"
        />
        {/* Exports what this tab actually holds — for the server tab that is
            the redacted view, which is the honest thing to hand out. */}
        <ExportButtons records={data} />
      </div>
      <div className="min-w-0 overflow-hidden rounded-md border">
        <Table data-testid={testId}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-testid="event-row">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** The server never stores a preview unless asked to; show that honestly. */
const withoutPreview = (
  rows: Array<ServerEventPayload>,
): Array<ClipboardEventRecord> =>
  rows.map((row) => ({ ...row, preview: row.preview ?? '' }))

function Events() {
  const events = useSelector(clipboardStore, (state) => state.events)
  const server = useQuery({
    queryKey: ['server-events'],
    queryFn: () => listClipboardEvents(),
    refetchInterval: 2_000,
  })

  return (
    <Card>
      <CardHeader>
        {/* The page had no h1 at all, which left it with no top-level heading
            for a screen reader or a crawler to anchor on. */}
        <CardTitle asChild>
          <h1>Detected events</h1>
        </CardTitle>
        <CardDescription>
          Newest first. This browser keeps the full record; the server only gets
          what the privacy switch allows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="session">
          {/* Wraps rather than overflowing: at 390px the two tab labels plus
              the button are wider than the viewport, and a rigid row pushed
              the whole document sideways. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="max-w-full flex-wrap">
              <TabsTrigger value="session">
                This session ({events.length})
              </TabsTrigger>
              <TabsTrigger value="server">
                Server log ({server.data?.length ?? 0})
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              onClick={() => clearEvents()}
              disabled={events.length === 0}
            >
              Clear session
            </Button>
          </div>

          <TabsContent value="session" className="mt-4">
            <EventsTable
              data={events}
              testId="events-table"
              empty="Nothing yet — go and paste something on the playground."
            />
          </TabsContent>

          <TabsContent value="server" className="mt-4">
            <p className="text-muted-foreground mb-3 text-xs">
              Held in the server's memory and lost on restart. The Preview
              column stays empty unless you turned on “send clipboard excerpts”.
            </p>
            <EventsTable
              data={withoutPreview(server.data ?? [])}
              testId="server-events-table"
              empty={
                server.isLoading
                  ? 'Loading…'
                  : 'The server has recorded nothing yet.'
              }
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
