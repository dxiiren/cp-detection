import { createFileRoute } from '@tanstack/react-router'
import { buildLlmsTxt } from '#/lib/seo'
import { SITE_ORIGIN } from '#/lib/site'

/**
 * A curated map for AI crawlers and coding agents.
 *
 * Google has stated llms.txt plays no part in AI Overviews or AI Mode, so this
 * is not a search-ranking play. It is aimed at the agents that do fetch it —
 * Claude Code, Cursor, Copilot and the like — which for a developer tool is
 * the audience worth serving.
 */
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(buildLlmsTxt({ origin: SITE_ORIGIN }), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=0, s-maxage=3600',
          },
        }),
    },
  },
})
