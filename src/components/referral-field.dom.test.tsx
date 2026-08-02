import { render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferralField } from './referral-field'
import { useClipboardDetection } from '#/hooks/use-clipboard-detection'
import { describeTarget } from '#/lib/describe-target'
import { clipboardStore, resetClipboardStore } from '#/lib/event-store'
import type { ReactNode } from 'react'

/**
 * This component is load-bearing precisely because it does nothing.
 *
 * It is the standing proof that detection is global: a field the app does not
 * wire up, whose pastes are seen anyway because the listener sits on the
 * document. An accidentally-added `onPaste` here, or a renamed id or label,
 * would leave that claim asserted nowhere but in a single acceptance spec and
 * a paragraph of prose. So the invariant is pinned in two directions — the
 * component declares no handler, and a paste into it still lands.
 */

// Same reason as the hook's own specs: sonner portals and animates, and what
// matters here is that the record was made, not what the toast looked like.
const toast = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast }))

/** Every props object in the tree this component itself declares. */
function declaredProps(node: ReactNode): Array<Record<string, unknown>> {
  if (Array.isArray(node)) return node.flatMap(declaredProps)
  if (!isValidElement(node)) return []

  const props = node.props as Record<string, unknown>
  return [props, ...declaredProps(props.children as ReactNode)]
}

const handlerNames = () =>
  declaredProps(ReferralField())
    .flatMap(Object.keys)
    .filter((key) => /^on[A-Z]/.test(key))

function clipboardEvent(type: string, text: string) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  })
  return event
}

function Harness() {
  useClipboardDetection()
  return <ReferralField />
}

const referral = () => document.querySelector('#referral') as HTMLInputElement

beforeEach(() => {
  resetClipboardStore()
  toast.info.mockClear()
  toast.warning.mockClear()
  toast.error.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReferralField', () => {
  it('renders a labelled input the detector can name', () => {
    render(<ReferralField />)

    const input = screen.getByLabelText('Referral code')
    expect(input).toBe(referral())
    // The acceptance spec and the toast copy both read this exact label, and
    // it comes from the visible <Label>, not the id — see describe-target.ts.
    expect(describeTarget(input)).toMatchObject({
      label: 'Referral code',
      kind: 'input',
    })
  })

  it('declares no clipboard handler of its own', () => {
    // THE invariant. A local onPaste here would make the field detected for a
    // reason that proves nothing about the global listener.
    expect(
      handlerNames().filter((key) =>
        /paste|copy|cut|drop|drag|input/i.test(key),
      ),
    ).toEqual([])
  })

  it('declares no event handlers at all — it is deliberately dumb', () => {
    // It stands in for a component the app does not control. Reaching for any
    // handler here means the stand-in has stopped standing in for anything.
    expect(handlerNames()).toEqual([])
  })

  it('is detected on paste anyway, through the document-level listener', () => {
    render(<Harness />)

    referral().dispatchEvent(clipboardEvent('paste', 'FRIEND-2026'))

    expect(clipboardStore.state.events).toHaveLength(1)
    expect(clipboardStore.state.events[0]).toMatchObject({
      type: 'paste',
      targetLabel: 'Referral code',
      targetKind: 'input',
      chars: 11,
    })
  })

  it('does not interfere with the paste it observes', () => {
    render(<Harness />)

    const event = clipboardEvent('paste', 'FRIEND-2026')
    referral().dispatchEvent(event)

    // Unprotected and unhandled: the text still reaches the field.
    expect(event.defaultPrevented).toBe(false)
  })

  it('is invisible to the detector once the page stops listening', () => {
    const { unmount } = render(<Harness />)
    unmount()

    document.body.innerHTML = '<input id="referral" />'
    referral().dispatchEvent(clipboardEvent('paste', 'FRIEND-2026'))

    // Nothing on the field itself was ever listening, so tearing the document
    // listener down leaves nothing behind to catch this.
    expect(clipboardStore.state.events).toHaveLength(0)
  })
})
