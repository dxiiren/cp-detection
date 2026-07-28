import { createFileRoute } from '@tanstack/react-router'
import { buildSitemapXml } from '#/lib/seo'
import { SITE_ORIGIN } from '#/lib/site'
import { PAGES } from '#/lib/site-content'

/**
 * TanStack Start can emit a sitemap at build time via the plugin's `sitemap`
 * option, but that only writes during `vite build` — and the acceptance suite
 * runs against the dev server, so a build-time file would be untestable by the
 * layer that catches everything else. A server route behaves identically in
 * dev and on Vercel, and the XML itself is built by a pure, unit-tested
 * function.
 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const xml = buildSitemapXml({
          origin: SITE_ORIGIN,
          pages: Object.values(PAGES),
          // Date, not time: `lastmod` is a date-level hint, and minting a new
          // timestamp on every request tells crawlers the site changes
          // constantly, which trains them to stop believing it.
          lastmod: new Date().toISOString().slice(0, 10),
        })

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=0, s-maxage=3600',
          },
        })
      },
    },
  },
})
