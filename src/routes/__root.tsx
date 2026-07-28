import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ClipboardCheck } from 'lucide-react'

import { NotFound } from '#/components/not-found'
import { Toaster } from '#/components/ui/sonner'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import {
  jsonLdScript,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from '#/lib/seo'
import { SITE_ORIGIN } from '#/lib/site'
import { SITE_NAME, SITE_TAGLINE, THEME_COLOR } from '#/lib/site-content'
import { themeInitScript } from '#/lib/theme'
import { ThemeToggle } from '#/components/theme-toggle'

import appCss from '../styles.css?url'
// Preloaded rather than left for the browser to discover inside the stylesheet:
// the hero heading is the LCP element, and its font should not have to wait for
// a CSS parse to be requested.
import frauncesWoff2 from '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url'
import manropeWoff2 from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'light dark' },
      // One tag, not a light/dark pair: the head dedupes meta by `name`, so a
      // second `theme-color` differing only by `media` would silently replace
      // the first rather than sit beside it.
      { name: 'theme-color', content: THEME_COLOR },
      // Fallbacks. Both content routes override these, and the head dedupes
      // title and description down to the deepest match, so these surface only
      // on a route that sets nothing of its own.
      { title: SITE_NAME },
      { name: 'description', content: SITE_TAGLINE },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // SVG first — the format modern browsers prefer, sharp at any size. The
      // .ico is declared so `/favicon.ico`, which browsers and crawlers request
      // whether or not it is advertised, is not a 404.
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
      { rel: 'manifest', href: '/site.webmanifest' },
      {
        rel: 'preload',
        href: manropeWoff2,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: frauncesWoff2,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
    ],
    // Site-wide structured data. Page-specific blocks (FAQPage, BreadcrumbList)
    // are added by the routes that own them.
    scripts: [
      jsonLdScript(websiteJsonLd(SITE_ORIGIN)),
      jsonLdScript(softwareApplicationJsonLd(SITE_ORIGIN)),
    ],
  }),
  // Configured here so every miss anywhere in the tree lands on it. Left
  // unset, the router falls back to `defaultNotFoundComponent` — a bare
  // `<p>Not Found</p>` — and warns about it on the server for each request.
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The init script below sets a class and an inline style on this element
    // before React hydrates, so the server markup and the live DOM genuinely
    // differ here. That is the intended behaviour, not a bug to warn about.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking, inline, and ahead of everything: applying the theme in an
            effect instead paints the light theme first and repaints it dark,
            which is the flash users notice.

            `dangerouslySetInnerHTML` is the only way to emit an inline script
            from JSX, and it is safe here in the way that actually matters:
            `themeInitScript()` takes no argument at this call site and closes
            over nothing but a module constant, so no request, storage or user
            value reaches the string. A spec asserts it can never contain a
            closing script tag. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        <HeadContent />
      </head>
      <body className="bg-background text-foreground flex min-h-screen flex-col">
        <header className="border-b">
          {/* Labelled so specs can scope to it. The footer and the landing copy
              now link to these routes too, and Playwright matches an accessible
              name as a substring, so an unscoped link locator is ambiguous. */}
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4"
          >
            <span className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="size-5" aria-hidden />
              Clipboard detector
            </span>
            <Link
              to="/"
              className="text-muted-foreground hover:text-foreground text-sm [&.active]:text-foreground [&.active]:font-medium"
              activeOptions={{ exact: true }}
            >
              Playground
            </Link>
            <Link
              to="/events"
              className="text-muted-foreground hover:text-foreground text-sm [&.active]:text-foreground [&.active]:font-medium"
            >
              Events
            </Link>
            <ThemeToggle />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl grow px-6 py-8">
          {children}
        </main>
        <footer className="site-footer mt-16">
          <div className="text-muted-foreground mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6 text-sm">
            <span className="font-medium">{SITE_NAME}</span>
            {/* These pick up the site link colour from the unlayered `a` rule
                in styles.css, which beats any Tailwind text utility put here —
                utilities are in a cascade layer and that rule is not. */}
            <Link to="/">Playground</Link>
            <Link to="/events">Events log</Link>
            <a href="/llms.txt">llms.txt</a>
          </div>
        </footer>
        <Toaster position="bottom-right" closeButton richColors />
        {/* Deliberately unguarded. `TanStackDevtools` has no production check of
            its own, but the `devtools()` Vite plugin strips this element and
            the packages behind it from the production build — it logs
            "Removed devtools code from: /src/routes/__root.tsx". An
            `import.meta.env.DEV` guard here changed the built bundle by two
            bytes, so it bought nothing but noise. */}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
