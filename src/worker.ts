import { Hono } from 'hono';

import { handleAgentEdge } from './agent-edge.mjs';
import { createAuth } from './lib/auth';
import { isSpaRoute } from './lib/spa-route';
import type { WorkerEnv } from './lib/worker-env';
import { bindWorkerEnv } from './worker/bind-env';
import aiRoutes from './worker/routes/ai';
import articlesRoutes from './worker/routes/articles';
import boardsRoutes from './worker/routes/boards';
import keysRoutes from './worker/routes/keys';
import listsRoutes from './worker/routes/lists';
import memoriesRoutes from './worker/routes/memories';
import mcpReadRoutes from './worker/routes/mcp';
import miscRoutes from './worker/routes/misc';
import pdfRoutes from './worker/routes/pdf';
import rssRoutes from './worker/routes/rss';
import shareRoutes from './worker/routes/share';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

const AUTH_COOKIE_FRAGMENTS = ['session_token', 'session-token'];
const MARKDOWN_ALTERNATES: Record<string, string> = {
  '/': '/index.md',
  '/faq': '/faq.md',
  '/changelog': '/changelog.md',
  '/login': '/login.md',
};

const api = new Hono<{ Bindings: WorkerEnv }>();

api.use('*', async (c, next) => {
  bindWorkerEnv(c.env);
  await next();
});

api.use('/api/*', async (c, next) => {
  await next();
  const response = c.res;
  // Pass the original response as init so multiple Set-Cookie headers are
  // preserved. Using `new Headers(response.headers)` merges multiple
  // Set-Cookie values into one comma-joined string that browsers cannot
  // parse — which breaks the OAuth callback (session token + state clear).
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    newResponse.headers.set(key, value);
  }
  return newResponse;
});

api.get('/api/auth/client-config', (c) => {
  c.header('Cache-Control', 'no-store');
  return c.json({ googleClientId: c.env.GOOGLE_CLIENT_ID?.trim() || null });
});

api.on(['GET', 'POST'], '/api/auth/*', (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

api.route('/api/articles', articlesRoutes);
api.route('/api/boards', boardsRoutes);
api.route('/api/lists', listsRoutes);
api.route('/api/memories', memoriesRoutes);
api.route('/api/mcp', mcpReadRoutes);
api.route('/api/ai', aiRoutes);
api.route('/api/keys', keysRoutes);
api.route('/api/pdfs', pdfRoutes);
api.route('/api/rss', rssRoutes);
api.route('/api/share', shareRoutes);
api.route('/api', miscRoutes);

api.onError((err, c) => {
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err.message, err.stack);
  return c.json({ error: 'Internal Server Error' }, 500);
});

function hasAuthCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie');
  if (!cookie) return false;
  return AUTH_COOKIE_FRAGMENTS.some((fragment) => cookie.includes(fragment));
}

function withSecurityHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  // Allow edge caching of static HTML (landing page) with short browser TTL
  // and SWR so deploys propagate quickly without sacrificing TTFB on slow networks.
  const contentType = headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    headers.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
    if (pathname === '/login') headers.set('X-Robots-Tag', 'noindex, follow');
    const markdownAlternate = MARKDOWN_ALTERNATES[pathname];
    if (markdownAlternate) {
      headers.set('Link', `<${markdownAlternate}>; rel="alternate"; type="text/markdown"`);
    }
    // Add Vary: Accept for pages that have markdown alternates.
    const existingVary = headers.get('Vary');
    headers.set('Vary', existingVary ? `${existingVary}, Accept` : 'Accept, Accept-Encoding');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Fleet agent indexing (GEO) — before SPA/ASSETS fallback
    const agent = await handleAgentEdge(request, env);
    if (agent) return agent;

    if (url.pathname.startsWith('/api/')) {
      try {
        return await api.fetch(request, env, ctx);
      } catch (err) {
        console.error(`[error] fetch ${url.pathname}:`, err instanceof Error ? err.message : err);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (request.method === 'GET' && url.pathname === '/' && hasAuthCookie(request)) {
      return Response.redirect(`${url.origin}/library`, 302);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.ok) {
      return withSecurityHeaders(assetResponse, url.pathname);
    }

    if (request.method !== 'GET') {
      return assetResponse;
    }

    if (url.pathname === '/') {
      const landing = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
      return landing.ok ? withSecurityHeaders(landing, url.pathname) : assetResponse;
    }

    if (!isSpaRoute(url.pathname)) {
      return assetResponse;
    }

    // Assets serves app.html at /app; fetching /app.html returns 307 (not ok).
    const spa = await env.ASSETS.fetch(new Request(new URL('/app', url), request));
    return spa.ok ? withSecurityHeaders(spa, url.pathname) : assetResponse;
  },
};
