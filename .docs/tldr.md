# TL;DR — every document in 30 seconds

> **TL;DR** One paragraph per document. Read this page, then jump to whichever full document you
> actually need. Links go to the source of truth; nothing here is authoritative on its own.

## [01-overview/project-overview.md](01-overview/project-overview.md)

cp-detection catches copy, cut, paste and drag-drop on any input on the page with a single
document-level capture listener, toasts each event, and logs it to a session store and an in-memory
server log. Every record carries type, method (keyboard / right-click / drag & drop), source
(`user` or `script` via `Event.isTrusted`), target label, character count and a truncated preview.
Two routes: `/` (landing page with the playground embedded) and `/events` (TanStack Table log).
Simulated-keystroke tools are deliberately out of scope.

## [01-overview/architecture.md](01-overview/architecture.md)

One seam, applied everywhere: hard logic lives in pure modules with injected inputs
(`attribution.ts`, `redact.ts`, `seo.ts`, `theme.ts`), and thin adapters own the DOM, the clock,
`localStorage` and the network (`clipboard-detector.ts`, `use-theme.ts`, `site.ts`). Paste
provenance has no browser API — it is inferred by a timing state machine that never sees a DOM
event. The privacy boundary is enforced on both ends of the wire: the client omits the preview, the
server rebuilds the payload field by field. Keep the seam or the tests start lying.

## [02-setup/getting-started.md](02-setup/getting-started.md)

Windows: `pwsh ./setup.ps1` installs Git, Node LTS, pnpm, Claude Code, uv, just, project
dependencies and Playwright Chromium — no Administrator, no VPN, idempotent. Linux/Mac: install
Node, pnpm and just yourself, then `just install`. Then `just start` and open
`http://localhost:3000`. Four MCP servers are committed in `.mcp.json` and connect after a Claude
Code restart.

## [03-development/workflow.md](03-development/workflow.md)

Strict TDD: a failing test comes before any implementation file. Vitest is the inner loop (two
projects — `unit` in node, `dom` in jsdom); Playwright is the outer loop and the only layer with a
real `ClipboardEvent`, so `just test` passing is not "done". `just verify` (typecheck, lint,
vitest, playwright) is the gate before pushing. Route files regenerate `routeTree.gen.ts`
automatically in dev, or via `just routes`.

## [04-deployment/deployment.md](04-deployment/deployment.md)

Deploys to Vercel; the `nitro()` Vite plugin writes the Build Output tree, so there is nothing to
configure for a basic deploy. The canonical origin resolves `SITE_URL` →
`VERCEL_PROJECT_PRODUCTION_URL` → localhost at build time. Only Vercel production is indexable —
previews serve `noindex` and a disallow-everything robots.txt. There is no CI pipeline in this
repo: `just verify` locally is the gate before pushing.

## [05-reference/commands.md](05-reference/commands.md)

The full just recipe table: setup and install, run (`start` kills the port first, `dev` does not),
the test loops (`test`, `test-unit`, `test-dom`, `watch`, `e2e` and friends), quality
(`typecheck`, `lint`, `fmt`, `check`, `verify`), `ui` for shadcn components, `assets` for the
generated icons, and the `claudex`/`claudeo`/`claudeh` Claude Code launchers.

## [05-reference/project-layout.md](05-reference/project-layout.md)

Annotated tree. `src/lib/` holds the pure modules and their adapters side by side; `src/hooks/`
mounts them into React; `src/routes/` is TanStack Router file-based routing including the bracketed
server routes (`robots[.]txt.ts`); `tests/e2e/` are the acceptance specs that define done;
`scripts/generate-assets.mjs` renders the committed `public/` assets through Playwright's Chromium.

## [06-troubleshooting/common-issues.md](06-troubleshooting/common-issues.md)

The known failure modes: port 3000 already held (use `just start` or `just stop`), Playwright's
"Executable doesn't exist" (run `just install`), E2E specs failing on hydration (wait for
`data-detecting="true"`; the suite runs 2 workers on purpose), a stale dev server imitating a
hydration bug, `routeTree.gen.ts` showing phantom diffs (line endings), and `just e2e` waiting
forever after a port override (Playwright still expects :3000).

## [07-faq/faq.md](07-faq/faq.md)

Why pnpm (the lockfile), why Chromium only (clipboard permissions are not grantable elsewhere), why
`.mcp.json` is committed (no secrets in it), why there are two preview limits (240 on screen, 80 on
the wire), why the server log dies on restart (deliberate), why `trusted` is recorded but never
filtered on, and what detection cannot see (keystroke-replay paste tools).
