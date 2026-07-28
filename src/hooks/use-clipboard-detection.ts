import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { installClipboardDetector } from '#/lib/clipboard-detector'
import { clipboardStore, recordEvent } from '#/lib/event-store'
import { blockedCopy, toastCopy, toastDuration } from '#/lib/toast-copy'
import type { ClipboardEventRecord } from '#/lib/types'

/** Marks a field that refuses pasted text, e.g. a "confirm your email" input. */
export const PROTECTED_ATTRIBUTE = 'data-protect-paste'

export interface UseClipboardDetectionOptions {
  /** Somewhere to forward each record — the server log, analytics, anywhere. */
  onRecord?: (record: ClipboardEventRecord) => void
}

/**
 * Mounts the global detector for as long as the component lives.
 *
 * The effect deliberately has no dependencies: listeners are installed once,
 * and settings are read from the store at event time rather than captured in
 * the closure. Depending on settings here would tear down and re-attach every
 * listener on each toggle, and would drop the attribution state machine's
 * timing history along with them.
 */
export function useClipboardDetection(
  options: UseClipboardDetectionOptions = {},
) {
  // Kept in a ref so callers can pass an inline arrow without it being frozen
  // into the one-time effect below.
  const onRecord = useRef(options.onRecord)
  onRecord.current = options.onRecord

  // False during server rendering and until the effect attaches listeners.
  // The page surfaces this, because "looks like a form" and "is watching the
  // clipboard" are different states and only one of them is honest.
  const [detecting, setDetecting] = useState(false)

  useEffect(() => {
    setDetecting(true)
    const teardown = installClipboardDetector({
      shouldBlock: (element) =>
        clipboardStore.state.settings.blockProtectedFields &&
        element.closest(`[${PROTECTED_ATTRIBUTE}]`) !== null,

      onBlocked: (target) => {
        const { title, description } = blockedCopy(target)
        // Read at event time, like the block setting above — the listeners are
        // installed once and must not freeze a duration from first render.
        const duration = toastDuration(clipboardStore.state.settings)
        toast.error(title, { description, duration })
      },

      onEvent: (record) => {
        recordEvent(record)
        const { title, description, level } = toastCopy(record)
        const duration = toastDuration(clipboardStore.state.settings)
        toast[level](title, { description, duration })
        onRecord.current?.(record)
      },
    })

    // Deliberately does NOT reset `detecting`. The component is going away, so
    // nothing reads it — but StrictMode double-invokes effects (run, clean up,
    // run), and resetting here makes the flag flicker true -> false -> true.
    // Anything sampling during that window sees "not detecting" on a page that
    // is perfectly live.
    return teardown
  }, [])

  return { detecting }
}
