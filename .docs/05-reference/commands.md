# Commands

> **TL;DR** Everything goes through `just` (`just --list` shows the live list). Recipes wrap the
> pnpm scripts and add guards: `_require-deps` fails fast when `node_modules` is missing,
> `_require-browser` when Playwright's Chromium is. The dev port defaults to 3000 and can be
> overridden per-invocation (`just dev 3005`) or per-machine (`PORT` env var).

## Setup

| Recipe            | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `just setup`      | Runs `pwsh ./setup.ps1` (Windows; prints manual instructions on Linux/Mac)    |
| `just install`    | `pnpm install` + Playwright Chromium download                                 |
| `just ci-install` | `pnpm install --frozen-lockfile` — fails instead of silently updating the lockfile |

## Run

| Recipe         | What it does                                                                       |
| -------------- | ---------------------------------------------------------------------------------- |
| `just start`   | **The default way in**: kill the port, then run the dev server                     |
| `just dev`     | Plain dev server on `http://localhost:3000` — when you know the port is free       |
| `just stop`    | Kill whatever holds the dev port plus any stray vite/playwright process of this project; idempotent, exits 0 either way |
| `just build`   | Production build                                                                   |
| `just preview` | Serve the production build — the only way to see what actually ships               |
| `just routes`  | Regenerate `routeTree.gen.ts` (dev server does this automatically)                 |
| `just assets`  | Regenerate favicons, `og.png` and manifest into `public/` (output is committed)    |

Port override: `just dev 3005`, `just stop 3005`, or `set PORT=3005` for the session. Playwright
still expects `:3000` — see the note in the justfile header.

## Tests

| Recipe                | What it does                                                          |
| --------------------- | --------------------------------------------------------------------- |
| `just test`           | Vitest, both projects (unit + dom)                                    |
| `just test-unit`      | Pure logic only (node, no DOM): attribution, redaction, stores        |
| `just test-dom`       | jsdom only: the DOM adapter and React bindings                        |
| `just watch`          | Vitest watch mode — the inner TDD loop                                |
| `just e2e`            | Playwright acceptance specs — the outer loop, the definition of done  |
| `just e2e-file <f>`   | One spec file or filter, e.g. `just e2e-file clipboard`               |
| `just e2e-headed`     | Watch the specs in a real browser window, one worker                  |
| `just e2e-ui`         | Playwright interactive UI mode — best for debugging a failing selector |
| `just e2e-report`     | Open the HTML report from the last E2E run (traces, screenshots)      |
| `just test-all`       | Vitest then Playwright                                                |

## Quality

| Recipe           | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `just typecheck` | `tsc --noEmit`                                            |
| `just lint`      | ESLint (TanStack config)                                  |
| `just fmt`       | Prettier write + `eslint --fix`                           |
| `just check`     | Prettier check only — does not write                      |
| `just verify`    | **The full gate**: typecheck → lint → vitest → playwright |

## UI

| Recipe                 | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `just ui <components>` | Add shadcn components, e.g. `just ui dialog tooltip`. Style and aliases come from `components.json` (the alias is `#/`, not `@/`) |

## Tools

| Recipe        | What it does                                            |
| ------------- | ------------------------------------------------------- |
| `just claudex` | Launch Claude Code with all permissions — Sonnet        |
| `just claudeo` | Launch Claude Code with all permissions — Opus          |
| `just claudeh` | Launch Claude Code with all permissions — Haiku         |

## Guards

Two private recipes protect everything above from confusing failures:

| Guard              | Fails when                        | Fix            |
| ------------------ | --------------------------------- | -------------- |
| `_require-deps`    | `node_modules` is missing         | `just install` |
| `_require-browser` | Playwright Chromium is missing    | `just install` |

Without the browser guard, every E2E run would die with a cryptic "Executable doesn't exist" deep
in the runner output.

## Related docs

| Document                                                          | Why you might read it next                  |
| ------------------------------------------------------------------ | ------------------------------------------- |
| [project-layout.md](project-layout.md)                            | What the recipes operate on                 |
| [../03-development/workflow.md](../03-development/workflow.md)    | When to run which loop                      |
| [../02-setup/getting-started.md](../02-setup/getting-started.md)  | If a guard keeps failing on a fresh machine |
