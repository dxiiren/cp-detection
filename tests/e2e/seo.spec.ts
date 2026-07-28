import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { awaitReady } from './helpers'

/**
 * The outer loop for metadata. Everything here is server-rendered, so unlike
 * the clipboard specs these do not wait for hydration — the whole point is
 * what a crawler sees before any JavaScript runs.
 *
 * These assertions are deliberately environment-independent. Indexability
 * varies by deployment (only Vercel production is indexable), so rather than
 * pinning a value this asserts the invariant that matters: the robots meta and
 * robots.txt must never disagree. The two branches themselves are unit-tested.
 */

const content = (page: Page, selector: string) =>
  page.locator(selector).first().getAttribute('content')

/** Every JSON-LD block on the page, parsed. */
async function jsonLd(page: Page): Promise<Array<Record<string, any>>> {
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  return raw.map((text) => JSON.parse(text))
}

test.describe('document head', () => {
  for (const path of ['/', '/events']) {
    test(`${path} has exactly one title, description and canonical`, async ({
      page,
    }) => {
      await page.goto(path)

      // More than one of any of these is not an extra hint, it is ambiguity a
      // crawler resolves however it likes.
      await expect(page.locator('head title')).toHaveCount(1)
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
      await expect(page.locator('meta[name="description"]')).toHaveCount(1)

      const description = await content(page, 'meta[name="description"]')
      expect(description?.length).toBeGreaterThanOrEqual(120)
      expect(description?.length).toBeLessThanOrEqual(165)
    })

    test(`${path} exposes an absolute canonical and og:url that agree`, async ({
      page,
      baseURL,
    }) => {
      await page.goto(path)

      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href')
      const ogUrl = await content(page, 'meta[property="og:url"]')

      expect(canonical).toBe(ogUrl)
      expect(canonical).toMatch(/^https?:\/\//)
      expect(canonical).toBe(path === '/' ? `${baseURL}/` : `${baseURL}${path}`)
    })

    test(`${path} carries a complete share card`, async ({ page, request }) => {
      await page.goto(path)

      for (const selector of [
        'meta[property="og:title"]',
        'meta[property="og:description"]',
        'meta[property="og:type"]',
        'meta[property="og:site_name"]',
        'meta[property="og:image:alt"]',
        'meta[name="twitter:title"]',
        'meta[name="twitter:description"]',
      ]) {
        await expect(page.locator(selector)).toHaveCount(1)
      }

      expect(await content(page, 'meta[name="twitter:card"]')).toBe(
        'summary_large_image',
      )

      // A card that points at a 404 renders as a grey box, which is the exact
      // failure this whole exercise is meant to remove.
      const image = await content(page, 'meta[property="og:image"]')
      expect(image).toMatch(/^https?:\/\//)
      const response = await request.get(image!)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toMatch(/^image\//)
    })

    test(`${path} has exactly one h1`, async ({ page }) => {
      await page.goto(path)

      await expect(page.locator('h1')).toHaveCount(1)
      expect(
        (await page.locator('h1').innerText()).trim().length,
      ).toBeGreaterThan(0)
    })

    test(`${path} agrees with robots.txt about being indexable`, async ({
      page,
      request,
    }) => {
      await page.goto(path)

      const robotsMeta = await page.locator('meta[name="robots"]').count()
      const robotsTxt = await (await request.get('/robots.txt')).text()

      if (robotsMeta > 0) {
        expect(await content(page, 'meta[name="robots"]')).toContain('noindex')
        expect(robotsTxt).toContain('Disallow: /')
      } else {
        expect(robotsTxt).toContain('Allow: /')
        expect(robotsTxt).toContain('Sitemap:')
      }
    })
  }

  test('the two pages do not share a title or description', async ({
    page,
  }) => {
    await page.goto('/')
    const home = {
      title: await page.title(),
      description: await content(page, 'meta[name="description"]'),
    }

    await page.goto('/events')

    expect(await page.title()).not.toBe(home.title)
    expect(await content(page, 'meta[name="description"]')).not.toBe(
      home.description,
    )
  })

  test('icons and the manifest are declared and actually resolve', async ({
    page,
    request,
  }) => {
    await page.goto('/')

    for (const selector of [
      'link[rel="icon"][type="image/svg+xml"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="manifest"]',
    ]) {
      await expect(page.locator(selector)).toHaveCount(1)
    }

    for (const href of [
      '/favicon.ico',
      '/favicon.svg',
      '/apple-touch-icon.png',
      '/site.webmanifest',
    ]) {
      expect((await request.get(href)).status(), `${href} should exist`).toBe(
        200,
      )
    }
  })

  test('the theme colour and colour scheme are declared', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
    await expect(page.locator('meta[name="color-scheme"]')).toHaveCount(1)
  })
})

test.describe('structured data', () => {
  test('every JSON-LD block on / parses and is typed', async ({ page }) => {
    await page.goto('/')

    const blocks = await jsonLd(page)
    const types = blocks.map((block) => block['@type'])

    expect(types).toContain('WebSite')
    expect(types).toContain('SoftwareApplication')
    expect(types).toContain('FAQPage')

    for (const block of blocks) {
      expect(block['@context']).toBe('https://schema.org')
    }
  })

  test('/events describes its place in the site', async ({ page }) => {
    await page.goto('/events')

    expect((await jsonLd(page)).map((block) => block['@type'])).toContain(
      'BreadcrumbList',
    )
  })

  test('the marked-up FAQ is the FAQ a visitor can actually read', async ({
    page,
  }) => {
    // Structured data that does not match visible content is a manual action
    // waiting to happen, so the page and the markup are generated from one
    // constant — and this is the check that they still are once rendered.
    await page.goto('/')

    const faq = (await jsonLd(page)).find(
      (block) => block['@type'] === 'FAQPage',
    )
    expect(faq).toBeDefined()

    const body = await page.locator('body').innerText()
    for (const entry of faq!.mainEntity) {
      expect(body, `question missing from the page: ${entry.name}`).toContain(
        entry.name,
      )
    }
  })
})

test.describe('machine-readable endpoints', () => {
  const endpoints = [
    { path: '/robots.txt', type: /text\/plain/ },
    { path: '/sitemap.xml', type: /xml/ },
    { path: '/llms.txt', type: /text\/plain/ },
    { path: '/site.webmanifest', type: /json/ },
  ]

  for (const { path, type } of endpoints) {
    test(`${path} is served with the right content type`, async ({
      request,
    }) => {
      const response = await request.get(path)

      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toMatch(type)
      expect((await response.text()).length).toBeGreaterThan(0)
    })
  }

  test('the sitemap lists every real page', async ({ request, baseURL }) => {
    const xml = await (await request.get('/sitemap.xml')).text()

    expect(xml).toContain(`<loc>${baseURL}/</loc>`)
    expect(xml).toContain(`<loc>${baseURL}/events</loc>`)
    // The sitemap advertises pages, not the files describing them.
    expect(xml).not.toContain('robots.txt')
    expect(xml).not.toContain('sitemap.xml')
  })

  test('llms.txt points at the real pages', async ({ request, baseURL }) => {
    const txt = await (await request.get('/llms.txt')).text()

    expect(txt).toContain(`${baseURL}/`)
    expect(txt).toContain(`${baseURL}/events`)
  })
})

test.describe('page weight', () => {
  test('no request on / 404s', async ({ page }) => {
    // A 404 favicon or font is the cheapest possible own goal.
    const missing: Array<string> = []
    page.on('response', (response) => {
      if (response.status() === 404) missing.push(response.url())
    })

    await page.goto('/')
    // Shared gate rather than a bare 5-second default: on a loaded machine a
    // cold dev server takes longer than that to hydrate, and this spec then
    // failed for reasons that had nothing to do with 404s.
    await awaitReady(page)

    expect(missing).toEqual([])
  })

  test('nothing is fetched from Google Fonts', async ({ page }) => {
    // The fonts are self-hosted; a request here means the @import came back.
    const external: Array<string> = []
    page.on('request', (request) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
        external.push(request.url())
      }
    })

    await page.goto('/')
    expect(external).toEqual([])
  })
})
