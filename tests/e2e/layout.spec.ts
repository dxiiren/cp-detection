import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { awaitReady, navigateTo, pasteViaKeyboard } from './helpers'

/**
 * The UX audit the behavioural suite never did.
 *
 * Every route is checked at every viewport for the one failure that makes a
 * page feel broken regardless of whether its logic is correct: content that
 * escapes the viewport sideways. Wide things — tables, long unbroken strings —
 * belong in their own scroll container, never pushed onto the document.
 *
 * This exists because a real bug shipped: the events table's preview cell used
 * `max-w-xs truncate` on a <span>, and max-width does not apply to a
 * non-replaced inline element. One 200-character paste with no spaces dragged
 * the document to 1800px wide on a 390px phone. Every behavioural spec passed
 * throughout, because none of them ever looked at layout.
 */

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

const ROUTES = ['/', '/events']

/** An unbroken run with no spaces: nothing can wrap it, so it is the worst case. */
const UNBREAKABLE = 'q'.repeat(200)

/**
 * Returns the elements sticking out past the viewport, so a failure names the
 * culprit instead of just asserting a number.
 */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const limit = doc.clientWidth
    const offenders: Array<string> = []

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      // Only elements that actually extend past the right edge, with a pixel
      // of tolerance for sub-pixel rounding.
      if (rect.right > limit + 1) {
        const tag = el.tagName.toLowerCase()
        const id = el.id ? `#${el.id}` : ''
        const testid = el.getAttribute('data-testid')
        const cls =
          typeof el.className === 'string'
            ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')}`
            : ''
        offenders.push(
          `${tag}${id}${testid ? `[data-testid=${testid}]` : ''}${cls} → right:${Math.round(rect.right)}`,
        )
      }
    }

    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: limit,
      offenders: offenders.slice(0, 8),
    }
  })
}

async function seedAnEvent(page: Page) {
  await page.goto('/')
  await awaitReady(page)
  await pasteViaKeyboard(page, '#notes', UNBREAKABLE)
}

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${route} does not overflow sideways on ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto(route)

      const { scrollWidth, clientWidth, offenders } = await overflowReport(page)

      expect(
        scrollWidth,
        `${route} scrolls horizontally at ${viewport.width}px. Offenders:\n  ${offenders.join('\n  ')}`,
      ).toBeLessThanOrEqual(clientWidth + 1)
    })
  }

  test(`the events table survives an unbreakable preview on ${viewport.name}`, async ({
    page,
  }) => {
    // The empty table never broke. It takes real data — specifically a long
    // string with nowhere to wrap — to reproduce what a user actually sees.
    await page.setViewportSize(viewport)
    await seedAnEvent(page)
    await navigateTo(page, 'Events')
    await expect(page.getByTestId('events-table')).toBeVisible()

    const { scrollWidth, clientWidth, offenders } = await overflowReport(page)

    expect(
      scrollWidth,
      `/events with data scrolls horizontally at ${viewport.width}px. Offenders:\n  ${offenders.join('\n  ')}`,
    ).toBeLessThanOrEqual(clientWidth + 1)
  })
}

test('a long preview is clamped rather than left to stretch its row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await seedAnEvent(page)
  await navigateTo(page, 'Events')

  const cell = page
    .getByTestId('events-table')
    .getByTestId('event-row')
    .first()
    .getByTestId('preview-cell')

  await expect(cell).toBeVisible()
  const box = await cell.boundingBox()
  expect(box, 'preview cell should be laid out').not.toBeNull()
  // The exact width is a design choice; that it is bounded at all is not.
  expect(box!.width).toBeLessThan(420)
})

test('the wide table scrolls inside its own container, not the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedAnEvent(page)
  await navigateTo(page, 'Events')
  await expect(page.getByTestId('events-table')).toBeVisible()

  // The point of the fix: the overflow moved off the document and into the
  // element that is supposed to own it.
  const scrollable = await page
    .locator('[data-slot="table-container"]')
    .first()
    .evaluate((el) => el.scrollWidth > el.clientWidth)

  expect(scrollable, 'table container should be the thing that scrolls').toBe(
    true,
  )
})

/**
 * Cumulative Layout Shift, measured the way the browser measures it.
 *
 * The observer has to exist before the document does, so it goes in an init
 * script. Shifts that follow user input are excluded, exactly as Core Web
 * Vitals does — a panel opening because someone clicked it is not a defect.
 */
async function measureCls(page: Page, route: string) {
  await page.addInitScript(() => {
    ;(window as any).__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (!entry.hadRecentInput) (window as any).__cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

  await page.goto(route)
  // Let hydration, fonts and any mount-time animation finish shifting things.
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1_500)

  return page.evaluate(() => (window as any).__cls as number)
}

for (const route of ROUTES) {
  test(`${route} does not shift around while it loads`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    const cls = await measureCls(page, route)

    // Google's "good" threshold. Anything above and the page visibly jumps
    // under the reader's eyes as it settles.
    expect(
      cls,
      `${route} has a Cumulative Layout Shift of ${cls}`,
    ).toBeLessThan(0.1)
  })
}

test('an unknown URL still renders a usable page', async ({ page }) => {
  // A 404 is a page a real visitor reaches, and it had never been looked at.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/no-such-page')

  const { scrollWidth, clientWidth, offenders } = await overflowReport(page)
  expect(
    scrollWidth,
    `the not-found page scrolls horizontally. Offenders:\n  ${offenders.join('\n  ')}`,
  ).toBeLessThanOrEqual(clientWidth + 1)

  // Whatever it says, it must not be a blank screen.
  await expect(page.locator('body')).not.toHaveText('')
})

test('a toast stays a notification, not a wall of text', async ({ page }) => {
  // A 240-character preview wrapped over seven lines and covered a third of a
  // phone screen. The layout audit passed throughout — nothing overflowed
  // sideways — which is why "no horizontal scroll" is not the same as "usable".
  await page.setViewportSize({ width: 390, height: 844 })
  await seedAnEvent(page)

  const toast = page.locator('[data-sonner-toast]').first()
  await expect(toast).toBeVisible()

  // Sonner slides and grows the toast in. Measuring mid-animation reads a
  // height that is not the one a person ends up looking at, so wait for two
  // consecutive identical measurements before judging it.
  let box = await toast.boundingBox()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const next = await toast.boundingBox()
    if (next && box && Math.abs(next.height - box.height) < 1) {
      box = next
      break
    }
    box = next
  }
  expect(box, 'toast should be laid out').not.toBeNull()
  expect(box!.height, 'a toast should not take over the screen').toBeLessThan(
    844 * 0.35,
  )
  expect(box!.width, 'a toast should fit the viewport').toBeLessThanOrEqual(390)
})

test('the home page explainer sections collapse', async ({ page }) => {
  await page.goto('/')
  // An accordion is inert until React takes over: clicking the server-rendered
  // trigger does nothing, and the test would silently assert on static markup.
  await awaitReady(page)

  const trigger = page.getByTestId('home-accordion').getByRole('button').first()
  await expect(trigger).toBeVisible()

  const before = await trigger.getAttribute('aria-expanded')

  // One click, then wait. Clicking inside a poll toggles it back and forth and
  // can never settle — the assertion has to be the thing that retries, not the
  // action.
  await trigger.click()
  await expect(trigger).not.toHaveAttribute('aria-expanded', before ?? '', {
    timeout: 15_000,
  })
})
