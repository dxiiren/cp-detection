import { beforeEach, describe, expect, it } from 'vitest'
import { toServerPayload } from './redact'
import {
  MAX_SERVER_EVENTS,
  appendServerEvent,
  listServerEvents,
  resetServerLog,
} from './server-log'
import type { ClipboardEventRecord, ServerEventPayload } from './types'

const payload = (
  over: Partial<ServerEventPayload> = {},
): ServerEventPayload => ({
  id: 'e1',
  type: 'paste',
  method: 'keyboard',
  targetLabel: 'Email',
  targetKind: 'input',
  chars: 5,
  payloadKind: 'text',
  files: 0,
  trusted: true,
  at: 1_700_000_000_000,
  ...over,
})

beforeEach(() => {
  resetServerLog()
})

describe('server log', () => {
  it('starts empty', () => {
    expect(listServerEvents()).toEqual([])
  })

  it('keeps the newest event first', () => {
    appendServerEvent(payload({ id: 'first' }))
    appendServerEvent(payload({ id: 'second' }))

    expect(listServerEvents().map((e) => e.id)).toEqual(['second', 'first'])
  })

  it('drops the oldest past the cap', () => {
    for (let i = 0; i < MAX_SERVER_EVENTS + 3; i++) {
      appendServerEvent(payload({ id: `e${i}` }))
    }

    const log = listServerEvents()
    expect(log).toHaveLength(MAX_SERVER_EVENTS)
    expect(log[0].id).toBe(`e${MAX_SERVER_EVENTS + 2}`)
  })

  it('ignores a replay of an event it already has', () => {
    // React strict mode double-invokes effects and the client fires and
    // forgets; the same id arriving twice is one event, not two.
    appendServerEvent(payload({ id: 'same' }))
    appendServerEvent(payload({ id: 'same' }))

    expect(listServerEvents()).toHaveLength(1)
  })

  it('hands back a copy, so callers cannot mutate the log', () => {
    appendServerEvent(payload())
    listServerEvents().pop()

    expect(listServerEvents()).toHaveLength(1)
  })
})

describe('the privacy boundary, end to end', () => {
  const record: ClipboardEventRecord = {
    id: 'e1',
    type: 'paste',
    method: 'keyboard',
    targetLabel: 'Password',
    targetKind: 'input',
    chars: 24,
    preview: 'hunter2-correct-horse',
    payloadKind: 'text',
    files: 0,
    trusted: true,
    at: 1_700_000_000_000,
  }

  it('leaves no trace of clipboard text on the server by default', () => {
    appendServerEvent(toServerPayload(record, { sendPreview: false }))

    expect(JSON.stringify(listServerEvents())).not.toContain('hunter2')
    expect(listServerEvents()[0].chars).toBe(24)
  })

  it('stores the excerpt only once the user has opted in', () => {
    appendServerEvent(toServerPayload(record, { sendPreview: true }))

    expect(listServerEvents()[0].preview).toBe('hunter2-correct-horse')
  })
})
