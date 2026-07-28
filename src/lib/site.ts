import { SITE_ORIGIN_FALLBACK } from './site-content'

/**
 * The adapter over the build-time constants — the only module that touches
 * them, so `seo.ts` stays pure and testable without a bundler.
 *
 * `typeof` rather than a bare reference: Vite replaces the identifier
 * textually, but under Vitest there is no `define` and an undeclared
 * identifier would throw on evaluation.
 */
export const SITE_ORIGIN: string =
  typeof __SITE_URL__ === 'string' && __SITE_URL__
    ? __SITE_URL__
    : SITE_ORIGIN_FALLBACK

/**
 * Only a Vercel production deployment is indexable. Previews each get their
 * own URL, so indexing them would report the same content at a dozen
 * throwaway addresses; local dev has no business in an index at all.
 */
export const SITE_INDEXABLE: boolean =
  typeof __SITE_INDEXABLE__ === 'boolean' ? __SITE_INDEXABLE__ : false
