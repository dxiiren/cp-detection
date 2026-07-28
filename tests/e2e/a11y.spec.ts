import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { awaitReady, navigateTo, pasteViaKeyboard } from './helpers'

/**
 * Accessibility was the largest untested surface in this app: a page can pass
 * every behavioural and layout check and still be unusable with a keyboard or
 * a screen reader.
 *
 * axe finds the machine-checkable failures — contrast, names, roles, landmarks.
 * The specs after it cover what axe cannot: that you can actually reach and
 * operate the thing with the Tab key, and see where you are while doing it.
 */

const ROUTES = ['/', '/events']

async function scan(page: Page) {
  return (
    new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // The TanStack devtools panel is dev-only and stripped from the production
      // bundle; its markup is not ours to fix.
      .exclude('[data-tsd-trigger]')
      .exclude('.tsd-trigger')
      .analyze()
  )
}

function report(
  violations: Array<{
    id: string
    impact?: string | null
    nodes: Array<{ html: string }>
  }>,
) {
  return violations
    .map(
      (v) =>
        `${v.impact ?? 'unknown'} — ${v.id}\n    ${v.nodes
          .slice(0, 3)
          .map((n) => n.html.slice(0, 120))
          .join('\n    ')}`,
    )
    .join('\n  ')
}

for (const route of ROUTES) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route)
    const { violations } = await scan(page)

    expect(violations, `\n  ${report(violations)}\n`).toEqual([])
  })
}

test('the events page is still accessible once it has data', async ({
  page,
}) => {
  // An empty table exercises almost nothing. The real markup only exists once
  // rows, badges and a filled filter are on the page.
  await page.goto('/')
  await awaitReady(page)
  await pasteViaKeyboard(page, '#notes', 'quarterly numbers')
  await navigateTo(page, 'Events')
  await expect(page.getByTestId('events-table')).toBeVisible()

  const { violations } = await scan(page)
  expect(violations, `\n  ${report(violations)}\n`).toEqual([])
})

test('a toast is announced rather than shown silently', async ({ page }) => {
  await page.goto('/')
  await awaitReady(page)
  await pasteViaKeyboard(page, '#email', 'announced@example.com')

  const { violations } = await scan(page)
  expect(violations, `\n  ${report(violations)}\n`).toEqual([])
})

test('every interactive control on the playground is reachable by keyboard', async ({
  page,
}) => {
  await page.goto('/')
  await awaitReady(page)

  // Walk forwards with Tab and collect what receives focus. A control that
  // never appears here cannot be operated without a mouse.
  const reached = new Set<string>()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(
      () =>
        document.activeElement?.id ||
        document.activeElement?.getAttribute('data-testid') ||
        '',
    )
    if (id) reached.add(id)
  }

  for (const control of [
    'email',
    'notes',
    'bio',
    'confirm-email',
    'secret',
    'referral',
    'toggle-block',
    'toggle-preview',
    'toggle-keep-toasts',
    'toast-seconds',
    'clear-toasts',
  ]) {
    expect(
      reached.has(control),
      `${control} was never focused while tabbing`,
    ).toBe(true)
  }
})

test('the focused control is visibly focused', async ({ page }) => {
  // Focus you cannot see is focus you cannot use.
  await page.goto('/')
  await page.locator('#email').focus()

  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const style = getComputedStyle(el)
    return {
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    }
  })

  const hasVisibleFocus =
    (outline.outlineStyle !== 'none' && parseFloat(outline.outlineWidth) > 0) ||
    (outline.boxShadow !== 'none' && outline.boxShadow !== '')

  expect(hasVisibleFocus, `focus styles were ${JSON.stringify(outline)}`).toBe(
    true,
  )
})

test('the accordion can be operated entirely from the keyboard', async ({
  page,
}) => {
  await page.goto('/')
  await awaitReady(page)

  const trigger = page.getByTestId('home-accordion').getByRole('button').first()
  await trigger.focus()
  const before = await trigger.getAttribute('aria-expanded')

  await page.keyboard.press('Enter')

  await expect(trigger).not.toHaveAttribute('aria-expanded', before ?? '')
})
