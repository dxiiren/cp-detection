/**
 * Generates the icon set, the share image and the web manifest into `public/`.
 *
 * Uses the Chromium that Playwright already downloads for the acceptance
 * suite, so there is no image-processing dependency to install or keep current
 * — the browser that renders the site renders its icons too. Run it with
 * `just assets`; the output is committed, so a normal build never needs it.
 *
 * The ICO writer is imported from `src/lib/ico.ts` rather than inlined here
 * because that is the one piece of this file with edge cases worth testing.
 */
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

import { icoFromPng } from '../src/lib/ico.ts'
import {
  OG_IMAGE_ALT,
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
  THEME_COLOR,
} from '../src/lib/site-content.ts'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(root, 'public')

const INK = '#173a40'
const LAGOON = '#4fb8b2'
const LAGOON_DEEP = '#328f97'
const FOAM = '#f3faf5'

/**
 * The mark: a clipboard on the brand ink. Deliberately only four shapes — at
 * 16px anything more turns to mush, and the favicon is the size that matters.
 *
 * `rounded` for the browser and Android; `square` for Apple, which ignores
 * transparency and composites the icon onto its own background, so a rounded
 * mask there shows up as dark corners.
 */
const mark = (variant) =>
  `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${variant === 'square' ? 0 : 14}" fill="${INK}"/>
  <rect x="14" y="13" width="36" height="41" rx="6" fill="${FOAM}"/>
  <rect x="25" y="7" width="14" height="12" rx="4" fill="${LAGOON}"/>
  <rect x="22" y="30" width="20" height="5" rx="2.5" fill="${LAGOON}"/>
  <rect x="22" y="40" width="13" height="5" rx="2.5" fill="${LAGOON_DEEP}"/>
</svg>`.trim()

/** woff2 inlined so the render depends on neither the network nor system fonts. */
async function fontFace(family, specifier) {
  const bytes = await readFile(require.resolve(specifier))
  return `@font-face{font-family:'${family}';font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2-variations');}`
}

async function ogHtml() {
  const fonts = [
    await fontFace(
      'Manrope Variable',
      '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2',
    ),
    await fontFace(
      'Fraunces Variable',
      '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2',
    ),
  ].join('')

  return `<!doctype html><meta charset="utf-8"><style>
    ${fonts}
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1200px;height:630px;background:${INK};color:${FOAM};
      font-family:'Manrope Variable',sans-serif;overflow:hidden;position:relative}
    .glow{position:absolute;width:900px;height:900px;right:-260px;top:-380px;border-radius:50%;
      background:radial-gradient(circle,${LAGOON}38 0%,transparent 62%)}
    .frame{position:relative;height:100%;padding:76px 80px;display:flex;flex-direction:column;
      justify-content:space-between}
    .brand{display:flex;align-items:center;gap:18px;font-size:26px;font-weight:600;
      letter-spacing:.14em;text-transform:uppercase;color:${LAGOON}}
    .brand svg{width:56px;height:56px}
    h1{font-family:'Fraunces Variable',serif;font-weight:700;font-size:82px;line-height:1.04;
      letter-spacing:-.02em;max-width:15ch}
    p{font-size:31px;line-height:1.4;color:${FOAM}c0;max-width:30ch;margin-top:26px}
    .tags{display:flex;gap:12px;flex-wrap:wrap}
    .tag{border:1px solid ${LAGOON}66;color:${LAGOON};border-radius:999px;
      padding:11px 24px;font-size:23px;font-weight:600}
  </style>
  <div class="glow"></div>
  <div class="frame">
    <div class="brand">${mark('rounded')}<span>${SITE_SHORT_NAME}</span></div>
    <div>
      <h1>Copy, cut, paste and drop &mdash; all detected.</h1>
      <p>${SITE_TAGLINE}</p>
    </div>
    <div class="tags">
      <span class="tag">Any field</span>
      <span class="tag">Keyboard &middot; menu &middot; drag</span>
      <span class="tag">Nothing leaves your browser</span>
    </div>
  </div>`
}

/** Rasterises an SVG at an exact pixel size. */
async function renderIcon(page, svg, size, { opaque = false } = {}) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
     <style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  )
  return page.screenshot({ omitBackground: !opaque })
}

async function main() {
  await mkdir(publicDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  try {
    // The SVG is the source of truth, and the one icon modern browsers prefer:
    // it is ~400 bytes and stays sharp at any size.
    await writeFile(
      join(publicDir, 'favicon.svg'),
      `${mark('rounded')}\n`,
      'utf8',
    )

    const rounded = mark('rounded')
    const sizes = [
      ['favicon-16x16.png', 16, {}],
      ['favicon-32x32.png', 32, {}],
      ['android-chrome-192x192.png', 192, {}],
      ['android-chrome-512x512.png', 512, {}],
      // Apple composites onto its own background, so this one is full-bleed.
      ['apple-touch-icon.png', 180, { opaque: true, svg: mark('square') }],
    ]

    let png32
    for (const [name, size, options] of sizes) {
      const buffer = await renderIcon(
        page,
        options.svg ?? rounded,
        size,
        options,
      )
      await writeFile(join(publicDir, name), buffer)
      if (size === 32) png32 = buffer
      console.log(
        `  ${name.padEnd(28)} ${size}x${size}  ${buffer.length} bytes`,
      )
    }

    const ico = icoFromPng(new Uint8Array(png32), 32)
    await writeFile(join(publicDir, 'favicon.ico'), ico)
    console.log(`  ${'favicon.ico'.padEnd(28)} 32x32  ${ico.length} bytes`)

    await page.setViewportSize({ width: 1200, height: 630 })
    await page.setContent(await ogHtml())
    await page.evaluate(() => document.fonts.ready)
    const og = await page.screenshot()
    await writeFile(join(publicDir, 'og.png'), og)
    console.log(`  ${'og.png'.padEnd(28)} 1200x630  ${og.length} bytes`)

    const manifest = {
      name: SITE_NAME,
      short_name: SITE_SHORT_NAME,
      description: OG_IMAGE_ALT,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: THEME_COLOR,
      icons: [
        {
          src: '/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    }
    await writeFile(
      join(publicDir, 'site.webmanifest'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
    console.log(`  ${'site.webmanifest'.padEnd(28)} written`)
  } finally {
    await browser.close()
  }
}

await main()
