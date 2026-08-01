# Common issues

> **TL;DR** Most failures here are environmental, and most have a one-line fix: `just start` when
> the port is held, `just install` when Chromium is missing, wait for `data-detecting="true"` when
> an E2E paste vanishes. The subtle ones — a stale dev server, a port override Playwright does not
> know about — are documented below because they imitate application bugs.

## Port 3000 is already in use

**Symptom:** `just dev` exits immediately with a port error. `strictPort` is set on purpose — the
alternative is Vite silently drifting to 3001 while Playwright waits on :3000 forever.

**Fix:** `just start` (kills the port first, then serves) or `just stop` alone to free it. If
something you cannot kill legitimately owns 3000, move for the session: `just dev 3005` — but see
the port-override entry below.

## Playwright: "Executable doesn't exist"

**Symptom:** every `just e2e` run fails with `Executable doesn't exist at ...chromium...` deep in
the runner output — or, with the guard, a clean
`ERROR: Playwright Chromium missing. Run: just install`.

**Fix:** `just install`. This downloads the Chromium build (~300 MB) into
`%LOCALAPPDATA%\ms-playwright` (`~/.cache/ms-playwright` on Linux/Mac). Only Chromium is needed;
do not install the other engines.

## An E2E paste is silently missed

**Symptom:** a spec pastes, then finds no toast and no event row. Passes or fails depending on
machine speed.

**Cause:** the paste fired before hydration. Detection is installed in an effect; against
server-rendered markup a paste lands natively with no listener attached.

**Fix:** start every spec with the readiness gate:
`await expect(page.getByTestId('playground')).toHaveAttribute('data-detecting', 'true')`.
The helpers in `tests/e2e/helpers.ts` already do this — use them.

## E2E specs are flaky in a full run but pass alone

**Symptom:** a spec (historically `layout.spec.ts`) passes 16/16 on its own but fails roughly one
full run in three, timing out on hydration or an axe scan.

**Cause:** worker stampede. Every worker loads pages from ONE Vite dev server, and axe scans are
CPU-heavy in-page. At four workers the suite intermittently starved the server.

**Fix:** none needed — `playwright.config.ts` runs 2 workers for exactly this reason. Do not raise
the count to speed the suite up; slower and deterministic is the point of a gate. If you see this
pattern again, suspect a new CPU-heavy spec, not the worker count.

## The app behaves like a hydration bug after switching branches

**Symptom:** stale UI, mismatched markup warnings, changes that do not appear.

**Cause:** a dev server from a previous revision is still serving an old module graph — this
presents identically to a real hydration bug and has cost real debugging time. An interrupted
Playwright `webServer` or a forgotten `just preview` does the same from a port you did not think
to check.

**Fix:** `just start` — its `stop` step clears the dev port AND any orphaned vite/playwright
process belonging to this project, then serves fresh.

## `just e2e` waits forever after overriding the port

**Symptom:** you moved the dev server (`PORT=3005` or `just dev 3005`) and the E2E suite hangs
waiting for a server.

**Cause:** `playwright.config.ts` hard-codes `baseURL` and `webServer.url` to
`http://localhost:3000`. The justfile port variable does not reach it.

**Fix:** either free :3000 and let Playwright start its own server, or update
`playwright.config.ts` locally while you work (do not commit the change).

## `localhost` works but `127.0.0.1` refuses to connect

**Symptom:** `curl http://127.0.0.1:3000/` is refused while the browser shows the app.

**Cause:** on Windows, the Node dev server binds IPv6 (`[::1]`) only. This is normal on a healthy
server.

**Fix:** always use `http://localhost:3000`.

## `routeTree.gen.ts` shows as modified with an empty diff

**Symptom:** the generated route tree (or other files) shows modified after a checkout, diff is
empty, branch switches are blocked.

**Cause:** CRLF churn on Windows checkouts, historically.

**Fix:** already handled — `.gitattributes` normalises the repo to LF (`* text=auto eol=lf`). If
you see it anyway, your clone predates that commit: `git add --renormalize .` once, commit, done.
Do not "fix" it by changing your global `core.autocrlf`.

## A fresh setup.ps1 run says a tool installed but is not found

**Symptom:** `[FAIL] ... installed but not on PATH` or the final verification lists a tool as
`[MISSING]` right after installing it.

**Cause:** the PowerShell session predates the PATH change and `Refresh-Path` could not pick it
up.

**Fix:** close and reopen PowerShell, re-run `pwsh ./setup.ps1`. The script is idempotent — the
second run skips everything already present and just verifies.

## Related docs

| Document                                                          | Why you might read it next                     |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| [../02-setup/getting-started.md](../02-setup/getting-started.md)  | The setup steps these issues stem from         |
| [../03-development/workflow.md](../03-development/workflow.md)    | The E2E conventions that prevent the flaky ones |
| [../07-faq/faq.md](../07-faq/faq.md)                              | The "why is it built this way" background      |
