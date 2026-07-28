import { Link } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'

/**
 * The 404 page.
 *
 * Wired up as the root route's `notFoundComponent`. Without one, TanStack
 * Router renders its `defaultNotFoundComponent` — a bare `<p>Not Found</p>`
 * that gives a visitor no heading to orient on and no way out, and warns about
 * itself on every miss.
 *
 * The links are deliberately inside `<main>` rather than left to the header
 * nav. A dead end is the one page where the way back should be the content,
 * not chrome the reader has to go looking for.
 */
export function NotFound() {
  return (
    <section className="py-12">
      <p className="text-muted-foreground font-mono text-sm">404</p>
      <h1 className="display-title mt-2 text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
        Page not found
      </h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        That address does not match anything here. It may have been mistyped, or
        it may never have existed.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/">Back to the playground</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/events">See the events log</Link>
        </Button>
      </div>
    </section>
  )
}
