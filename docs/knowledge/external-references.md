# External References — Reader

One entry per concept. "What / why for this project / link." Pre-Vite
references (OpenNext, `next.config.ts`, `serverExternalPackages`, etc.) are
preserved in [archive/learning-pre-vite-external-references.md](../archive/learning-pre-vite-external-references.md).

## Deployment / runtime

**Cloudflare Workers — Hono**
Hono is the HTTP router for the Worker (`src/worker.ts`). Covers the Hono
API, bindings, and middleware patterns.
→ https://hono.dev/docs/

**Cloudflare Workers — Vite guide**
Official CF guide for SPA-on-Workers with Vite; covers `nodejs_compat_v2`,
smart placement, and the `ASSETS` binding.
→ https://developers.cloudflare.com/workers/frameworks/framework-guides/vite/

**Cloudflare Smart Placement**
Routes a Worker to the CF PoP closest to its backend (Turso in this case).
Directly addresses the TTFB problem flagged in `wrangler.toml`.
→ https://developers.cloudflare.com/workers/configuration/smart-placement/

**Cloudflare Workers `caches.default`**
Edge cache API used in `articles-db.ts` (5 min TTL). Not available in pure
Vite dev — guarded by `globalThis.caches?.default`.
→ https://developers.cloudflare.com/workers/runtime/apis/cache/

## Database

**Turso (libSQL) docs**
Managed SQLite-compatible edge database. libSQL client, connection strings,
auth token setup.
→ https://docs.turso.tech/

**Drizzle ORM docs**
ORM used for schema definition, queries, and migrations. Covers
`drizzle-kit push` vs `generate` — the choice that matters for production
schema safety.
→ https://orm.drizzle.team/docs/overview

**`@libsql/client` — web target**
The `/web` entry is what the Workers runtime uses; `src/lib/db/client.ts`
imports `@libsql/client/web` explicitly.
→ https://github.com/tursodatabase/libsql-client-ts

## Auth

**better-auth docs**
Auth library used for Google OAuth + session management. Covers the Drizzle
adapter, CF Workers environment quirks, and the `oneTap` plugin.
→ https://www.better-auth.com/docs

## AI

**Vercel AI SDK reference**
`streamText`, `toTextStreamResponse`, `generateText`, and provider
configuration. `@ai-sdk/openai-compatible` enables the gateway+BYOK pattern.
→ https://sdk.vercel.ai/docs

**Cloudflare Workers AI**
Free-tier model catalogue (10 k Neurons/day), including
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` which is the default model in
`src/lib/ai-cloudflare.ts`.
→ https://developers.cloudflare.com/workers-ai/

## Extension

**Chrome MV3 Side Panel API**
Covers `sidePanel` permission, `chrome.sidePanel.open()`, and lifecycle
differences vs popup.
→ https://developer.chrome.com/docs/extensions/reference/api/sidePanel

**MV3 Service Worker lifecycle**
Explains why session cookies don't work from extension origins and why
long-lived API keys are the right auth approach for the extension.
→ https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers

## Content extraction

**Mozilla Readability**
DOM-based article extraction library used in `/api/snapshot`. Documents what
makes a page parseable and common failure modes (SPA pages with no initial
HTML content).
→ https://github.com/mozilla/readability

**pdfjs-dist**
PDF rendering engine used in `PDFReaderClient.tsx`. `GlobalWorkerOptions.workerSrc`
configuration and local worker loading are covered in the Getting Started guide.
→ https://mozilla.github.io/pdf.js/

**linkedom**
Lightweight DOM parser used server-side instead of JSDOM or Playwright.
Workers-compatible; faster than JSDOM.
→ https://github.com/WebReflection/linkedom

## Storage

**Cloudflare R2 — Workers binding**
How `PDFS_BUCKET` binding works (`put`, `get`, `delete`), zero-egress
pricing, and the difference from the S3-compatible HTTP API.
→ https://developers.cloudflare.com/r2/api/workers/workers-api-usage/

## Spec-driven development

**GitHub Issues**
Repository-owned proposal, design, requirements, and task tracking for
non-trivial feature work. See
[development/openspec.md](../development/openspec.md).
→ https://github.com/Significant-Hobbies/reader/issues
