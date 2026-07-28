# cp-detection

Clipboard-activity detector: catches copy / cut / paste / drag-drop on **any** input on the page,
toasts each one, and logs them. TanStack Start + shadcn/ui.

Full plan: `C:\Users\kollectsystems\.claude\plans\harmonic-tinkering-dove.md`

## Working agreement

**TDD, strictly.** No implementation file is written before a test that fails for the right reason.
Red → green → refactor, and the red output gets shown, not asserted.

Task runner is `just` (`just --list`); recipes wrap the pnpm scripts and add guards.
`pwsh ./setup.ps1` bootstraps a fresh machine — no admin, no VPN.

- `just test` — Vitest. Two projects: `unit` (node, `src/**/*.test.ts`) and `dom` (jsdom, `src/**/*.dom.test.tsx`).
  Narrow with `just test-unit` / `just test-dom`; `just watch` is the inner loop.
- `just e2e` — Playwright, Chromium only (clipboard permissions aren't grantable elsewhere).
  `just e2e-headed` / `just e2e-ui` to watch or debug.
- `just verify` — the full gate: typecheck, lint, vitest, playwright. Run before pushing.
- `just start` — kill the dev port, then run the dev server. Prefer this over `just dev`: a stale
  dev server serving an old module graph presents identically to a hydration bug, and cost real
  debugging time during the build. `just stop` alone when you just want the port free.

The dev port lives in `vite.config.ts` (`server.port`, `strictPort`), not in the `dev` script, so
`just dev 3005` can override it. `playwright.config.ts` still expects :3000.

The acceptance specs in `tests/e2e/clipboard.spec.ts` were written first and define done. They are
the outer loop; unit cycles are the inner loop. Two bugs got through the jsdom layer and were caught
only out here — see "What the outer loop caught" below.

**E2E specs must wait for hydration** before acting: `await expect(page.getByTestId('playground'))
.toHaveAttribute('data-detecting', 'true')`. Detection is installed in an effect, so a paste fired
against server-rendered markup lands natively and is silently missed — the suite would then pass or
fail on timing rather than on behaviour.

## Architectural seam that matters

Paste provenance (was this Ctrl+V, a right-click, or a drag-drop?) has **no browser API**. It is
inferred from a timing state machine in `src/lib/attribution.ts`, which is **pure** — it takes
`{kind, at}` records with an injected clock, never DOM events and never `Date.now()`. The DOM layer
(`src/lib/clipboard-detector.ts`) is a thin adapter that translates listeners into those records.

Keep it that way. Merging the two makes the hard logic testable only through jsdom's incomplete
`ClipboardEvent`/`DataTransfer`, which is how this kind of suite starts lying.

Corollary: anything non-deterministic belongs in the adapter, not the state machine. Record ids are
minted there (`idPrefix`) precisely so `attribution.ts` stays reproducible under test.

## What the outer loop caught

Two defects that every jsdom test happily agreed with:

1. **`clipboardData` is write-only during copy/cut.** Reading it back returns `""`, so every copy was
   logged as 0 chars. The length has to come from the selection — `selectionStart/End` for inputs and
   textareas, `getSelection()` otherwise. The jsdom specs had stubbed `getData` for copy too, so they
   confirmed the bug rather than finding it.
2. **Record ids must be globally unique.** They were a per-instance counter (`evt-1`, `evt-2`), and
   the server dedupes by id — so the first page load's `evt-1` permanently blocked every later one,
   silently discarding most events. Ids now carry a random per-detector prefix.

## Contract the acceptance specs assume

Playground `/` — `data-testid="playground"` carrying `data-detecting="true|false"`, fields `#email`
(Email), `#notes` (Notes), `#bio` (contenteditable), `#confirm-email` (protected, blocks paste,
protection **on** by default), `#referral` (Referral code — rendered by `ReferralField`, which has no
paste handler of its own and must stay that way; it is the proof the global listener works).
Switches: `toggle-block`, `toggle-preview`, `toggle-keep-toasts`; plus `toast-seconds` (number
input, 1–60, clamped in the store) and `clear-toasts`.

`detecting` must not be reset in the effect cleanup — StrictMode double-invokes effects, and doing
so makes the flag flicker true → false → true, which the acceptance specs sample and fail on.

Playwright runs 4 workers, not one per core: every worker loads pages from one Vite dev server, and
a stampede makes specs fail waiting on hydration that is merely slow.

Field labels come from the _visible_ label, not the id — `#confirm-email` reads as "Confirm email".
See the precedence in `describe-target.ts`.

`/` is a landing page with the playground embedded in it — hero, "How it works", privacy, the
playground, then the FAQ. The playground `<div>` and every id and testid inside it are unchanged and
must stay that way; new page content goes outside it.

Navigate between routes with `navigateTo(page, 'Events')` from `tests/e2e/helpers.ts`, not a bare
`getByRole('link', …)`. Playwright matches an accessible name as a **case-insensitive substring**, so
now that the landing copy and the footer also link to the events log, an unscoped locator matches
three elements and fails on strict mode. The helper scopes to `<nav aria-label="Main">`.

Toast copy — `Pasted {n} chars into {label}` / `Copied …from` / `Cut …from` / `Dropped …into`,
description `via keyboard | via right-click | via drag & drop`. Blocked paste: `Paste blocked`.

Events `/events` — tabs for the session store (`data-testid="events-table"`) and the server log
(`data-testid="server-events-table"`), rows `data-testid="event-row"`, newest first.

## Two preview limits, on purpose

`CLIENT_PREVIEW_LIMIT` (240) is what the record carries and the toast shows. `SERVER_PREVIEW_LIMIT`
(80) is the most that may ever cross the wire. Your screen and the network are not the same place;
one number for both made toasts read as cut off. `previewOf` cuts on a **word boundary** — a preview
stopping mid-word reads as corrupted rather than as a deliberate excerpt.

## `trusted`

Every record carries `Event.isTrusted`: true for a real user action, false for anything a script
dispatched. It is **recorded, never filtered on** — an automated paste is the interesting row, not
one to hide — and it travels to the server regardless of the preview setting, because it is metadata
about the event rather than clipboard contents. `sanitizeIncomingPayload` _requires_ it, so a
scripted client cannot pass itself off as genuine by omitting the field.

Out of scope, deliberately: typing-cadence / simulated-keystroke detection (ForcePaste-style tools).
Detection here covers copy, cut, paste and drop only.

## Privacy

`sendPreviewToServer` defaults to **off**. The server gets type, method, target label, char count,
trust and timestamp — never clipboard text — unless that switch is explicitly turned on. People
paste passwords into demos.

Enforced on both sides: `toServerPayload` omits the preview key client-side, and
`sanitizeIncomingPayload` rebuilds the payload field-by-field on the server, dropping anything
unrecognised and re-truncating any preview. The server does not trust the client to have redacted.

## SEO

Same seam as the detector. `src/lib/seo.ts` is **pure** — it builds meta tags, JSON-LD, robots.txt,
sitemap.xml and llms.txt from arguments, never from `process.env` or a clock, so all of it is unit
tested. `src/lib/site.ts` is the thin adapter holding the two build-time constants, and
`src/lib/site-content.ts` is the copy as plain data.

The canonical origin is injected by Vite `define` in `vite.config.ts`, not read at runtime, so the
server render and the client bundle cannot disagree and trip a hydration diff. Resolution order is
`SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `http://localhost:3000`. Note it is the _production_
URL var, not `VERCEL_URL`, which is unique per deployment and would canonicalise every preview to
itself.

**Only Vercel production is indexable** (`VERCEL_ENV === 'production'`, or `SITE_INDEXABLE=true` to
force it). Everything else serves `noindex, nofollow` and a robots.txt that disallows everything.
The e2e spec asserts the invariant rather than a value: the robots meta and robots.txt must agree.

`FAQ` in `site-content.ts` is the single source of truth for both the rendered FAQ section and the
`FAQPage` structured data. Structured data that disagrees with visible content is a manual action
waiting to happen, and there are tests at both layers holding them together.

robots.txt, sitemap.xml and llms.txt are **server routes** (`src/routes/robots[.]txt.ts` — brackets
because the router reads a dot as a path separator), not the plugin's build-time `sitemap` option.
The build-time one only writes during `vite build`, and Playwright runs against the dev server.

`just assets` regenerates `public/` — favicons, `og.png`, the manifest — by rendering through the
Chromium Playwright already installed. The output is committed; only re-run it when the mark or the
share-card copy changes.

## Theming

`lib/theme.ts` is pure (resolution, the cycle order, and the init script as a string);
`hooks/use-theme.ts` is the adapter that owns `localStorage` and `matchMedia`. Same seam as
everything else here.

The init script is inlined in `<head>` and must stay **blocking and first** — applying the theme in
an effect paints light and repaints dark, which is the flash. It therefore mutates `<html>` before
React hydrates, which is why that element carries `suppressHydrationWarning`. Do not remove it
without also removing the script.

The toggle deliberately renders `system` on the server and on the first client render so its markup
matches; the stored preference arrives in an effect. The _document_ is already themed by then, so
nothing flashes — only the toggle's own icon settles.

`theme-color` is a single meta tag, not a light/dark pair: the head dedupes meta by `name`, so a
second one differing only by `media` replaces the first instead of sitting beside it.

## Server functions

`src/lib/events-log.ts` — deliberately **not** `*.server.ts`; that suffix marks a module server-only
and it is imported by a client route. The builder method is `.validator()` (the runtime deprecates
`.inputValidator()`, despite what the type names suggest).

## Conventions

Import alias is `#/*` → `./src/*` (`@/*` also resolves). Package manager is pnpm.
