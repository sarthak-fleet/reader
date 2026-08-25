# Commands

Source of truth: `scripts` in `package.json`. This page annotates intent and
ordering; run `pnpm run` to see the live list.

## Web app (root workspace)

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Worker (`wrangler dev`, :8787) + Vite SPA (:5173) + `local-ai.mjs`, concurrently |
| `pnpm dev:worker` | `wrangler dev` only (Worker, :8787) |
| `pnpm dev:spa` | `vite` only (SPA dev server, :5173, proxies `/api` → 8787) |
| `pnpm local-ai` | Local AI bridge (`scripts/local-ai.mjs` spawns `../local-ai/index.mjs` or legacy `../cli-bridge/index.mjs`) |
| `pnpm cli-bridge` | Alias for `pnpm local-ai` |
| `pnpm build` | `validate-env.mjs build` + `vite build` → `dist/` |
| `pnpm cf:build` | `pnpm build` + `landing-astro` build + `overlay-astro-landing.mjs` |
| `pnpm preview` | `vite preview` |
| `pnpm deploy` | `validate:env:deploy` + `cf:build` + `wrangler deploy` |
| `pnpm lint` | `biome check .` |
| `pnpm type-check` / `pnpm typecheck` | `tsc --noEmit -p tsconfig.app.json` + `tsc --noEmit -p tsconfig.worker.json` |
| `pnpm validate:env:build` | `node scripts/validate-env.mjs build` |
| `pnpm validate:env:runtime` | `node scripts/validate-env.mjs runtime` |
| `pnpm validate:env:deploy` | `node scripts/validate-env.mjs deploy` |
| `pnpm test` | `vitest run` |
| `pnpm test:watch` | `vitest` |
| `pnpm test:coverage` | `vitest run --coverage` |
| `pnpm quality` | Complete CI code-health gate across the app, Worker, landing, and extension |
| `pnpm test:e2e` | `playwright test` |
| `pnpm memory:demo` | `tsx scripts/memory-capture-demo.ts` |
| `pnpm db:generate` | Generate a tracked D1 migration from `src/lib/db/schema.ts` |
| `pnpm db:migrate:local` | Apply tracked migrations to isolated local D1 |
| `pnpm db:migrate:remote` | Explicitly apply tracked migrations to the configured remote D1 |
| `pnpm prepare` | `husky` (installs pre-commit hook) |
| `pnpm format` | `biome format --write .` |
| `pnpm format:check` | `biome format .` |
| `pnpm check` | `biome check .` |
| `pnpm docs:check` | `node scripts/check-docs.mjs` — validate docs/ links + structure |

## Chrome extension (`packages/chrome-extension/`)

Separate Vite build; excluded from root Biome/ESLint tooling.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | `vite build --watch` → `dist/` |
| `pnpm build` | `vite build` (production) |
| `pnpm type-check` | `tsc --noEmit` |
| `pnpm test` | `vitest run` |
| `pnpm pack:zip` | `pnpm build` + zip `dist/` → `web-annotator-extension-<version>.zip` |

## Landing (`landing-astro/`)

| Command | Purpose |
| --- | --- |
| `pnpm dev` | `astro dev` |
| `pnpm build` | `astro build` → `landing-astro/dist/` (overlaid onto `dist/` by `cf:build`) |
| `pnpm preview` | `astro preview` |

## Build pipeline ordering

```
pnpm build       = validate-env(build) → vite build
pnpm cf:build    = pnpm build → landing-astro build → overlay-astro-landing.mjs
pnpm deploy      = validate-env(deploy) → cf:build → wrangler deploy
```
