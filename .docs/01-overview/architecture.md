# Architecture

> **TL;DR** One seam, applied everywhere: hard logic is pure (injected clock, plain data, no DOM),
> adapters are thin and own the browser APIs. Paste provenance is a timing state machine in
> `attribution.ts`; `clipboard-detector.ts` only translates listeners into records. Privacy is
> enforced on both ends of the wire. Break the seam and the suite starts agreeing with its own bugs.

## The stack

| Layer           | Technology                                        | Notes                                                                 |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Framework       | TanStack Start (React 19) on Vite 8               | SSR + server functions, Nitro for deployment                          |
| Routing         | TanStack Router, file-based (`src/routes/`)       | `routeTree.gen.ts` is generated — never hand-edit                     |
| State           | TanStack Store (`event-store.ts`), TanStack Query | Query wires the server-log fetches on `/events`                       |
| UI              | shadcn/ui over Radix, Tailwind 4, sonner toasts   | Components added via `just ui <name>`                                 |
| Tests           | Vitest 4 (unit + jsdom projects), Playwright      | Chromium only for E2E — see [workflow](../03-development/workflow.md) |
| Package manager | pnpm                                              | Import alias `#/*` → `./src/*` (`@/*` also resolves)                  |

## The seam: pure core, thin adapters

Every hard problem in this codebase lives in a pure module that takes plain data and injected
dependencies, with a thin adapter beside it that owns the browser:

| Pure module (unit-tested in node) | Adapter (owns the platform API)          | Problem                                 |
| --------------------------------- | ---------------------------------------- | --------------------------------------- |
| `src/lib/attribution.ts`          | `src/lib/clipboard-detector.ts`          | Paste provenance from event timing      |
| `src/lib/redact.ts`               | `toServerPayload` / server functions     | The privacy boundary                    |
| `src/lib/seo.ts`                  | `src/lib/site.ts` (build-time constants) | Meta tags, JSON-LD, robots/sitemap/llms |
| `src/lib/theme.ts`                | `src/hooks/use-theme.ts`                 | Theme resolution + no-flash init        |

The reason is testability. jsdom's `ClipboardEvent` and `DataTransfer` are incomplete; if the
provenance logic could only be exercised through them, the suite would confirm its own stubs. The
pure modules never see a DOM event and never call `Date.now()` — the clock is injected — so the
hard logic is tested exhaustively in node, and the adapters stay small enough to be checked by the
jsdom project and, decisively, by Playwright.

Corollary: anything non-deterministic belongs in the adapter. Record ids are minted in the detector
(with a random per-detector prefix, so ids are globally unique across page loads) precisely so
`attribution.ts` stays reproducible under test.

## How detection works

1. `src/lib/clipboard-detector.ts` installs **document-level listeners in the capture phase** for
   copy, cut, paste, drop and `beforeinput`. Capture phase is the point: it sees events for fields
   the app never wired up, including third-party widgets and components that call
   `stopPropagation()`. `ReferralField` exists to prove this — it has no paste handler of its own
   and a spec fails if anyone adds one.
2. Listeners are translated into plain `{kind, at}` records and fed to the state machine in
   `attribution.ts`, which pairs a `paste` with the keydown/contextmenu/drag activity around it to
   produce the method. The pairing is a one-shot token — "have I already logged this action?" is a
   question about _which_ event, not how long ago (elapsed-time matching double-logged pastes under
   load; see the root README's bug list).
3. `beforeinput` with `insertFromPaste` / `insertFromDrop` covers mobile paste-bar and menu paths
   where no `ClipboardEvent` arrives at all.
4. `src/hooks/use-clipboard-detection.ts` mounts the detector in an effect, fires toasts, and sets
   `data-detecting="true"` on the playground — the hydration signal the E2E specs wait on.

## The privacy boundary

`sendPreviewToServer` defaults to off. Enforcement is two-sided and deliberate:

- **Client:** `toServerPayload` omits the preview key entirely when the switch is off.
- **Server:** `sanitizeIncomingPayload` rebuilds every payload field by field, drops anything
  unrecognised, and re-truncates any preview that does arrive. The server does not trust the client
  to have redacted.

Two limits, not one: `CLIENT_PREVIEW_LIMIT` (240) is what your own screen shows;
`SERVER_PREVIEW_LIMIT` (80) is the most that may ever cross the wire. Truncation lands on a word
boundary. The `trusted` flag always travels — it is metadata about the event, not clipboard
content — and the server _requires_ it, so a scripted client cannot look genuine by omitting it.

## Server functions

`src/lib/events-log.ts` holds the TanStack Start server functions over the in-memory
`server-log.ts`. It is deliberately **not** named `*.server.ts` — that suffix marks a module
server-only and this one is imported by a client route. The builder method is `.validator()`; the
runtime deprecates `.inputValidator()` despite what the type names suggest.

## SEO and theming, same shape

- The canonical origin is injected by Vite `define` in `vite.config.ts` (`SITE_URL` →
  `VERCEL_PROJECT_PRODUCTION_URL` → localhost) so server render and client bundle cannot disagree.
  robots.txt, sitemap.xml and llms.txt are server routes, not build-time output, because Playwright
  runs against the dev server. See [deployment](../04-deployment/deployment.md).
- The theme is applied by a blocking script inlined in `<head>` before first paint; `<html>`
  carries `suppressHydrationWarning` because the script mutates it before React hydrates. Do not
  remove one without the other.

## Related docs

| Document                                                               | Why you might read it next                      |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| [project-overview.md](project-overview.md)                             | The event model and vocabulary                  |
| [../03-development/workflow.md](../03-development/workflow.md)         | How the two test loops police this architecture |
| [../05-reference/project-layout.md](../05-reference/project-layout.md) | Where every file mentioned here lives           |
