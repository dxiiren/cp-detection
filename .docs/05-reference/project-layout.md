# Project layout

> **TL;DR** A single pnpm package at the repo root. Pure modules and their adapters sit side by
> side in `src/lib/`; `src/hooks/` mounts them into React; `src/routes/` is file-based routing
> including the bracketed SEO server routes; `tests/e2e/` holds the acceptance specs that define
> done. `routeTree.gen.ts` and `public/` are generated — regenerate, never hand-edit.

## Top level

```
cp-detection/
  setup.ps1              bootstrap a fresh Windows PC (no admin, no VPN, idempotent)
  justfile               every command -- cross-platform, [windows]/[unix] variants where needed
  CLAUDE.md              working agreement + the contract the acceptance specs assume
  README.md              product behaviour, privacy stance, known limits
  .docs/                 this documentation set
  .claude/               Claude Code project config (hooks, memory)
  .mcp.json              four MCP servers, committed (none carries a secret)
  vite.config.ts         port (3000, strictPort), canonical-origin define, nitro plugin
  vitest.config.ts       two projects: unit (node) and dom (jsdom)
  playwright.config.ts   Chromium only, 2 workers, webServer on :3000
  playwright.prod.config.ts   same suite against the built server entry (`just e2e-prod`)
  tsconfig.json          strict TS; # and @ aliases to src/
  components.json        shadcn config -- alias #/, styling defaults
  eslint.config.js       TanStack ESLint config
  prettier.config.js     formatting; .prettierignore excludes generated files
  .gitattributes         LF everywhere, CRLF for *.ps1, binaries marked
  scripts/generate-assets.mjs   renders public/ assets through Playwright's Chromium
  public/                generated favicons, og.png, site.webmanifest -- committed
```

## src/lib — the core

Pure modules (unit-tested in node, no DOM, injected clock) and their adapters live side by side:

```
src/lib/
  attribution.ts         PURE  timing state machine -- paste provenance
  clipboard-detector.ts  ADAPTER  document-level capture listeners -> {kind, at} records
  describe-target.ts     field -> readable label (visible label wins over id)
  redact.ts              PURE  the privacy boundary, both directions (240/80 limits)
  export.ts              PURE  the log as CSV / JSON -- re-redacts previews on the way out
  event-store.ts         TanStack Store: events + settings (toast seconds clamped 1-60)
  server-log.ts          in-memory server log -- capped, deduped by record id
  events-log.ts          TanStack Start server functions (NOT *.server.ts -- client-imported)
  toast-copy.ts          PURE  exact toast wording the specs assert
  seo.ts                 PURE  meta tags, JSON-LD, robots/sitemap/llms text
  site.ts                ADAPTER  over the build-time origin constants (Vite define)
  site-content.ts        the copy as data -- titles, FAQ (single source for render + JSON-LD)
  theme.ts               PURE  theme resolution + the no-flash init script as a string
  ico.ts                 build-time only: ICO container for the favicon
  types.ts, utils.ts     shared types, cn() helper
```

Tests sit next to their subjects: `*.test.ts` (node project) and `*.dom.test.ts(x)` (jsdom
project).

## src — the rest

```
src/
  hooks/
    use-clipboard-detection.ts   mounts the detector, fires toasts, sets data-detecting
    use-theme.ts                 adapter: localStorage + matchMedia
  components/
    referral-field.tsx           deliberately has NO paste handler -- proof the global listener works
    export-buttons.tsx           ADAPTER over lib/export.ts: blob + anchor download mechanics
    theme-toggle.tsx             light -> dark -> system cycle
    not-found.tsx                the 404 page
    ui/                          shadcn components (added via `just ui`)
  integrations/tanstack-query/   Query provider + devtools wiring
  routes/
    __root.tsx                   document shell: head, theme init script, nav, toaster
    index.tsx                    landing page + playground (ids/testids are contract)
    events.tsx                   log table -- session + server tabs
    robots[.]txt.ts              server routes over the pure builders in seo.ts;
    sitemap[.]xml.ts             brackets because the router reads a dot as a path separator
    llms[.]txt.ts
  router.tsx                     router factory
  routeTree.gen.ts               GENERATED -- `just routes`, never edit
  styles.css                     Tailwind 4 entry + the full light/dark token sets
```

## tests/e2e — the outer loop

```
tests/e2e/
  clipboard.spec.ts      the core acceptance specs -- written first, define done
  a11y.spec.ts           axe scans
  layout.spec.ts         landing page structure
  seo.spec.ts            robots meta / robots.txt agreement, canonical, JSON-LD
  not-found.spec.ts      the 404 page
  harness.spec.ts        the test harness's own assumptions
  helpers.ts             navigateTo() (scoped to nav), readiness gate
  global-setup.ts        compiles every route once before workers start
```

## Generated vs authored

| Path                  | Status    | Regenerate with           |
| --------------------- | --------- | ------------------------- |
| `src/routeTree.gen.ts` | Generated | `just routes` (or dev server) |
| `public/`             | Generated, committed | `just assets`  |
| `pnpm-lock.yaml`      | Generated | `pnpm install` (never hand-edit; `just ci-install` refuses to change it) |
| Everything else       | Authored  | —                         |

## Related docs

| Document                                                            | Why you might read it next               |
| ------------------------------------------------------------------- | ---------------------------------------- |
| [../01-overview/architecture.md](../01-overview/architecture.md)    | Why the lib modules are split as they are |
| [commands.md](commands.md)                                          | The recipes that operate on this tree    |
| [../03-development/workflow.md](../03-development/workflow.md)      | The naming conventions tests follow      |
