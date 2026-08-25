# Conventions

## Code style

- **Formatter / linter:** Biome (`biome.json`). `pnpm format` writes;
  `pnpm lint` checks. Biome is the authority for formatting and linting at
  the root.
- **Indent:** 2 spaces, single quotes, semicolons, ES5 trailing commas,
  LF line endings, 100 col width (see `biome.json`).
- **TypeScript:** strict mode, `tsc --noEmit` against `tsconfig.app.json`
  (SPA) and `tsconfig.worker.json` (Worker). The root `tsconfig.json` is a
  project-references shell that delegates to those two.
- **Path alias:** `@/*` → `./src/*` (configured in both app and worker
  tsconfigs).
- **React:** React 19, function components, `react-router-dom` v7 with
  lazy-loaded pages (`src/router.tsx`).
- **Data fetching:** `@tanstack/react-query`; `ReactQueryHydrate` is a thin
  `HydrationBoundary` wrapper for seeding the client query cache.

## Pre-commit hook (Husky + lint-staged)

`.husky/pre-commit` runs `npx lint-staged`. `lint-staged` config in
`package.json` runs `biome check --write` on staged
`*.{js,jsx,ts,tsx,json,css}`. If the hook modifies files, re-stage them and
retry the commit.

## Tooling scope

- Biome ignores `.next`, `.open-next`, `.wrangler`, `out`, `dist`, `build`,
  `node_modules`, `.astro`, `vite-env.d.ts`, `cloudflare-env.d.ts`,
  lockfiles, `tsconfig.tsbuildinfo`, `.cf-pages-bundle`, `packages`, and
  `*.html` (see `biome.json` `files.includes`). The Chrome extension has its
  own Vite/Vitest config and is excluded from root tooling.
- Prettier config (`.prettierrc`) and `.prettierignore` exist but Biome is
  the active formatter for the root workspace.

## Commit convention

Conventional Commits:

```
feat(reader): add PDF export
fix(auth): resolve token refresh issue
chore: update dependencies
docs: consolidate knowledge system
```

## Git rules

- Do not commit `.env`, auth credentials, or `firebase-service-account.json`
  (all in `.gitignore`). Verify `.gitignore` before any push.
- Do not push, deploy, run migrations, or open PRs without explicit user
  approval. See `AGENTS.md` and the fleet standard at `../AGENTS.md`.

## Documentation conventions

- Markdown under `docs/` is the source of truth. See
  [../index.md#maintenance-rules](../index.md#maintenance-rules).
- Run `pnpm docs:check` before committing doc changes — it catches broken
  links and files outside the canonical structure.

## Spec-driven changes

Non-trivial feature work uses the GitHub-Issue spec workflow. See
[openspec.md](openspec.md).
