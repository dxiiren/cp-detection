import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  awaitReady,
  copyFromField,
  dropText,
  navigateTo,
  pasteViaContextMenu,
  pasteViaKeyboard,
} from './helpers'

const SAMPLE = 'acme-corp-invoice-2026@example.com'

/**
 * Scoped by text rather than by index: several toasts can be on screen at
 * once, and their stacking order is sonner's business, not this suite's.
 * Asserting the method on the *same* toast as the title is also stricter than
 * checking both against the whole toast region.
 */
const toastWith = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text })

/**
 * Finds a server-log row by its character count, matching the CELL exactly.
 *
 * A row's textContent concatenates every cell with no separator, so filtering
 * on bare text is a trap: a chars cell of `13` followed by a `9:39:05`
 * timestamp reads as `139` and silently matches the wrong row. The server log
 * is shared by every test in the run, so that collision is not hypothetical.
 */
const serverRowWithChars = (page: Page, chars: number) =>
  page
    .locator('[data-testid="server-events-table"] [data-testid="event-row"]')
    .filter({
      has: page.getByRole('cell', { name: String(chars), exact: true }),
    })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Detection is installed in an effect, so the server-rendered markup is not
  // enough — a paste fired before hydration lands natively and silently, and
  // the suite would pass or fail on timing rather than on behaviour.
  // Generous on purpose: this is a readiness gate, not an assertion about how
  // fast the app hydrates. Under parallel workers on a cold dev server a
  // 5-second default fails here for reasons that have nothing to do with
  // clipboard behaviour, and a flaky precondition teaches you to ignore reds.
  await awaitReady(page)
})

test('keyboard paste into a field is detected and attributed to the shortcut', async ({
  page,
}) => {
  await pasteViaKeyboard(page, '#email', SAMPLE)

  await expect(page.locator('#email')).toHaveValue(SAMPLE)
  const toast = toastWith(page, `Pasted ${SAMPLE.length} chars into Email`)
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('via keyboard')
})

test('a paste with no preceding shortcut is attributed to right-click', async ({
  page,
}) => {
  await pasteViaContextMenu(page, '#notes', SAMPLE)

  const toast = toastWith(page, `Pasted ${SAMPLE.length} chars into Notes`)
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('via right-click')
})

test('dragged-and-dropped text is detected as a drop, not a paste', async ({
  page,
}) => {
  await dropText(page, '#notes', SAMPLE)

  const toast = toastWith(page, `Dropped ${SAMPLE.length} chars into Notes`)
  await expect(toast).toBeVisible()
  await expect(toast).toContainText('via drag & drop')
})

test('copy and cut each raise their own toast', async ({ page }) => {
  await page.locator('#email').fill(SAMPLE)

  await copyFromField(page, '#email', 'copy')
  await expect(
    toastWith(page, `Copied ${SAMPLE.length} chars from Email`),
  ).toBeVisible()

  await copyFromField(page, '#email', 'cut')
  await expect(
    toastWith(page, `Cut ${SAMPLE.length} chars from Email`),
  ).toBeVisible()
})

test('a protected field blocks the paste and says so', async ({ page }) => {
  // Protection is on by default.
  await pasteViaKeyboard(page, '#confirm-email', SAMPLE)

  await expect(page.locator('#confirm-email')).toHaveValue('')
  await expect(toastWith(page, 'Paste blocked')).toBeVisible()

  // Turning protection off lets the same paste through.
  await page.getByTestId('toggle-block').click()
  await expect(page.getByTestId('toggle-block')).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await pasteViaKeyboard(page, '#confirm-email', SAMPLE)
  await expect(page.locator('#confirm-email')).toHaveValue(SAMPLE)
})

test('a field with no paste handler of its own is still detected', async ({
  page,
}) => {
  await pasteViaKeyboard(page, '#referral', SAMPLE)

  await expect(page.locator('#referral')).toHaveValue(SAMPLE)
  await expect(
    toastWith(page, `Pasted ${SAMPLE.length} chars into Referral code`),
  ).toBeVisible()
})

test('events reach the server, and the server is told nothing it should not know', async ({
  page,
}) => {
  // A distinctive length makes this run's row findable in a log the other
  // tests in this file are also writing to.
  const secret = 'z'.repeat(137)

  await pasteViaKeyboard(page, '#email', secret)
  await expect(toastWith(page, 'Pasted 137 chars into Email')).toBeVisible()

  await navigateTo(page, 'Events')
  await page.getByRole('tab', { name: /Server log/ }).click()

  const row = serverRowWithChars(page, 137)

  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Email')
  await expect(row).toContainText('keyboard')
  // The clipboard text itself must not have made the trip.
  await expect(row).not.toContainText('zzz')
})

test('opting in is what sends an excerpt, and it is capped', async ({
  page,
}) => {
  const long = 'q'.repeat(139)

  await page.getByTestId('toggle-preview').click()
  await expect(page.getByTestId('toggle-preview')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await pasteViaKeyboard(page, '#notes', long)
  await expect(toastWith(page, 'Pasted 139 chars into Notes')).toBeVisible()

  await navigateTo(page, 'Events')
  await page.getByRole('tab', { name: /Server log/ }).click()

  const row = serverRowWithChars(page, 139)

  await expect(row).toHaveCount(1)
  await expect(row).toContainText('qqq')
  // Truncated to the 80-char preview limit, never the whole 139.
  expect((await row.innerText()).match(/q+/)?.[0].length).toBe(80)
})

test('toast dwell time is configurable', async ({ page }) => {
  await page.getByTestId('toast-seconds').fill('1')
  await pasteViaKeyboard(page, '#email', 'x'.repeat(11))

  const toast = toastWith(page, 'Pasted 11 chars into Email')
  await expect(toast).toBeVisible()
  await expect(toast).toHaveCount(0, { timeout: 8_000 })
})

test('toasts can be pinned open and cleared on demand', async ({ page }) => {
  await page.getByTestId('toast-seconds').fill('1')
  await page.getByTestId('toggle-keep-toasts').click()
  await expect(page.getByTestId('toggle-keep-toasts')).toHaveAttribute(
    'aria-checked',
    'true',
  )

  await pasteViaKeyboard(page, '#email', 'y'.repeat(12))
  const toast = toastWith(page, 'Pasted 12 chars into Email')
  await expect(toast).toBeVisible()

  // Well past the 1s it would otherwise have lived for.
  await page.waitForTimeout(4_000)
  await expect(toast).toBeVisible()

  await page.getByTestId('clear-toasts').click()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})

test('a long paste is previewed without cutting a word in half', async ({
  page,
}) => {
  const sentence =
    'ForcePaste Smart Clipboard Typer simulates real typing so that a paste ' +
    'looks like it came from the keyboard and slips past naive detection'

  await pasteViaKeyboard(page, '#notes', sentence)

  const toast = toastWith(page, `Pasted ${sentence.length} chars into Notes`)
  await expect(toast).toBeVisible()

  const shown = (await toast.innerText()).match(/“(.+?)”/)?.[1] ?? ''
  // Longer than the 80 chars the server may ever receive...
  expect(shown.length).toBeGreaterThan(80)
  // ...and it ends on a whole word, not a fragment.
  expect(shown.replace(/…$/, '')).toMatch(/\w$/)
  expect(sentence).toContain(shown.replace(/…$/, ''))
})

test('a real paste and a scripted one are told apart', async ({ page }) => {
  // Event.isTrusted is the first thing a real anti-fraud or exam platform
  // checks: a genuine keystroke sets it, anything dispatched by a script
  // cannot. Recorded rather than filtered, so the scripted row is visible.
  await pasteViaKeyboard(page, '#email', 'genuine-paste')
  await pasteViaContextMenu(page, '#notes', 'scripted-paste')

  await navigateTo(page, 'Events')
  const rows = page.getByTestId('event-row')

  await expect(rows.filter({ hasText: 'Notes' })).toContainText('script')
  await expect(rows.filter({ hasText: 'Email' })).toContainText('user')
})

test('a password is counted but never quoted anywhere', async ({ page }) => {
  const secret = 'hunter2-correct-horse-battery'

  // Opt IN to sending excerpts — the point is that a sensitive field is
  // withheld even when the user has asked for previews everywhere else.
  await page.getByTestId('toggle-preview').click()
  await expect(page.getByTestId('toggle-preview')).toHaveAttribute(
    'aria-checked',
    'true',
  )

  await pasteViaKeyboard(page, '#secret', secret)

  const toast = toastWith(page, `Pasted ${secret.length} chars into Password`)
  await expect(toast).toBeVisible()
  await expect(toast).not.toContainText('hunter2')

  await navigateTo(page, 'Events')
  await expect(page.getByTestId('events-table')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('hunter2')

  await page.getByRole('tab', { name: /Server log/ }).click()
  await expect(page.locator('body')).not.toContainText('hunter2')
})

test('copying out of the rich-text area is detected', async ({ page }) => {
  // The contenteditable branch of the selection reader had no coverage at all;
  // jsdom cannot exercise getSelection() honestly, so it belongs out here.
  await page.locator('#bio').click()
  await page.keyboard.type('quarterly revenue figures')
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+C')

  await expect(toastWith(page, 'Copied 25 chars from Bio')).toBeVisible()
})

test('the events log lists every detected event', async ({ page }) => {
  await pasteViaKeyboard(page, '#email', SAMPLE)
  await dropText(page, '#notes', 'dropped-text')
  await pasteViaContextMenu(page, '#notes', 'right-clicked-text')

  await navigateTo(page, 'Events')
  await expect(page.getByTestId('events-table')).toBeVisible()

  const rows = page.getByTestId('event-row')
  await expect(rows).toHaveCount(3)

  // Newest first.
  await expect(rows.nth(0)).toContainText('right-click')
  await expect(rows.nth(1)).toContainText('drop')
  await expect(rows.nth(2)).toContainText('keyboard')
  await expect(rows.nth(2)).toContainText('Email')
  await expect(rows.nth(2)).toContainText(String(SAMPLE.length))
})
