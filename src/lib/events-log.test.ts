import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SERVER_PREVIEW_LIMIT, sanitizeIncomingPayload } from './redact'
import { listServerEvents, resetServerLog } from './server-log'
import type { ServerEventPayload } from './types'

/**
 * `createServerFn` is only half-built until the Start plugin compiles it:
 * `.handler()` expects the transform to hand it an extracted twin alongside the
 * handler, so under plain Vitest the real fetcher resolves to nothing useful and
 * the RPC transport is not present at all. That transport is the Playwright
 * suite's business (`tests/e2e/clipboard.spec.ts`).
 *
 * What is *this* module's business is the wiring: which validator guards which
 * handler, under which HTTP method, and that nothing reaches the log without
 * passing the sanitizer first. The stand-in below is the server path and only
 * the server path — validate, then hand the validator's OUTPUT to the handler —
 * which keeps that one decision executable instead of prose.
 */
interface Built {
  method: string
  /** Which builder method wired the validator, or null if none did. */
  via: 'validator' | 'inputValidator' | null
  validator: ((input: unknown) => unknown) | null
}

const builds = vi.hoisted(() => [] as Array<Built>)

vi.mock('@tanstack/react-start', () => ({
  createServerFn: (options?: { method?: string }) => {
    const spec: Built = {
      method: options?.method ?? 'GET',
      via: null,
      validator: null,
    }
    builds.push(spec)

    const wire = (via: Built['via']) => (fn: (input: unknown) => unknown) => {
      spec.via = via
      spec.validator = fn
      return builder
    }

    const builder = {
      validator: wire('validator'),
      inputValidator: wire('inputValidator'),
      handler: (fn: (ctx: { data: unknown; method: string }) => unknown) =>
        Object.assign(
          async (opts?: { data?: unknown }) =>
            fn({
              data: spec.validator ? spec.validator(opts?.data) : opts?.data,
              method: spec.method,
            }),
          { method: spec.method },
        ),
    }

    return builder
  },
}))

const { listClipboardEvents, logClipboardEvent } = await import('./events-log')

const specFor = (method: string) => builds.find((b) => b.method === method)!

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

describe('logClipboardEvent', () => {
  it('is declared POST — it writes', () => {
    expect(logClipboardEvent.method).toBe('POST')
  })

  it('is guarded by the sanitizer rather than by a bespoke check', () => {
    // The whole privacy stance depends on this being the SAME function the
    // redaction specs pin. A local re-implementation here would drift.
    expect(specFor('POST').validator).toBe(sanitizeIncomingPayload)
  })

  it('wires it through .validator(), not the deprecated .inputValidator()', () => {
    // The type names still suggest the old spelling; the runtime deprecates it.
    expect(specFor('POST').via).toBe('validator')
  })

  it('appends an accepted event and acknowledges it', async () => {
    await expect(logClipboardEvent({ data: payload() })).resolves.toEqual({
      ok: true,
    })

    expect(listServerEvents()).toHaveLength(1)
    expect(listServerEvents()[0]).toMatchObject({ id: 'e1', type: 'paste' })
  })

  it('stores the sanitizer output, not what the client sent', async () => {
    await logClipboardEvent({
      data: {
        ...payload(),
        // A field the server has no business keeping, smuggled in alongside
        // the legitimate ones.
        sessionCookie: 'abc123',
      } as unknown as ServerEventPayload,
    })

    const stored = listServerEvents()[0] as unknown as Record<string, unknown>
    expect(stored.sessionCookie).toBeUndefined()
    expect(Object.keys(stored)).not.toContain('sessionCookie')
  })

  it('re-truncates a preview the client failed to cap', async () => {
    await logClipboardEvent({
      data: payload({ preview: 'x'.repeat(SERVER_PREVIEW_LIMIT * 4) }),
    })

    expect(listServerEvents()[0].preview!.length).toBeLessThanOrEqual(
      SERVER_PREVIEW_LIMIT + 1, // the ellipsis a cut preview carries
    )
  })

  it('rejects an invalid payload before anything is written', async () => {
    await expect(
      logClipboardEvent({
        data: payload({ trusted: undefined as unknown as boolean }),
      }),
    ).rejects.toThrow(/trusted/)

    expect(listServerEvents()).toEqual([])
  })
})

describe('listClipboardEvents', () => {
  it('is declared GET — it only reads', () => {
    expect(listClipboardEvents.method).toBe('GET')
  })

  it('takes no input, so there is nothing to validate', () => {
    expect(specFor('GET').validator).toBeNull()
  })

  it('hands back the log newest first', async () => {
    await logClipboardEvent({ data: payload({ id: 'first' }) })
    await logClipboardEvent({ data: payload({ id: 'second' }) })

    expect((await listClipboardEvents()).map((e) => e.id)).toEqual([
      'second',
      'first',
    ])
  })
})
