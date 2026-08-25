# Reader — Documentation Index

This folder is the canonical source of truth for Reader's product, architecture,
operations, and durable knowledge. Markdown here is authoritative.

For a fast agent briefing, read [AGENTS.md](../AGENTS.md) first, then this index.

## Where to start

- **New to the codebase?** → [product/overview.md](product/overview.md) → [product/features.md](product/features.md) → [architecture/how-it-works.md](architecture/how-it-works.md) → [architecture/overview.md](architecture/overview.md) → [development/setup.md](development/setup.md)
- **On-call / deploying?** → [operations/deploy.md](operations/deploy.md) → [operations/runbooks/](operations/runbooks/)
- **Why is X the way it is?** → [architecture/decisions/](architecture/decisions/) → [knowledge/learnings.md](knowledge/learnings.md)
- **What broke before?** → [knowledge/failed-approaches.md](knowledge/failed-approaches.md) → [archive/](archive/)
- **Current state of the project?** → [STATUS.md](../STATUS.md)
- **Writing code here?** → [development/conventions.md](development/conventions.md) → [development/commands.md](development/commands.md) → [development/testing.md](development/testing.md) → [development/openspec.md](development/openspec.md)
- **Marketing the product?** → [marketing/hooks.md](marketing/hooks.md) → [marketing/iterations/v2/draft-seo-landing-keywords.md](marketing/iterations/v2/draft-seo-landing-keywords.md)

## Layout

```
docs/
  index.md                      # this file
  product/
    overview.md                 # purpose, users, scope
    features.md                 # shipped feature inventory
    surfaces.md                 # production URLs + agent-indexing surfaces
  architecture/
    how-it-works.md             # end-to-end walkthrough (start here)
    overview.md                 # Vite SPA + Hono Worker shape
    data-flow.md                # request flow, auth, storage, AI
    decisions/                  # current ADRs (one file per decision)
      0001-vite-spa-hono-worker.md
      0002-turso-drizzle.md
      0003-r2-pdfs.md
      0004-better-auth-google.md
      0005-ai-gateway-byok.md
      0006-mv3-side-panel.md
      0007-content-extraction.md
      0008-rss-inbox.md
  development/
    setup.md                    # local dev environment
    commands.md                 # pnpm scripts and what they do
    conventions.md              # code style, formatting, pre-commit hooks
    testing.md                  # vitest + playwright
    openspec.md                 # GitHub-Issue spec workflow
  operations/
    deploy.md                   # Cloudflare Workers deploy + secrets
    env.md                      # environment variables and validation
    ci-cd.md                    # GitHub Actions workflows
    jobs.md                     # scheduled jobs (weekly quality check)
    runbooks/
      migrate-schema.md         # applying Drizzle schema changes
      rotate-secrets.md         # rotating Cloudflare and Google secrets
      rollback.md               # rollback procedure for a bad deploy
  knowledge/
    learnings.md                # current, applicable engineering lessons
    external-references.md      # curated external docs (one entry per concept)
    failed-approaches.md        # approaches tried and abandoned, with reasons
  archive/                      # historical records, preserved verbatim
  marketing/                    # landing/SEO copy iterations (current)
```

## Maintenance rules

1. **Markdown is the source of truth.** Code and executable config remain
   authoritative for implementation details; docs explain *why*, not *what the
   code currently does line-by-line*.
2. **One home per fact.** Don't duplicate a fact across files — link to its
   canonical home. If a fact moves, update links rather than copying.
3. **Prefer `archive/` over deletion.** When a doc is superseded, move it to
   `docs/archive/` with a dated filename and a one-line historical marker at
   the top. Preserve git rename history with `git mv`.
4. **Mark unresolved questions explicitly** with `TBD:` or an "Open questions"
   section. Do not invent answers.
5. **Keep pages focused.** Target 150–300 lines per file. Split when a page
   grows beyond that.
6. **Validate before commit.** Run `node scripts/check-docs.mjs` (or
   `pnpm docs:check`) — it catches broken links, missing required sections,
   and files outside the canonical structure.

## What lives outside this folder

- [`AGENTS.md`](../AGENTS.md) — concise agent bootloader (purpose, commands,
  constraints, navigation). Links here for depth.
- [`STATUS.md`](../STATUS.md) — short current-state view (objective, active
  work, blockers, next steps).
- [`README.md`](../README.md) — product readme for humans landing in the repo.
- [GitHub Issues](https://github.com/Significant-Hobbies/reader/issues) —
  operational work and non-trivial feature specs. See
  [development/openspec.md](development/openspec.md).
- [`public/`](../public/) — runtime agent-indexing surfaces (`llms.txt`,
  `index.md`, `api-ai.json`, `robots.txt`, `sitemap.xml`) served by the Worker.
  Documented in [product/surfaces.md](product/surfaces.md).
