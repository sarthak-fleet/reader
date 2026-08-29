import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_SURFACE, handleAgentEdge } from './agent-edge.mjs';

const readPublic = (path: string) => readFileSync(resolve(process.cwd(), 'public', path), 'utf8');
const readRepo = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sitemapUrls(): string[] {
  return [...readPublic('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1] ?? ''
  );
}

/**
 * Map a sitemap pathname to the landing-astro source page that renders it.
 * Astro uses `index.astro` for directory routes and `<name>.astro` for leaf
 * routes; the homepage is `pages/index.astro`.
 */
function landingSourceForPath(pathname: string): string {
  if (pathname === '/') return 'landing-astro/src/pages/index.astro';
  const base = pathname.replace(/^\//, '');
  // Prefer a leaf route (e.g. /faq -> pages/faq.astro); fall back to a
  // directory route (e.g. /changelog -> pages/changelog/index.astro).
  const leaf = `landing-astro/src/pages/${base}.astro`;
  try {
    readFileSync(resolve(process.cwd(), leaf));
    return leaf;
  } catch {
    return `landing-astro/src/pages/${base}/index.astro`;
  }
}

describe('public agent surface parity', () => {
  it('keeps the sitemap limited to canonical HTML surfaces', () => {
    const catalogUrls = AGENT_SURFACE.catalog.surfaces
      .filter((surface) => surface.kind !== 'auth')
      .map((surface) => surface.url);
    const urls = sitemapUrls();

    expect(urls).toEqual(catalogUrls);
    expect(urls).toHaveLength(3);
    expect(urls).not.toContain('https://read.significanthobbies.com/login');
    for (const url of urls) {
      const path = new URL(url).pathname;
      expect(path).not.toMatch(/\.(?:json|md|txt|xml)$/);
      expect(path).not.toMatch(/^\/api(?:\/|$)/);
    }
  });

  it('keeps auth-only routes out of the public catalog and HTML sitemap', () => {
    const urls = new Set(sitemapUrls());
    expect(AGENT_SURFACE.catalog.surfaces.map((surface) => surface.id)).not.toContain('login');
    expect(urls).not.toContain('https://read.significanthobbies.com/login');
    expect(AGENT_SURFACE.catalog.auth.notes).toContain('Personal libraries');
  });

  it('provides a substantive Markdown counterpart for every HTML surface', () => {
    const publicOrigin = new URL(AGENT_SURFACE.url).origin;

    for (const surface of AGENT_SURFACE.catalog.surfaces) {
      expect(surface.md).toBeTruthy();
      const markdownUrl = new URL(surface.md ?? '');
      expect(markdownUrl.origin).toBe(publicOrigin);
      const markdown = readPublic(markdownUrl.pathname.replace(/^\//, ''));
      expect(markdown).toMatch(/^#\s+\S/m);
      expect(markdown.trim().length).toBeGreaterThan(120);
    }
  });

  it('keeps machine resources discoverable but outside the HTML sitemap', () => {
    const urls = new Set(sitemapUrls());
    const robots = readPublic('robots.txt');
    const llms = readPublic('llms.txt');
    const catalog = AGENT_SURFACE.catalog;
    const machineResources = [
      catalog.llms,
      catalog.llmsFull,
      catalog.sitemap,
      catalog.robots,
      `${AGENT_SURFACE.url}/api/ai`,
      `${AGENT_SURFACE.url}/index.md`,
    ];

    for (const resource of machineResources) {
      expect(urls).not.toContain(resource);
    }
    expect(robots).toContain(`Sitemap: ${catalog.sitemap}`);
    expect(robots).toContain('Allow: /llms.txt');
    expect(robots).toContain('Allow: /llms-full.txt');
    expect(robots).toContain('Allow: /index.md');
    expect(robots).toContain('Allow: /api/ai');
    expect(llms).toContain(catalog.sitemap);
    expect(llms).toContain(catalog.llmsFull);
    expect(llms).toContain('/api/ai');
    expect(llms).toContain('/pricing.md');
    expect(llms).toContain('/skill.md');
    expect(readPublic('llms-full.txt')).toContain('maintenance-first');
    expect(AGENT_SURFACE.catalog).toEqual(JSON.parse(readPublic('api-ai.json')));
  });

  it('keeps the public product truth and extension boundary aligned', () => {
    const home = readPublic('index.md');
    const faq = readPublic('faq.md');
    const pricing = readPublic('pricing.md');

    for (const document of [home, faq]) {
      expect(document).toContain('Chrome');
      expect(document).toContain('distribution is deferred');
    }
    expect(home).toContain('maintenance-first');
    expect(home).toContain('no public plan or checkout');
    expect(pricing).toContain('no public plan, checkout, paid tier, or purchase flow');
  });

  it('publishes a digest-verified source-workflow skill', () => {
    const skill = readPublic('.well-known/agent-skills/reader-source-workflow/SKILL.md');
    const index = JSON.parse(readPublic('.well-known/agent-skills/index.json'));
    const digest = `sha256:${createHash('sha256').update(skill).digest('hex')}`;

    expect(index.skills).toHaveLength(1);
    expect(index.skills[0]).toMatchObject({
      name: 'reader-source-workflow',
      type: 'skill-md',
      digest,
    });
    expect(readPublic('skill.md')).toBe(skill);
  });

  it('serves route Markdown and rebinds catalogs for preview origins', async () => {
    const env = {
      ASSETS: {
        fetch: async (request: Request) => {
          const pathname = new URL(request.url).pathname.replace(/^\//, '');
          try {
            return new Response(request.method === 'HEAD' ? null : readPublic(pathname), {
              headers: {
                'Content-Type': pathname.endsWith('.json')
                  ? 'application/json; charset=utf-8'
                  : 'text/markdown; charset=utf-8',
              },
            });
          } catch {
            return new Response('not found', { status: 404 });
          }
        },
      },
    };

    const markdown = await handleAgentEdge(
      new Request('https://reader-preview.example/faq', {
        headers: { Accept: 'text/markdown' },
      }),
      env
    );
    expect(markdown?.status).toBe(200);
    expect(markdown?.headers.get('vary')).toBe('Accept');
    expect(await markdown?.text()).toContain('# Reader FAQ');

    const botMarkdown = await handleAgentEdge(
      new Request('https://reader-preview.example/', {
        headers: { 'User-Agent': 'GPTBot/1.0', Accept: 'text/html' },
      }),
      env
    );
    expect(botMarkdown?.status).toBe(200);
    expect(botMarkdown?.headers.get('content-type')).toContain('text/markdown');
    expect(await botMarkdown?.text()).toContain('# Reader');

    const catalog = await handleAgentEdge(
      new Request('https://reader-preview.example/api/ai'),
      env
    );
    expect(catalog?.status).toBe(200);
    expect(await catalog?.text()).toContain('https://reader-preview.example/index.md');

    const aiCatalog = await handleAgentEdge(
      new Request('https://reader-preview.example/.well-known/ai-catalog.json'),
      env
    );
    expect(aiCatalog?.status).toBe(200);
    expect(await aiCatalog?.text()).toContain('https://reader-preview.example/openapi.json');

    const sitemap = await handleAgentEdge(
      new Request('https://reader-preview.example/sitemap.xml'),
      env
    );
    expect(sitemap?.status).toBe(200);
    expect(await sitemap?.text()).toContain('https://reader-preview.example/faq');

    const robots = await handleAgentEdge(
      new Request('https://reader-preview.example/robots.txt'),
      env
    );
    expect(robots?.status).toBe(200);
    expect(await robots?.text()).toContain('Sitemap: https://reader-preview.example/sitemap.xml');
  });

  // Regression for #47: every sitemap URL must render a self-canonical
  // (canonical == its own URL). Account routes like /login must stay out of
  // the sitemap and must not be assigned the homepage canonical.
  it('every sitemap URL declares a self-canonical matching its own path', () => {
    const urls = sitemapUrls();
    expect(urls).not.toContain('https://read.significanthobbies.com/login');

    for (const url of urls) {
      const pathname = new URL(url).pathname;
      const sourcePath = landingSourceForPath(pathname);
      const source = readRepo(sourcePath);

      // The Layout canonical defaults to '/', so the homepage needs no
      // explicit declaration. Every other sitemap route must declare an
      // explicit canonicalPath equal to its own pathname.
      if (pathname === '/') {
        // Home must not override the default '/' canonical with a different path.
        const override = source.match(/canonicalPath\s*=\s*"([^"]+)"/);
        expect(override ? override[1] : '/').toBe('/');
      } else {
        const match = source.match(/canonicalPath\s*=\s*"([^"]+)"/);
        expect(match, `${sourcePath} must declare a self-canonical for ${pathname}`).not.toBeNull();
        expect(match?.[1]).toBe(pathname);
      }
    }
  });
});
