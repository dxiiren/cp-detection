# cp-detection documentation

> **New here?** Start with [tldr.md](tldr.md) — every document below, summarised in 30 seconds each.

This folder complements the root [README.md](../README.md). The root README tells you what the app
does and how to start it; these documents tell you how it is built, how to work on it, and what to
do when something breaks. `CLAUDE.md` at the repo root holds the working agreement and the contract
the acceptance specs depend on — read it before changing the detector.

## Who is this for?

| Reader                                             | Start here                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| New developer setting up a machine                 | [02-setup/getting-started.md](02-setup/getting-started.md)                 |
| Anyone about to change detection or privacy code   | [01-overview/architecture.md](01-overview/architecture.md)                 |
| Day-to-day contributor (TDD loop, commands, gates) | [03-development/workflow.md](03-development/workflow.md)                   |
| Whoever deploys or configures the Vercel project   | [04-deployment/deployment.md](04-deployment/deployment.md)                 |
| Someone with a failing command or a flaky test     | [06-troubleshooting/common-issues.md](06-troubleshooting/common-issues.md) |

## Recommended reading order

1. [01-overview/project-overview.md](01-overview/project-overview.md) — what the app is and the vocabulary it uses
2. [01-overview/architecture.md](01-overview/architecture.md) — the pure-core / adapter seam everything follows
3. [02-setup/getting-started.md](02-setup/getting-started.md) — from fresh PC to running dev server
4. [03-development/workflow.md](03-development/workflow.md) — the two test loops and the verify gate
5. [05-reference/commands.md](05-reference/commands.md) — every just recipe
6. [05-reference/project-layout.md](05-reference/project-layout.md) — where each file lives and why
7. [04-deployment/deployment.md](04-deployment/deployment.md) — Vercel, canonical origin, indexability
8. [06-troubleshooting/common-issues.md](06-troubleshooting/common-issues.md) — known failure modes
9. [07-faq/faq.md](07-faq/faq.md) — the questions that keep coming up

## 01-overview

| Document                                               | What it covers                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [project-overview.md](01-overview/project-overview.md) | What cp-detection is, the event model (type, method, source, trusted), scope and non-goals                        |
| [architecture.md](01-overview/architecture.md)         | The pure/adapter seam, paste-provenance state machine, privacy boundary, server functions, theming and SEO layers |

## 02-setup

| Document                                          | What it covers                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [getting-started.md](02-setup/getting-started.md) | Prerequisites, what setup.ps1 installs step by step, non-Windows setup, first run, MCP servers |

## 03-development

| Document                                  | What it covers                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [workflow.md](03-development/workflow.md) | The TDD working agreement, inner (Vitest) and outer (Playwright) loops, the verify gate, route generation, adding shadcn components, conventions |

## 04-deployment

| Document                                     | What it covers                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [deployment.md](04-deployment/deployment.md) | Vercel via the Nitro plugin, environment variables, preview vs production indexability, what is deliberately not automated |

## 05-reference

| Document                                            | What it covers                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| [commands.md](05-reference/commands.md)             | Every just recipe, its guards, and the pnpm script underneath             |
| [project-layout.md](05-reference/project-layout.md) | Annotated file tree: src/lib, hooks, routes, tests, scripts, config files |

## 06-troubleshooting

| Document                                                | What it covers                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [common-issues.md](06-troubleshooting/common-issues.md) | Port conflicts, missing Chromium, E2E flakiness and hydration waits, stale dev servers, line-ending churn |

## 07-faq

| Document                | What it covers                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [faq.md](07-faq/faq.md) | Why pnpm, why Chromium only, why .mcp.json is committed, why two preview limits, what detection deliberately cannot see |
