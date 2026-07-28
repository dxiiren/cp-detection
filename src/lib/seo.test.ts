import { describe, expect, it } from 'vitest'
import { FAQ, PAGES, SITE_NAME, SITE_ORIGIN_FALLBACK } from './site-content'
import {
  breadcrumbJsonLd,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  canonicalUrl,
  faqJsonLd,
  jsonLdScript,
  pageMeta,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from './seo'
import type { HeadMetaTag } from './seo'

const ORIGIN = 'https://example.com'

/** Keys a tag the way the head's dedupe keys it: name, else property. */
const keyOf = (tag: HeadMetaTag) =>
  tag.name ?? tag.property ?? (tag.title !== undefined ? 'title' : '')

const metaFor = (overrides: Partial<Parameters<typeof pageMeta>[0]> = {}) =>
  pageMeta({
    origin: ORIGIN,
    indexable: true,
    title: 'A title',
    description: 'A description',
    path: '/',
    ...overrides,
  })

const find = (tags: ReturnType<typeof pageMeta>, key: string) =>
  tags.find((tag) => keyOf(tag) === key)

describe('canonicalUrl', () => {
  it('joins an origin and a path with exactly one slash', () => {
    expect(canonicalUrl(ORIGIN, '/events')).toBe('https://example.com/events')
  })

  it('does not double the slash when the origin carries one', () => {
    expect(canonicalUrl('https://example.com/', '/events')).toBe(
      'https://example.com/events',
    )
  })

  it('tolerates a path given without a leading slash', () => {
    expect(canonicalUrl(ORIGIN, 'events')).toBe('https://example.com/events')
  })

  it('keeps the root as a bare trailing slash', () => {
    // '/' and '' are the same page; canonicalising them differently is how a
    // site reports two URLs for one document.
    expect(canonicalUrl(ORIGIN, '/')).toBe('https://example.com/')
    expect(canonicalUrl(ORIGIN, '')).toBe('https://example.com/')
  })

  it('strips a trailing slash from a non-root path', () => {
    expect(canonicalUrl(ORIGIN, '/events/')).toBe('https://example.com/events')
  })

  it('is idempotent when handed a URL that is already absolute', () => {
    expect(canonicalUrl(ORIGIN, 'https://cdn.example.com/og.png')).toBe(
      'https://cdn.example.com/og.png',
    )
  })
})

describe('pageMeta', () => {
  it('emits the title as its own entry', () => {
    expect(metaFor({ title: 'Events log' })).toContainEqual({
      title: 'Events log',
    })
  })

  it('emits a description', () => {
    expect(
      find(metaFor({ description: 'What it does' }), 'description'),
    ).toEqual({
      name: 'description',
      content: 'What it does',
    })
  })

  it('gives Open Graph an absolute url and image', () => {
    const tags = metaFor({ path: '/events', image: '/og.png' })

    expect(find(tags, 'og:url')?.content).toBe('https://example.com/events')
    expect(find(tags, 'og:image')?.content).toBe('https://example.com/og.png')
  })

  it('carries the full Open Graph and Twitter set a share card needs', () => {
    const keys = metaFor().map(keyOf)

    for (const key of [
      'og:title',
      'og:description',
      'og:url',
      'og:image',
      'og:image:alt',
      'og:type',
      'og:site_name',
      'og:locale',
      'twitter:card',
      'twitter:title',
      'twitter:description',
      'twitter:image',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('asks for the large summary card, not the thumbnail one', () => {
    expect(find(metaFor(), 'twitter:card')?.content).toBe('summary_large_image')
  })

  it('never repeats a name or property', () => {
    // The head dedupes by name/property and keeps the last one, so a duplicate
    // is a tag silently losing to itself rather than an obvious error.
    const keys = metaFor().map(keyOf)

    expect(keys).toHaveLength(new Set(keys).size)
  })

  it('omits a robots directive when the page is indexable', () => {
    // `index, follow` is the default; stating it is noise.
    expect(find(metaFor({ indexable: true }), 'robots')).toBeUndefined()
  })

  it('emits noindex when the deployment must not be indexed', () => {
    // Every Vercel preview gets its own URL. Indexing them is duplicate
    // content pointing at throwaway deployments.
    expect(find(metaFor({ indexable: false }), 'robots')?.content).toBe(
      'noindex, nofollow',
    )
  })

  it('still emits a canonical when the page is not indexable', () => {
    // Canonical and indexability are separate questions, and a preview that
    // drops the canonical is a preview whose head cannot be tested.
    expect(find(metaFor({ indexable: false }), 'og:url')?.content).toBe(
      'https://example.com/',
    )
  })
})

describe('page content', () => {
  it('gives every page a distinct path and title', () => {
    const pages = Object.values(PAGES)
    const paths = pages.map((page) => page.path)
    const titles = pages.map((page) => page.title)

    expect(paths).toHaveLength(new Set(paths).size)
    expect(titles).toHaveLength(new Set(titles).size)
  })

  it('keeps every title short enough to survive the search results page', () => {
    for (const page of Object.values(PAGES)) {
      expect(
        page.title.length,
        `title too long: ${page.title}`,
      ).toBeLessThanOrEqual(60)
    }
  })

  it('keeps every description in the range Google actually renders', () => {
    for (const page of Object.values(PAGES)) {
      expect(
        page.description.length,
        `description out of range: ${page.description}`,
      ).toBeGreaterThanOrEqual(120)
      expect(page.description.length).toBeLessThanOrEqual(165)
    }
  })
})

describe('structured data', () => {
  it('describes the site itself', () => {
    const data = websiteJsonLd(ORIGIN) as Record<string, unknown>

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('WebSite')
    expect(data.url).toBe('https://example.com/')
    expect(data.name).toBe(SITE_NAME)
  })

  it('describes the software, free and browser-based', () => {
    const data = softwareApplicationJsonLd(ORIGIN) as Record<string, any>

    expect(data['@type']).toBe('SoftwareApplication')
    expect(data.applicationCategory).toBe('DeveloperApplication')
    expect(data.operatingSystem).toBe('Web browser')
    expect(data.offers.price).toBe('0')
  })

  it('turns every FAQ entry into a Question', () => {
    // Google requires the structured data to match what a visitor can read,
    // so this is generated from the same constant the page renders.
    const data = faqJsonLd(FAQ) as Record<string, any>

    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(FAQ.length)
    expect(data.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: FAQ[0].question,
      acceptedAnswer: { '@type': 'Answer', text: FAQ[0].answer },
    })
  })

  it('has an FAQ worth marking up at all', () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(4)
    for (const entry of FAQ) {
      expect(entry.question.endsWith('?')).toBe(true)
      expect(entry.answer.length).toBeGreaterThan(40)
    }
  })

  it('numbers breadcrumb positions from one, with absolute urls', () => {
    const data = breadcrumbJsonLd(ORIGIN, [
      { name: 'Home', path: '/' },
      { name: 'Events', path: '/events' },
    ]) as Record<string, any>

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement[0].position).toBe(1)
    expect(data.itemListElement[1]).toEqual({
      '@type': 'ListItem',
      position: 2,
      name: 'Events',
      item: 'https://example.com/events',
    })
  })

  it('serialises to a script the head can render', () => {
    const script = jsonLdScript({ '@type': 'WebSite' })

    expect(script.type).toBe('application/ld+json')
    expect(JSON.parse(script.children)).toEqual({ '@type': 'WebSite' })
  })

  it('does not let a closing tag in the data break out of the script', () => {
    // `</script>` inside JSON-LD ends the element early and dumps the rest of
    // the payload into the document as markup.
    const script = jsonLdScript({ name: '</script><img onerror=x>' })

    expect(script.children).not.toContain('</script>')
    expect(JSON.parse(script.children).name).toBe('</script><img onerror=x>')
  })
})

describe('buildRobotsTxt', () => {
  it('allows everything and points at the sitemap when indexable', () => {
    const txt = buildRobotsTxt({ origin: ORIGIN, indexable: true })

    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Allow: /')
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(txt).not.toContain('Disallow: /')
  })

  it('disallows everything when the deployment must not be indexed', () => {
    const txt = buildRobotsTxt({ origin: ORIGIN, indexable: false })

    expect(txt).toContain('Disallow: /')
    expect(txt).not.toContain('Allow: /')
    // Nothing to crawl means nothing to advertise.
    expect(txt).not.toContain('Sitemap:')
  })

  it('ends with a newline, as every line-oriented format should', () => {
    expect(
      buildRobotsTxt({ origin: ORIGIN, indexable: true }).endsWith('\n'),
    ).toBe(true)
  })
})

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml({
    origin: ORIGIN,
    lastmod: '2026-07-28',
    pages: [
      { path: '/', priority: 1, changefreq: 'weekly' },
      { path: '/events', priority: 0.6, changefreq: 'weekly' },
    ],
  })

  it('declares itself as a sitemap document', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
  })

  it('lists every page as an absolute url', () => {
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/events</loc>')
  })

  it('carries the injected lastmod rather than reading a clock', () => {
    // The clock stays out of the pure layer so the output is reproducible.
    expect(xml.match(/<lastmod>2026-07-28<\/lastmod>/g)).toHaveLength(2)
  })

  it('records priority and change frequency', () => {
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).toContain('<priority>0.6</priority>')
    expect(xml).toContain('<changefreq>weekly</changefreq>')
  })

  it('escapes XML metacharacters in a url', () => {
    const escaped = buildSitemapXml({
      origin: ORIGIN,
      lastmod: '2026-07-28',
      pages: [{ path: '/search?a=1&b=2' }],
    })

    expect(escaped).toContain(
      '<loc>https://example.com/search?a=1&amp;b=2</loc>',
    )
    expect(escaped).not.toContain('a=1&b=2')
  })

  it('omits optional elements it was not given', () => {
    const bare = buildSitemapXml({
      origin: ORIGIN,
      lastmod: '2026-07-28',
      pages: [{ path: '/' }],
    })

    expect(bare).not.toContain('<priority>')
    expect(bare).not.toContain('<changefreq>')
  })
})

describe('buildLlmsTxt', () => {
  const txt = buildLlmsTxt({ origin: ORIGIN })

  it('opens with the single H1 the format expects', () => {
    expect(txt.startsWith(`# ${SITE_NAME}\n`)).toBe(true)
    expect(txt.match(/^# /gm)).toHaveLength(1)
  })

  it('carries a blockquote summary directly under the heading', () => {
    expect(txt).toMatch(/^> .+/m)
  })

  it('links every page as an absolute url', () => {
    for (const page of Object.values(PAGES)) {
      expect(txt).toContain(canonicalUrl(ORIGIN, page.path))
    }
  })

  it('stays a curated map rather than a second sitemap', () => {
    expect(txt.length).toBeLessThan(4000)
  })
})

describe('SITE_ORIGIN_FALLBACK', () => {
  it('is an absolute url with no trailing slash', () => {
    expect(SITE_ORIGIN_FALLBACK).toMatch(/^https?:\/\//)
    expect(SITE_ORIGIN_FALLBACK.endsWith('/')).toBe(false)
  })
})
