# Getting started

> **TL;DR** Windows: `pwsh ./setup.ps1` (no Administrator, no VPN, idempotent) installs the whole
> toolchain and the project dependencies, then `just start` serves `http://localhost:3000`.
> Linux/Mac: install Node LTS, pnpm and just yourself, then `just install` and `just start`.
> Restart Claude Code afterwards so the four committed MCP servers connect.

## Prerequisites

On Windows you need only PowerShell and winget — `setup.ps1` installs everything else. On Linux/Mac
the script does not run; install the toolchain with your package manager.

| Tool                | Why                                                         | Installed by (Windows)                  |
| ------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Git                 | Version control                                             | setup.ps1 (winget)                      |
| Node.js LTS         | Vite 8 / TanStack Start need a modern Node                  | setup.ps1 (winget)                      |
| pnpm                | The lockfile is pnpm's — npm would produce a different tree | setup.ps1 (npm -g)                      |
| Claude Code CLI     | The agent tooling this repo is set up for                   | setup.ps1 (npm -g)                      |
| uv                  | Only as the installer for `just` (team convention)          | setup.ps1 (astral.sh)                   |
| just                | Task runner — every command below is a recipe               | setup.ps1 (`uv tool install rust-just`) |
| Playwright Chromium | The only browser the E2E suite can use                      | setup.ps1 / `just install`              |

## Windows: the scripted path

```powershell
pwsh ./setup.ps1
just start           # http://localhost:3000
```

What the script does, in order:

1. Checks for winget (warns and continues without it — you then install Git/Node manually).
2. Installs Git and Node LTS via winget if missing.
3. Installs pnpm and Claude Code globally via npm if missing.
4. Installs uv, puts its tool bin on the user PATH, then installs just.
5. Runs `pnpm install` for the project.
6. Downloads **Playwright Chromium only** (~300 MB). Firefox and WebKit are skipped deliberately:
   clipboard read/write permissions cannot be granted there, so the other engines would be dead
   weight no spec can use.
7. Verifies `.mcp.json` lists the four expected MCP servers and prints a final [OK]/[MISSING]
   verification table.

It needs no Administrator (nothing installs a service), no VPN (everything comes from public
sources), and it is idempotent — re-running is safe and is the standard fix after a PATH hiccup
(close and reopen PowerShell first so freshly installed tools are found).

## Linux/Mac: the manual path

`setup.ps1` is Windows-only. Install Node LTS, pnpm and just with your package manager, then:

```bash
just install         # pnpm install + playwright install chromium
just start
```

## First run and verification

1. `just start` — kills anything on the dev port, then serves `http://localhost:3000`. Use
   `localhost`, not `127.0.0.1`: on Windows the dev server binds IPv6 and IPv4 refuses.
2. Paste something into the Email field on the playground — you should see a toast naming the
   field, the character count and "via keyboard".
3. `just test` — Vitest, both projects, should pass in seconds.
4. `just e2e` — the Playwright acceptance suite; first run is slower (route compilation).
5. `just verify` — the full gate. If this passes, your machine is set up correctly.

## MCP servers

`.mcp.json` is **committed** in this repo — unlike secret-bearing setups, none of these four
servers carries a token or a machine-specific path, so there is nothing to keep per-developer:

| Server          | Purpose                                             |
| --------------- | --------------------------------------------------- |
| playwright      | Drive a real browser when authoring/debugging specs |
| shadcn          | Component registry access for the UI kit            |
| context7        | Version-current library docs                        |
| chrome-devtools | Performance and accessibility audits                |

Restart Claude Code after setup and run `/mcp` to confirm they connect.

## Changing the port

The port lives in `vite.config.ts` (`server.port: 3000`, `strictPort`), not in the `dev` script, so
`just dev 3005` or `set PORT=3005` overrides it cleanly. Note that `playwright.config.ts` still
expects `:3000` — see [common-issues.md](../06-troubleshooting/common-issues.md) before overriding.

## Related docs

| Document                                                                         | Why you might read it next                |
| -------------------------------------------------------------------------------- | ----------------------------------------- |
| [../03-development/workflow.md](../03-development/workflow.md)                   | What to do once the app runs              |
| [../05-reference/commands.md](../05-reference/commands.md)                       | Every just recipe in one table            |
| [../06-troubleshooting/common-issues.md](../06-troubleshooting/common-issues.md) | If any step above did not go as described |
