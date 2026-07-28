import { expect, test } from '@playwright/test'

/**
 * The 404 page. It had never been configured, so TanStack Router fell back to
 * its own `defaultNotFoundComponent` — a bare `<p>Not Found</p>` with no
 * heading, no way back, and a console warning on every miss.
 *
 * The status code was always correct, and these specs hold it that way: a 404
 * that answers 200 is a soft 404, which is the version of this bug that
 * actually costs search visibility.
 */

const MISSING = '/no-such-page'

test('an unknown URL answers 404 rather than 200', async ({ page }) => {
  const response = await page.goto(MISSING)

  expect(response?.status()).toBe(404)
})

test('the not-found page explains itself', async ({ page }) => {
  await page.goto(MISSING)

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveCount(1)
  await expect(heading).toHaveText(/not found/i)

  // The default component rendered this and nothing else. If it is still the
  // whole story, the route is not configured.
  await expect(page.locator('body')).not.toHaveText('Not Found')
})

test('the not-found page offers a way back, and it works', async ({ page }) => {
  await page.goto(MISSING)

  // Scoped to the main content: the header nav links to the playground on
  // every page, so an unscoped locator would pass without the 404 page
  // offering anything of its own.
  await page
    .getByRole('main')
    .getByRole('link', { name: /playground/i })
    .click()

  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('playground')).toBeVisible()
})

test('a miss no longer warns about an unconfigured route', async ({ page }) => {
  const warnings: Array<string> = []
  page.on('console', (message) => {
    if (message.text().includes('notFoundComponent')) {
      warnings.push(message.text())
    }
  })

  await page.goto(MISSING)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  expect(warnings, warnings.join('\n')).toHaveLength(0)
})
