import { createFileRoute } from '@tanstack/react-router'
import { buildRobotsTxt } from '#/lib/seo'
import { SITE_INDEXABLE, SITE_ORIGIN } from '#/lib/site'

/**
 * `robots[.]txt.ts`, not `robots.txt.ts` — the router reads a dot in a filename
 * as a path separator, so the brackets are what keep this at `/robots.txt`
 * rather than a `txt` segment under `robots`.
 *
 * A server route rather than a static file in `public/`, because the contents
 * depend on the deployment: a Vercel preview has to disallow everything, and a
 * static file cannot know which deployment it is in.
 */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          buildRobotsTxt({ origin: SITE_ORIGIN, indexable: SITE_INDEXABLE }),
          {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'public, max-age=0, s-maxage=3600',
            },
          },
        ),
    },
  },
})
