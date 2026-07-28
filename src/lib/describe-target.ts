import type { ClipboardTarget, TargetKind } from './types'

const PAGE: ClipboardTarget = {
  label: 'the page',
  kind: 'document',
  sensitive: false,
}

/**
 * autocomplete values whose contents must never be retained. Card fields and
 * one-time codes are as sensitive as a password, and the browser tells us so.
 */
const SENSITIVE_AUTOCOMPLETE = /^(cc-|one-time-code$)/

function isSensitive(el: Element): boolean {
  if (
    tagOf(el) === 'input' &&
    (el.getAttribute('type') ?? '').toLowerCase() === 'password'
  ) {
    return true
  }
  if (el.hasAttribute('data-sensitive')) return true
  const autocomplete = el.getAttribute('autocomplete')?.toLowerCase() ?? ''
  return SENSITIVE_AUTOCOMPLETE.test(autocomplete)
}

/** Input types that hold text a person could meaningfully copy or paste. */
const TEXTUAL_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  '',
])

const clean = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

function editableHost(node: Element): Element | null {
  const host = node.closest('[contenteditable]')
  if (!host) return null
  return host.getAttribute('contenteditable') === 'false' ? null : host
}

/**
 * `instanceof` is realm-bound: an element inside an iframe is an instance of
 * *that* document's Element, not this one's, so every `instanceof` check
 * silently fails across a frame boundary. Tag names do not care which realm
 * they came from.
 */
export function isElement(node: unknown): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as Node).nodeType === 1 &&
    typeof (node as Element).tagName === 'string'
  )
}

export const tagOf = (el: Element) => el.tagName.toLowerCase()

function kindOf(el: Element): TargetKind | null {
  const tag = tagOf(el)
  if (tag === 'textarea') return 'textarea'
  if (tag === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase()
    return TEXTUAL_INPUT_TYPES.has(type) ? 'input' : null
  }
  return null
}

/**
 * Label precedence deliberately favours what a person would call the field
 * over what the code calls it: an id of `confirm-email` is worse copy in a
 * toast than the visible label "Confirm email".
 */
function labelOf(el: Element): string {
  const aria = clean(el.getAttribute('aria-label'))
  if (aria) return aria

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => clean(el.ownerDocument.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' ')
    if (text) return text
  }

  const id = el.getAttribute('id')
  if (id) {
    const forLabel = el.ownerDocument.querySelector(
      `label[for="${CSS.escape(id)}"]`,
    )
    const text = clean(forLabel?.textContent)
    if (text) return text
  }

  // A wrapping <label> contains the field's own text, so strip it back out.
  const wrapping = el.closest('label')
  if (wrapping) {
    const own =
      tagOf(el) === 'input' || tagOf(el) === 'textarea'
        ? (el as HTMLInputElement).value
        : el.textContent
    const text = clean(clean(wrapping.textContent).replace(clean(own), ''))
    if (text) return text
  }

  const placeholder = clean(el.getAttribute('placeholder'))
  if (placeholder) return placeholder

  const name = clean(el.getAttribute('name'))
  if (name) return name

  if (id) return id

  return el.tagName.toLowerCase()
}

/**
 * Turns whatever the browser handed us as an event target into the pair the
 * rest of the app cares about. This is the only module that touches the DOM's
 * shape; `attribution.ts` receives the result, never the node.
 */
export function describeTarget(node: EventTarget | null): ClipboardTarget {
  if (!isElement(node)) return PAGE

  const direct = kindOf(node)
  if (direct) {
    return { label: labelOf(node), kind: direct, sensitive: isSensitive(node) }
  }

  // The event may land on a node nested inside the editable region.
  const host = editableHost(node)
  if (host) {
    return {
      label: labelOf(host),
      kind: 'contenteditable',
      sensitive: isSensitive(host),
    }
  }

  return PAGE
}
