import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The canonical origin. Vercel exposes the *stable* production domain as
 * VERCEL_PROJECT_PRODUCTION_URL — unlike VERCEL_URL, which is unique per
 * deployment and would make every preview canonicalise to itself. SITE_URL
 * overrides it once there is a custom domain.
 */
const siteUrl =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

// Indexable only in Vercel production. Preview deployments and local dev serve
// `noindex` and a robots.txt that disallows everything: a preview in the index
// is duplicate content pointing at a URL that will not exist next week.
const siteIndexable =
  process.env.SITE_INDEXABLE === 'true' ||
  process.env.VERCEL_ENV === 'production'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Injected rather than read at runtime so the server render and the client
  // bundle cannot disagree about the canonical URL and trip a hydration diff.
  define: {
    __SITE_URL__: JSON.stringify(siteUrl.replace(/\/+$/, '')),
    __SITE_INDEXABLE__: JSON.stringify(siteIndexable),
  },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  // Port lives here rather than in the `dev` script so `--port` on the command
  // line (just dev 3005) cleanly overrides it instead of fighting a flag that
  // is already baked in. strictPort because silently drifting to 3001 leaves
  // Playwright waiting on :3000 forever.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
})

export default config
