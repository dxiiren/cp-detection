import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * The same acceptance suite, pointed at the production build.
 *
 * Everything else in this repo runs against the Vite dev server, and dev Vite
 * is not what ships: the build minifies, tree-shakes, pre-bundles and serves
 * through nitro rather than the dev pipeline. For a long time that gap was a
 * documented known limit and the SEO specs were re-run against `just preview`
 * by hand; this config is that hand run, automated.
 *
 * It runs the built server entry directly rather than `vite preview`. The
 * first automated run against `vite preview` failed on site.webmanifest
 * arriving as application/octet-stream — but the failure belonged to vite
 * preview's own static layer, not to the build: the nitro output's asset
 * manifest carries application/manifest+json, and so does Vercel's CDN. The
 * server below is the one nitro's own `.output/nitro.json` names as its
 * preview command, and the one whose behaviour actually ships.
 *
 * `just e2e-prod` is the way in — it builds first and frees the port, because
 * of the one deliberate difference here: `reuseExistingServer` is FALSE even
 * locally. The dev config happily reuses whatever is on :3000; if this config
 * did the same, a forgotten dev server would pass its dev behaviour off as
 * the build's, and the whole point of the run would silently evaporate.
 */
export default defineConfig({
  ...base,
  webServer: {
    command: 'node .output/server/index.mjs',
    url: 'http://localhost:3000',
    env: { PORT: '3000' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
