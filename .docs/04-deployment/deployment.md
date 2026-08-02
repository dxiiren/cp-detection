# Deployment

> **TL;DR** Vercel. The `nitro()` Vite plugin writes the Build Output tree, so a basic deploy needs
> zero configuration. Only production is indexable — previews serve `noindex` and a
> disallow-everything robots.txt. Set `SITE_URL` once there is a custom domain. There is no CI
> pipeline in this repo; `just verify` locally is the gate before pushing.

## How it deploys

The repo lives at `github.com/dxiiren/cp-detection` and deploys to Vercel. The `nitro()` plugin in
`vite.config.ts` is what makes the build deployable: without it, `vite build` emits only
`dist/client` + `dist/server` and Vercel has no server to route to, so every path 404s. Nitro
detects the host from the environment and writes the Build Output API tree (`.vercel/output`) — no
preset and no `vercel.json` needed.

There is no CI/CD workflow in this repository — no GitHub Actions, no automated test run on push.
Verification is local and manual: run `just verify` before pushing. Vercel builds whatever lands on
the connected branch.

## The canonical origin

The origin is resolved **at build time** and injected via Vite `define`, never read at runtime, so
the server render and the client bundle cannot disagree and trip a hydration diff:

| Priority | Source                                     | When it applies                           |
| -------- | ------------------------------------------ | ----------------------------------------- |
| 1        | `SITE_URL`                                 | Set it once there is a custom domain      |
| 2        | `https://VERCEL_PROJECT_PRODUCTION_URL`    | Vercel's *stable* production domain       |
| 3        | `http://localhost:3000`                    | Local builds                              |

Note it is the *production* URL variable, not `VERCEL_URL` — that one is unique per deployment and
would canonicalise every preview to itself.

## Indexability

Only Vercel production is indexable (`VERCEL_ENV === 'production'`). Everything else — previews and
local dev — serves `noindex, nofollow` and a robots.txt that disallows everything, because a
preview in the search index is duplicate content pointing at a URL that will not exist next week.
The e2e SEO spec asserts the invariant rather than a value: the robots meta and robots.txt must
agree.

To see the production-shaped head locally:

```bash
SITE_URL=https://example.com SITE_INDEXABLE=true just build
just preview
```

## Environment variables

| Variable         | Where          | Purpose                                                       |
| ---------------- | -------------- | ------------------------------------------------------------- |
| `SITE_URL`       | Vercel project | Canonical origin once a custom domain exists                  |
| `SITE_INDEXABLE` | Local only     | `true` forces the indexable path for inspecting the prod head |

Nothing else. There is no database, no secret and no API key — the server log is process memory.

## What is deliberately not automated

- **`just e2e-prod` is not part of `just verify`.** It runs the full acceptance suite against the
  built output (`node .output/server/index.mjs`, the server that actually ships) — run it before a
  release or after touching anything that only exists at build time. It replaced the old known
  limit where the SEO specs were re-run against `just preview` by hand.
- **Two attribution paths need a human**: a real OS right-click → Paste, and a mobile paste-bar
  paste, to confirm `right-click` attribution holds outside the harness. Do this once per
  significant detector change, on the deployed URL.

## Related docs

| Document                                                              | Why you might read it next                     |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| [../01-overview/architecture.md](../01-overview/architecture.md)      | Why SEO text is served by routes, not the build |
| [../03-development/workflow.md](../03-development/workflow.md)        | The verify gate that stands in for CI          |
| [../07-faq/faq.md](../07-faq/faq.md)                                  | Why the server log does not survive a restart  |
