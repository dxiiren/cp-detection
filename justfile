# cp-detection -- justfile
#
# Cross-platform: Windows uses PowerShell, Linux/Mac uses bash.
# [windows] / [unix] attributes only on the few recipes that genuinely differ.
#
# Unlike the KollectApps monorepo justfile, this is a SINGLE pnpm package at the
# repo root -- no `cd` per module -- so most recipes need no OS variant at all.
#
# No VPN, no Nexus, no JDK: everything here comes from the public npm registry.

set windows-shell := ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command"]

# Dev server port. Default 3000; override per-machine with the PORT env var
# (e.g. when something else already holds 3000): set PORT=3005.
# Drives `dev`, `stop`, and the URL printed by `open`.
# Playwright's webServer expects :3000 -- if you change this, update
# playwright.config.ts baseURL too, or `just e2e` will wait on the wrong port.
port := env_var_or_default("PORT", "3000")

# List available recipes
default:
    @just --list

# ─── Guards ───────────────────────────────────────────────

[private, windows]
_require-deps:
    @if (-not (Test-Path ".\node_modules")) { Write-Error "ERROR: dependencies not installed. Run:`n  just install"; exit 1 }

[private, unix]
_require-deps:
    @test -d node_modules || { echo "ERROR: dependencies not installed. Run: just install"; exit 1; }

# Playwright needs a downloaded Chromium; without it every E2E run fails with a
# confusing 'Executable doesn't exist' deep in the runner output.
[private, windows]
_require-browser:
    @if (-not (Get-ChildItem "$env:LOCALAPPDATA\ms-playwright" -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue)) { Write-Error "ERROR: Playwright Chromium missing. Run:`n  just install"; exit 1 }

[private, unix]
_require-browser:
    @ls -d ~/.cache/ms-playwright/chromium-* >/dev/null 2>&1 || { echo "ERROR: Playwright Chromium missing. Run: just install"; exit 1; }

# ─── Setup ────────────────────────────────────────────────

# Idempotent, and does NOT need Administrator (nothing here installs a service).
# Bootstrap a fresh PC: Node, pnpm, just, Claude Code, then project deps
[windows]
setup:
    pwsh ./setup.ps1

[unix]
setup:
    @echo "setup.ps1 is Windows-only. On Linux/Mac install: node (LTS), pnpm, just, then run: just install"

# `just setup` calls this for you; run it directly after a pull that changed
# pnpm-lock.yaml.
# Install dependencies + the Chromium build Playwright drives
install:
    pnpm install
    pnpm exec playwright install chromium

# Reproducible install -- fails instead of silently updating the lockfile
ci-install:
    pnpm install --frozen-lockfile
    pnpm exec playwright install chromium

# ─── Run ──────────────────────────────────────────────────

# Stops anything already holding the port first, so you never end up talking to a
# server from a previous revision. This is the one to reach for by default --
# `dev` is the plain version for when you know the port is free.
# Start fresh: kill the port, then run the dev server
start p=port: (stop p) (dev p)

# Override the port with `just dev 3005` or PORT=3005.
# Start the dev server on http://localhost:3000
dev p=port: _require-deps
    pnpm dev --port {{p}}

# Production build
build: _require-deps
    pnpm build

# Everything under `just dev` goes through Vite's dev pipeline instead, so this
# is the only way to see what actually ships.
# Serve the production build
preview: _require-deps
    pnpm preview

# The dev server does this automatically; run it manually when only typechecking.
# Regenerate routeTree.gen.ts after adding or renaming a file in src/routes
routes:
    pnpm generate-routes

# Output is committed, so a normal build never runs this -- only re-run it when
# the mark, the palette or the share-card copy changes. Renders through the same
# Chromium the acceptance suite uses, so there is no image library to install.
# Regenerate the favicons, og.png and site.webmanifest into public/
assets: _require-deps _require-browser
    node scripts/generate-assets.mjs

# Idempotent and thorough: clears the port AND any orphaned vite/playwright
# process still holding this project, then exits 0 whether or not it found
# anything. Killing the port alone is not enough — a preview server, or a
# Playwright webServer whose run was interrupted, keeps serving a stale build
# from a port you did not think to check, and that looks exactly like an
# application bug rather than a leftover process.
# Kill the dev port and any stray servers for this project
# One invocation ending in `exit 0`: just runs each recipe line as its own
# shell, and a cmdlet that simply matches nothing still leaves a failing exit
# code behind — which made `stop` fail on an already-clean machine, the exact
# case idempotency is for.
[windows]
stop p=port:
    @try { Get-NetTCPConnection -LocalPort {{p}} -State Listen -ErrorAction Stop | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "Stopped PID $($_.OwningProcess) on port {{p}}" } } catch {}; $root = (Get-Location).Path; try { Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and ($_.CommandLine -match 'vite|playwright') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "Stopped stray server PID $($_.ProcessId)" } } catch {}; Write-Host "Stopped."; exit 0

[unix]
stop p=port:
    @pid=$(lsof -ti :{{p}} 2>/dev/null || true); if [ -n "$pid" ]; then kill -9 $pid 2>/dev/null || true; echo "Stopped port {{p}} (PID $pid)"; fi; pkill -f "$(pwd).*(vite|playwright)" 2>/dev/null || true; echo "Stopped."; exit 0

# ─── Tests ────────────────────────────────────────────────
# Two loops. Vitest is the inner loop (fast, pure logic + jsdom adapter);
# Playwright is the OUTER loop and is the only layer that exercises real
# ClipboardEvent/DataTransfer. Both bugs that shipped past jsdom were caught
# out there -- see "What the outer loop caught" in CLAUDE.md. Don't treat
# `just test` passing as done.

# Vitest -- both projects (unit + dom)
test: _require-deps
    pnpm test

# Vitest -- pure logic only (node env, no DOM): attribution, redaction, stores
test-unit: _require-deps
    pnpm exec vitest run --project unit

# Vitest -- jsdom only: the DOM adapter and React bindings
test-dom: _require-deps
    pnpm exec vitest run --project dom

# Vitest in watch mode -- the inner TDD loop
watch: _require-deps
    pnpm test:watch

# Chromium only -- clipboard permissions are not grantable in Firefox or
# WebKit, which is the whole point of this suite. Starts its own dev server;
# run `just stop` first if one is already up on a different revision.
# Playwright acceptance specs -- the outer loop, and the real definition of done
e2e: _require-deps _require-browser
    pnpm test:e2e

# One spec file or filter: `just e2e-file clipboard`
e2e-file filter: _require-deps _require-browser
    pnpm exec playwright test {{filter}}

# Watch it happen in a real browser window, one worker so the ordering is readable
e2e-headed: _require-deps _require-browser
    pnpm exec playwright test --headed --workers=1

# Playwright's interactive UI mode -- best way to debug a failing selector
e2e-ui: _require-deps _require-browser
    pnpm exec playwright test --ui

# Open the HTML report from the last E2E run (traces, screenshots)
e2e-report:
    pnpm exec playwright show-report

# EVERYTHING -- vitest then playwright
test-all: _require-deps _require-browser
    pnpm test:all

# ─── Quality ──────────────────────────────────────────────

# TypeScript, no emit
typecheck: _require-deps
    pnpm exec tsc --noEmit

# ESLint (TanStack config)
lint: _require-deps
    pnpm lint

# Prettier write + eslint --fix
fmt: _require-deps
    pnpm format

# Prettier check only -- does not write
check: _require-deps
    pnpm check

# Ordered so the cheapest check fails first.
# The full gate -- typecheck, lint, vitest, playwright. Run before pushing
verify: typecheck lint test e2e

# ─── UI ───────────────────────────────────────────────────

# Style and aliases come from components.json (the alias is #/, not @/).
# Add shadcn components: `just ui dialog tooltip`
ui *COMPONENTS:
    pnpm dlx shadcn@latest add {{COMPONENTS}}

# ─── Tools ────────────────────────────────────────────────

# Launch Claude Code with all permissions -- Sonnet
claudex:
    claude --dangerously-skip-permissions --model sonnet

# Launch Claude Code with all permissions -- Opus
claudeo:
    claude --dangerously-skip-permissions --model opus

# Launch Claude Code with all permissions -- Haiku
claudeh:
    claude --dangerously-skip-permissions --model haiku
