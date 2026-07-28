import {
  FEATURES,
  OG_IMAGE,
  OG_IMAGE_ALT,
  PAGES,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
} from './site-content'
import type { FaqEntry } from './site-content'

/**
 * Metadata as pure functions.
 *
 * Same seam as `attribution.ts`: everything non-deterministic is passed in —
 * the origin, whether this deployment may be indexed, the lastmod date. No
 * `process.env`, no `Date.now()`. `site.ts` is the thin adapter that reads the
 * build-time constants; the routes are adapters that render what comes back.
 */

export interface HeadMetaTag {
  title?: string
  name?: string
  property?: string
  content?: string
}

export interface SitemapPage {
  path: string
  priority?: number
  changefreq?: string
}

export interface PageMetaInput {
  origin: string
  /** False for local dev and every Vercel preview. */
  indexable: boolean
  title: string
  description: string
  path: string
  image?: string
  imageAlt?: string
  siteName?: string
  locale?: string
  type?: string
}

/**
 * Absolute URL for a path. `/` and `/events/` and `events` all have to land on
 * one string, because a canonical that disagrees with itself between pages is
 * how one document gets reported as several.
 */
export function canonicalUrl(origin: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path

  const base = origin.replace(/\/+$/, '')
  const rest = path.replace(/^\/+/, '').replace(/\/+$/, '')

  return rest ? `${base}/${rest}` : `${base}/`
}

export function canonicalLink(origin: string, path: string) {
  return { rel: 'canonical', href: canonicalUrl(origin, path) } as const
}

/**
 * The full tag set for one page. Twitter's tags are spelled out rather than
 * left to fall back to Open Graph — the fallback is real but partial, and
 * `summary_large_image` has no Open Graph equivalent at all.
 */
export function pageMeta({
  origin,
  indexable,
  title,
  description,
  path,
  image = OG_IMAGE,
  imageAlt = OG_IMAGE_ALT,
  siteName = SITE_NAME,
  locale = 'en_US',
  type = 'website',
}: PageMetaInput): Array<HeadMetaTag> {
  const url = canonicalUrl(origin, path)
  const imageUrl = canonicalUrl(origin, image)

  const tags: Array<HeadMetaTag> = [
    { title },
    { name: 'description', content: description },

    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:alt', content: imageAlt },
    { property: 'og:type', content: type },
    { property: 'og:site_name', content: siteName },
    { property: 'og:locale', content: locale },

    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: imageUrl },
  ]

  // `index, follow` is the default, so saying it adds nothing. Saying the
  // opposite is the whole point: every Vercel preview has its own URL, and
  // letting those into the index is duplicate content aimed at deployments
  // that will not exist next week.
  if (!indexable) tags.push({ name: 'robots', content: 'noindex, nofollow' })

  return tags
}

/**
 * Wraps structured data for the head's `scripts` array.
 *
 * `<` is escaped because a `</script>` anywhere in the data ends the element
 * early and spills the rest of the payload into the document as markup. JSON
 * parses `<` back to `<`, so nothing is lost.
 */
export function jsonLdScript(data: unknown) {
  return {
    type: 'application/ld+json',
    children: JSON.stringify(data).replace(/</g, '\\u003c'),
  } as const
}

export function websiteJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: SITE_SHORT_NAME,
    url: canonicalUrl(origin, '/'),
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
  }
}

export function softwareApplicationJsonLd(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: canonicalUrl(origin, '/'),
    description: SITE_DESCRIPTION,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web browser',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [...FEATURES],
  }
}

export function faqJsonLd(faqs: ReadonlyArray<FaqEntry>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}

export function breadcrumbJsonLd(
  origin: string,
  trail: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: canonicalUrl(origin, crumb.path),
    })),
  }
}

export function buildRobotsTxt({
  origin,
  indexable,
}: {
  origin: string
  indexable: boolean
}): string {
  if (!indexable) {
    // Nothing to crawl, so nothing to advertise: pointing a crawler at a
    // sitemap for a site it has just been told to ignore is a mixed signal.
    return ['User-agent: *', 'Disallow: /', ''].join('\n')
  }

  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${canonicalUrl(origin, '/sitemap.xml')}`,
    '',
  ].join('\n')
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export function buildSitemapXml({
  origin,
  pages,
  lastmod,
}: {
  origin: string
  pages: ReadonlyArray<SitemapPage>
  /** ISO date (YYYY-MM-DD). Injected so the output stays reproducible. */
  lastmod: string
}): string {
  const entries = pages.map((page) => {
    const lines = [
      `    <loc>${escapeXml(canonicalUrl(origin, page.path))}</loc>`,
      `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    ]
    if (page.changefreq) {
      lines.push(`    <changefreq>${escapeXml(page.changefreq)}</changefreq>`)
    }
    if (page.priority !== undefined) {
      lines.push(`    <priority>${page.priority.toFixed(1)}</priority>`)
    }
    return `  <url>\n${lines.join('\n')}\n  </url>`
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * A curated map for AI crawlers and coding agents, not a second sitemap.
 *
 * Google has said llms.txt plays no part in its AI features, so this is aimed
 * squarely at the agents that do fetch it — Claude Code, Cursor, Copilot and
 * friends — which is the audience that matters for a developer tool. It stays
 * short on purpose: the value is in what it leaves out.
 */
export function buildLlmsTxt({ origin }: { origin: string }): string {
  const pages = Object.values(PAGES)
    .map(
      (page) =>
        `- [${page.title}](${canonicalUrl(origin, page.path)}): ${page.summary}`,
    )
    .join('\n')

  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_TAGLINE}`,
    '',
    SITE_DESCRIPTION,
    '',
    '## Pages',
    '',
    pages,
    '',
    '## Key facts',
    '',
    '- Detection is one document-level listener in the capture phase, not a handler per input, so it also catches pastes into third-party widgets and components that stop propagation.',
    '- No browser API reports whether a paste came from Ctrl+V, the right-click menu or a drag. This project infers it from event timing.',
    '- During copy and cut the event clipboard data is write-only, so character counts are taken from the selection instead.',
    '- Clipboard text is never sent to the server unless explicitly enabled, and is capped at 80 characters when it is.',
    '- Built with TanStack Start, React 19 and Tailwind. Open source, free to use.',
    '',
  ].join('\n')
}
