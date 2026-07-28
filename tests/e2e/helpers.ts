import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Waits until the page is actually live before touching it.
 *
 * Detection is installed in an effect, so server-rendered markup looks
 * identical to a working page while doing nothing: a paste fired too early
 * lands natively and is silently missed, and the suite then passes or fails on
 * timing rather than behaviour.
 *
 * The timeout is deliberately generous. This is a readiness gate, not an
 * assertion about how fast the app hydrates — and on a loaded machine (a
 * production build running alongside the suite, say) a cold Vite dev server
 * has genuinely taken over thirty seconds to get here.
 */
export async function awaitReady(page: Page) {
  await expect(page.getByTestId('playground')).toHaveAttribute(
    'data-detecting',
    'true',
    // Comfortably inside playwright.config's per-test budget: a gate that can
    // outlast the test it guards just converts a slow start into a timeout.
    { timeout: 40_000 },
  )
}

/**
 * Clicks a link in the site header.
 *
 * Scoped to the header nav rather than the whole page because Playwright
 * matches an accessible name as a case-insensitive *substring* by default:
 * once the landing copy and the footer also linked to the events log, a bare
 * `getByRole('link', { name: 'Events' })` matched three elements and failed on
 * strict mode rather than on behaviour.
 */
export async function navigateTo(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name })
    .click()
}

/**
 * A real OS-level paste: puts text on the system clipboard and presses the
 * paste shortcut. Chromium actually mutates the field, and the app sees a
 * trusted `paste` event preceded by the shortcut keydown.
 */
export async function pasteViaKeyboard(
  page: Page,
  selector: string,
  text: string,
) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text)
  await page.locator(selector).click()
  await page.keyboard.press('ControlOrMeta+V')
}

/**
 * Approximates a right-click -> Paste: a `paste` event carrying clipboard data
 * with no preceding keyboard shortcut. Synthetic events are untrusted, so the
 * field value does NOT change here — only the detection is under test.
 */
export async function pasteViaContextMenu(
  page: Page,
  selector: string,
  text: string,
) {
  await page.locator(selector).click()
  // Let any keydown from the click settle outside the attribution window.
  await page.waitForTimeout(400)
  await page.evaluate(
    ({ sel, t }) => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`no element for ${sel}`)
      const data = new DataTransfer()
      data.setData('text/plain', t)
      el.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { sel: selector, t: text },
  )
}

/** Drag-and-drop of plain text onto a field. Never fires a `paste` event. */
export async function dropText(page: Page, selector: string, text: string) {
  await page.evaluate(
    ({ sel, t }) => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`no element for ${sel}`)
      const data = new DataTransfer()
      data.setData('text/plain', t)
      el.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        }),
      )
      el.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { sel: selector, t: text },
  )
}

/** Selects the whole field and copies (or cuts) it with the real shortcut. */
export async function copyFromField(
  page: Page,
  selector: string,
  mode: 'copy' | 'cut' = 'copy',
) {
  await page.locator(selector).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press(
    mode === 'copy' ? 'ControlOrMeta+C' : 'ControlOrMeta+X',
  )
}
