import { describe, expect, it, vi } from 'vitest'
import { installClipboardDetector } from './clipboard-detector'

// Runs in the `unit` project: node, no document. This is the real SSR check —
// TanStack Start renders these modules on the server, and an import-time or
// install-time reach for `document` would take the whole page down.
describe('clipboard detector under SSR', () => {
  it('has no document to work with', () => {
    expect(typeof document).toBe('undefined')
  })

  it('installs without throwing and hands back a usable teardown', () => {
    const onEvent = vi.fn()

    const teardown = installClipboardDetector({ onEvent })

    expect(typeof teardown).toBe('function')
    expect(() => teardown()).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })
})
