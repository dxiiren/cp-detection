# Project overview

> **TL;DR** cp-detection detects copy, cut, paste and drag-drop on any input on the page — including
> fields the app never wired up — via a single document-level capture listener. Each event is
> toasted and logged with its type, method, source (`user`/`script`), target, character count and a
> truncated preview. Two routes: `/` (landing page + playground) and `/events` (the log). Keystroke
> replay tools are out of scope by design.

## What it is

A demonstration app for clipboard-activity detection, the kind an exam platform or anti-fraud
system needs: not just "a paste happened" but _how_ it was triggered (Ctrl+V, right-click menu, or
drag-drop) and _who_ triggered it (a real user or a script). It is built with TanStack Start
(React 19), shadcn/ui and Tailwind 4, runs on a single Vite dev server, and deploys to Vercel.

The root [README.md](../../README.md) covers the product behaviour in depth — the playground
fields, the privacy stance, theming and known limits. This document gives you the vocabulary; the
[architecture](architecture.md) document explains how it is built.

## The event model

Every detected event becomes one record. The fields are the vocabulary used across the code, the
tests and the UI:

| Field    | Values                                   | Where it comes from                                                                               |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `type`   | `copy`, `cut`, `paste`, `drop`           | The DOM event (or `beforeinput` input type)                                                       |
| `method` | `keyboard`, `right-click`, `drag & drop` | Inferred by the timing state machine in `src/lib/attribution.ts` — no browser API exists for this |
| `source` | `user`, `script`                         | The browser's `Event.isTrusted` — recorded, never filtered                                        |
| target   | A readable label, e.g. "Confirm email"   | `src/lib/describe-target.ts` — visible label wins over id                                         |
| chars    | Character count                          | Selection length for copy/cut (clipboardData is write-only there), payload length otherwise       |
| preview  | Truncated excerpt, word-boundary cut     | 240 chars on screen, at most 80 ever sent to the server                                           |

## Where events go

1. **Toasts** — one per event, wording defined in `src/lib/toast-copy.ts` and asserted by specs.
2. **Session store** — `src/lib/event-store.ts`, a TanStack Store, shown on `/events`.
3. **Server log** — `src/lib/server-log.ts`, in-memory, capped and deduped by record id, reached
   through the TanStack Start server functions in `src/lib/events-log.ts`. Lost on restart, on
   purpose: a demo should not accumulate other people's clipboards.

## The two routes

| Route     | What it is                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`       | Landing page with the playground embedded: hero, "How it works", privacy, the fields, FAQ. The playground ids and testids are contract — see `CLAUDE.md`. |
| `/events` | Every detected event in a TanStack Table, newest first, with tabs for the session store and the server log.                                               |

Three additional server routes — `robots[.]txt.ts`, `sitemap[.]xml.ts`, `llms[.]txt.ts` — serve SEO
text built by the pure functions in `src/lib/seo.ts`.

## Scope and non-goals

- **In scope:** copy, cut, paste, drop; provenance inference; trusted/untrusted attribution;
  privacy-preserving server logging.
- **Out of scope, deliberately:** simulated-keystroke tools (ForcePaste and similar) that replay
  the clipboard as individual keystrokes. No `paste` event and no `insertFromPaste` ever fires for
  those; catching them needs keystroke-timing analysis, which this project does not attempt.
- **Not automatable:** a real OS right-click → Paste and a mobile paste-bar paste need a human to
  confirm the attribution outside the test harness.

## Related docs

| Document                                                         | Why you might read it next                          |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| [architecture.md](architecture.md)                               | How the detection and privacy layers are structured |
| [../02-setup/getting-started.md](../02-setup/getting-started.md) | Get the app running on your machine                 |
| [../07-faq/faq.md](../07-faq/faq.md)                             | The "why is it like this?" questions                |
