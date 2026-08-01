# FAQ

> **TL;DR** The recurring "why is it like this?" questions, answered once. Most answers trace back
> to two decisions: the pure-core/adapter seam (testability) and the privacy-first defaults
> (people paste passwords into demos).

## Why pnpm and not npm?

The lockfile is pnpm's. `npm install` would produce a different dependency tree and a dirty diff.
`setup.ps1` installs pnpm for you; `just ci-install` uses `--frozen-lockfile` so a script can never
silently update the lockfile.

## Why does the E2E suite run Chromium only?

Clipboard read/write permissions cannot be granted in Firefox or WebKit, and granting them is the
entire point of the suite — it is the only layer with a real `ClipboardEvent`. Downloading the
other engines would be ~400 MB no spec can use, which is also why `setup.ps1` and `just install`
fetch Chromium alone. Detection itself works in all browsers; see the root README's Known limits
for the Safari preview caveat.

## Why is `.mcp.json` committed? Isn't that supposed to be git-ignored?

In secret-bearing setups it is (a committed stub, a git-ignored real file). Here none of the four
servers — playwright, shadcn, context7, chrome-devtools — carries a token or a machine-specific
path, so there is nothing to keep per-developer and the real file is committed. If you ever add a
secret-bearing server, switch to the stub pattern rather than committing the secret.

## Why are there two preview limits (240 and 80)?

Your screen and the network are not the same place. `CLIENT_PREVIEW_LIMIT` (240) is what the toast
and the local log show; `SERVER_PREVIEW_LIMIT` (80) is the most that may ever cross the wire. A
single shared limit made toasts read as cut off — that is what prompted the split. Truncation lands
on a word boundary so a preview reads as a deliberate excerpt, not corruption.

## Why does the server log disappear on restart?

It is held in process memory, capped and deduped, on purpose. A demo should not be a database
quietly accumulating other people's clipboards. If you need persistence, that is a deliberate
architectural change, not a bug fix.

## Why is `trusted` recorded but never filtered on?

A scripted paste is the row you most want to see — an anti-fraud system that hides untrusted events
defeats itself. So `Event.isTrusted` travels with every record (the server *requires* it, so a
scripted client cannot look genuine by omitting the field), and the log tells `user` and `script`
apart instead of dropping either. An acceptance spec pastes both ways and asserts exactly that.

## Why can't it detect ForcePaste-style tools?

Simulated-keystroke tools replay the clipboard as individual keystrokes, so no `paste` event and no
`insertFromPaste` ever fires — nothing in the clipboard APIs can see it. Catching that needs
keystroke-timing analysis, which is deliberately out of scope here.

## Why is the import alias `#/` instead of `@/`?

`#/*` is a Node subpath import declared in `package.json` and is the project convention; `@/*`
also resolves (see `vitest.config.ts` and `tsconfig.json`) because shadcn tooling expects it.
Write new code with `#/`.

## Why does `<html>` carry `suppressHydrationWarning`?

The theme is applied by a blocking script inlined in `<head>` before anything paints — applying it
in an effect renders light and repaints dark, which is the flash everyone notices. That script
mutates `<html>` before React hydrates, so the live DOM legitimately differs from the server markup
there. Do not remove the attribute without also removing the script.

## Can I change the dev port?

Per-invocation `just dev 3005`, per-machine `PORT=3005`. The port lives in `vite.config.ts`
(`strictPort`, so a held port fails loudly instead of drifting). Playwright still expects `:3000` —
see [common-issues.md](../06-troubleshooting/common-issues.md).

## Why is there a `referral` field that does nothing special?

`ReferralField` deliberately has no paste handler of its own. It is the proof that detection is a
document-level capture listener rather than per-field wiring — it catches pastes into fields the
app never wired up, including components that call `stopPropagation()`. A spec fails if anyone adds
a handler to it.

## Is there CI?

No. There is no workflow in this repo; `just verify` (typecheck, lint, vitest, playwright) run
locally is the gate before pushing, and Vercel builds whatever lands on the connected branch. See
[deployment.md](../04-deployment/deployment.md).

## Related docs

| Document                                                              | Why you might read it next               |
| --------------------------------------------------------------------- | ---------------------------------------- |
| [../01-overview/architecture.md](../01-overview/architecture.md)      | The seam behind half these answers       |
| [../04-deployment/deployment.md](../04-deployment/deployment.md)      | Indexability and environment variables   |
| [../06-troubleshooting/common-issues.md](../06-troubleshooting/common-issues.md) | When a question is really a symptom |
