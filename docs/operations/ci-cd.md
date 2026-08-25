# CI/CD

GitHub Actions workflows live in `.github/workflows/`. Code is the authority
for triggers and steps; this page documents intent.

## CI — `.github/workflows/ci.yml`

**Triggers:** push to `main`/`master`, PR to `main`/`master`.

**Steps:** checkout → pnpm setup → Node 24 + Python 3.12 →
`pnpm install --frozen-lockfile --ignore-scripts` → install pinned Lizard →
`pnpm quality` (format, lint, types, app/Worker coverage, extension checks,
unused code, complexity, duplication, cycles, dependency risk, suppressions,
docs, production builds, and repository hygiene).

No deploy. No secrets beyond what `validate:env:build` needs (none for
`build` mode).

## Deploy — `.github/workflows/deploy.yml`

**Triggers:** `workflow_dispatch` only (manual). The file also defines a
`deploy-preview` job gated on `github.event_name == 'pull_request'` (build
only, no deploy), but since the workflow's `on:` block lists only
`workflow_dispatch`, that job does not currently fire on PRs. (Re-add a
`pull_request` trigger to enable it.)

**Production steps:** checkout → pnpm setup → Node 24 →
`pnpm install --frozen-lockfile` → `validate:env:build` → validate Cloudflare
runtime secrets (lists `wrangler secret list` and checks each required name
exists) → `cf:build` → `cloudflare/wrangler-action@v3 deploy` → smoke check
`curl https://read.significanthobbies.com/`.

**Required GitHub secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
**Required Cloudflare Worker secrets:** `BETTER_AUTH_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

See [deploy.md](deploy.md) for the full pipeline.

## AI Code Review — `.github/workflows/review.yaml`

**Triggers:** `workflow_dispatch` only (manual). Temporarily manual because
the referenced reviewer action has no `v1` tag, which made every PR show a
failed review check before code ran.

## Weekly Quality Check — `.github/workflows/weekly.yml`

**Triggers:** `cron: '0 9 * * 1'` (Mondays 09:00 UTC) + `workflow_dispatch`.

**Steps:** checkout → Node 22 → corepack/pnpm setup → install → run
`lint`, `typecheck`, `test`, `build` scripts if present.

See [jobs.md](jobs.md).

## Docs — `.github/workflows/docs.yml`

**Triggers:** push/PR affecting `docs/**`, `AGENTS.md`, `STATUS.md`,
`scripts/check-docs.mjs`; plus `workflow_dispatch`.

**Steps:** checkout → Node 22 → run `node scripts/check-docs.mjs` to validate
`docs/` link integrity and structure.

See [../development/testing.md](../development/testing.md) for the validator.

## Dependabot — `.github/dependabot.yml`

Weekly (Monday) npm updates, scoped to `@saas-maker/sdk`, one open PR at a
time, `deps:` commit prefix.
