import type { ServerEventPayload } from './types'

export const MAX_SERVER_EVENTS = 500

/**
 * Process memory, on purpose. This is a demo: the log is meant to be
 * inspectable while the server is up and gone when it restarts, which is a
 * better default for a page people will paste real things into than a
 * database quietly accumulating other people's clipboards.
 */
let log: Array<ServerEventPayload> = []

export function appendServerEvent(payload: ServerEventPayload) {
  if (log.some((entry) => entry.id === payload.id)) return
  log = [payload, ...log].slice(0, MAX_SERVER_EVENTS)
}

export function listServerEvents(): Array<ServerEventPayload> {
  return [...log]
}

export function resetServerLog() {
  log = []
}
