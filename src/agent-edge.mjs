import staticCatalog from '../public/api-ai.json' with { type: 'json' };

const PRODUCT_ORIGIN = 'https://read.significanthobbies.com';

export const AGENT_SURFACE = {
  name: 'Reader',
  url: PRODUCT_ORIGIN,
  catalog: staticCatalog,
};

const ROUTE_MARKDOWN = new Map([
  ['/', '/index.md'],
  ['/faq', '/faq.md'],
  ['/changelog', '/changelog.md'],
  ['/login', '/login.md'],
]);

const OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Reader public discovery API',
    version: '2.0.0',
    description:
      'Read-only discovery surfaces for Reader product truth, public Markdown, access state, and agent guidance. Personal libraries and authenticated APIs are private and are not described as public agent operations.',
    contact: {
      name: 'Reader',
      url: PRODUCT_ORIGIN,
    },
  },
  servers: [{ url: PRODUCT_ORIGIN }],
  tags: [
    {
      name: 'discovery',
      description: 'Public, read-only product and agent discovery surfaces.',
    },
  ],
  paths: {
    '/api/ai': discoveryOperation(
      'getAgentCatalog',
      'Get the Reader agent catalog',
      'application/json'
    ),
    '/llms.txt': discoveryOperation(
      'getLlmsIndex',
      'Get the concise Reader agent index',
      'text/plain'
    ),
    '/llms-full.txt': discoveryOperation(
      'getFullAgentBrief',
      'Get the complete public Reader agent brief',
      'text/plain'
    ),
    '/index.md': discoveryOperation(
      'getHomepageMarkdown',
      'Get Reader purpose and current product truth as Markdown',
      'text/markdown'
    ),
    '/pricing.md': discoveryOperation(
      'getPricingState',
      'Get the current Reader access and commercial state',
      'text/markdown'
    ),
    '/agents.md': discoveryOperation(
      'getAgentInstructions',
      'Get public Reader agent instructions and boundaries',
      'text/markdown'
    ),
    '/skill.md': discoveryOperation(
      'getReaderSourceWorkflow',
      'Get the Reader source-workflow skill',
      'text/markdown'
    ),
    '/.well-known/ai-catalog.json': discoveryOperation(
      'getAiCatalog',
      'Get the standards-shaped Reader AI catalog',
      'application/json'
    ),
    '/.well-known/agent-skills/index.json': discoveryOperation(
      'getAgentSkillIndex',
      'Get the digest-verified Reader agent-skill index',
      'application/json'
    ),
    '/sitemap.xml': discoveryOperation(
      'getSitemap',
      'Get the public Reader HTML sitemap',
      'application/xml'
    ),
    '/openapi.json': discoveryOperation(
      'getOpenApiSpec',
      'Get this public discovery specification',
      'application/json'
    ),
  },
};

function discoveryOperation(operationId, summary, contentType) {
  return {
    get: {
      operationId,
      tags: ['discovery'],
      summary,
      responses: {
        200: {
          description: summary,
          content: {
            [contentType]: {
              schema: contentType.includes('json') ? { type: 'object' } : { type: 'string' },
            },
          },
        },
        404: {
          description: 'Not found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  path: { type: 'string' },
                },
                required: ['error', 'path'],
              },
            },
          },
        },
      },
    },
  };
}

/**
 * Serve agent discovery before the SPA and asset fallback.
 *
 * @param {Request} request
 * @param {{ ASSETS: { fetch(request: Request): Promise<Response> } }} env
 * @returns {Promise<Response | null>}
 */
export async function handleAgentEdge(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;

  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const origin = resolveOrigin(request, url);

  if (path === '/openapi.json' || path === '/openapi.yaml') {
    return json(rebindUrls(OPENAPI_SPEC, origin), request.method);
  }

  if (path === '/api/ai') {
    return json(rebindUrls(staticCatalog, origin), request.method);
  }

  if (path === '/robots.txt') {
    return serveReboundTextAsset(env, request, path, origin, 'text/plain; charset=utf-8');
  }

  if (path === '/sitemap.xml' || path === '/sitemap-index.xml' || path === '/sitemap-0.xml') {
    return serveReboundTextAsset(env, request, path, origin, 'application/xml; charset=utf-8');
  }

  if (path === '/.well-known/ai-catalog.json') {
    const catalog = await readJsonAsset(env, request, path);
    return catalog ? json(rebindUrls(catalog, origin), request.method) : null;
  }

  if (path === '/api' || path.startsWith('/api/')) {
    return jsonError(path, request.method);
  }

  const markdownPath = ROUTE_MARKDOWN.get(path);
  if (markdownPath && (wantsMarkdown(request) || url.searchParams.get('mode') === 'agent')) {
    return serveAsset(env, request, markdownPath, {
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${markdownPath}>; rel="alternate"; type="text/markdown"`,
      Vary: 'Accept',
    });
  }

  if (wantsMarkdown(request) && !path.includes('.') && !path.startsWith('/api/')) {
    return markdown404(path, request.method, origin);
  }

  return null;
}

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  const withSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return withSlash.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
}

function resolveOrigin(request, url) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  if (!host || !isTrustedPreviewHost(host)) return url.origin;

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : url.protocol.replace(':', '');
  return `${protocol}://${host}`;
}

function isTrustedPreviewHost(hostWithPort) {
  const hostname = hostWithPort
    .replace(/^\[/, '')
    .replace(/\](:\d+)?$/, '')
    .split(':')[0];
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.trycloudflare.com') ||
    hostname.endsWith('.workers.dev') ||
    hostname.endsWith('.example')
  );
}

function wantsMarkdown(request) {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (!accept.includes('text/markdown')) return isAgentUserAgent(request);
  if (!accept.includes('text/html')) return true;
  return accept.indexOf('text/markdown') < accept.indexOf('text/html');
}

function isAgentUserAgent(request) {
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  return [
    'gptbot',
    'chatgpt-user',
    'claudebot',
    'perplexitybot',
    'google-extended',
    'applebot-extended',
    'ora-agent',
    'deepseekbot',
  ].some((agent) => userAgent.includes(agent));
}

async function serveAsset(env, request, pathname, extraHeaders = {}) {
  const target = new URL(pathname, request.url);
  const asset = await env.ASSETS.fetch(
    new Request(target, {
      method: request.method,
      headers: request.headers,
    })
  );
  if (!asset.ok) return asset;

  const headers = new Headers(asset.headers);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=600');
  headers.set('X-Content-Type-Options', 'nosniff');

  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

async function readJsonAsset(env, request, pathname) {
  const response = await serveAsset(env, request, pathname, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  if (!response.ok || request.method === 'HEAD') return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function serveReboundTextAsset(env, request, pathname, origin, contentType) {
  const target = new URL(pathname, request.url);
  const asset = await env.ASSETS.fetch(new Request(target, { method: 'GET' }));
  if (!asset.ok) return asset;

  const body = (await asset.text()).replaceAll(PRODUCT_ORIGIN, origin);
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function rebindUrls(value, origin) {
  if (typeof value === 'string') return value.replaceAll(PRODUCT_ORIGIN, origin);
  if (Array.isArray(value)) return value.map((item) => rebindUrls(item, origin));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rebindUrls(item, origin)])
    );
  }
  return value;
}

function markdown404(path, method, origin) {
  const body = `# 404 — Not Found

\`${path}\` is not a public Reader route.

## Where to look next

- [Reader product truth](${origin}/index.md)
- [Agent index](${origin}/llms.txt)
- [Agent catalog](${origin}/api/ai)
- [Sitemap](${origin}/sitemap.xml)
- [OpenAPI](${origin}/openapi.json)
`;

  return new Response(method === 'HEAD' ? null : body, {
    status: 404,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept',
    },
  });
}

function jsonError(path, method) {
  return new Response(method === 'HEAD' ? null : JSON.stringify({ error: 'not_found', path }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'RateLimit-Limit': '120',
      'RateLimit-Remaining': '119',
      'RateLimit-Reset': '60',
    },
  });
}

function json(data, method = 'GET') {
  return new Response(method === 'HEAD' ? null : `${JSON.stringify(data, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
      'RateLimit-Limit': '120',
      'RateLimit-Remaining': '119',
      'RateLimit-Reset': '60',
    },
  });
}
