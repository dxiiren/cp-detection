import { createServerFn } from '@tanstack/react-start'
import { sanitizeIncomingPayload } from './redact'
import { appendServerEvent, listServerEvents } from './server-log'

/**
 * Deliberately thin. Everything worth testing — what may be stored, how much
 * of it, and in what order — lives in `redact.ts` and `server-log.ts`, which
 * run in plain node under Vitest.
 *
 * NOT named `*.server.ts`: that suffix marks a module as server-only, and this
 * one is imported by a client route so the RPC stub can be generated.
 */
export const logClipboardEvent = createServerFn({ method: 'POST' })
  .validator(sanitizeIncomingPayload)
  .handler(({ data }) => {
    appendServerEvent(data)
    return { ok: true as const }
  })

export const listClipboardEvents = createServerFn({ method: 'GET' }).handler(
  () => listServerEvents(),
)
