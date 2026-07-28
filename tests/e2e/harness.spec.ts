import { expect, test } from '@playwright/test'

// Sanity spec: proves the Playwright webServer boots the TanStack Start dev
// server and that clipboard permissions are grantable in this browser.
test('dev server boots and clipboard permissions are granted', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()

  await page.evaluate(() => navigator.clipboard.writeText('harness-check'))
  const readBack = await page.evaluate(() => navigator.clipboard.readText())
  expect(readBack).toBe('harness-check')
})
