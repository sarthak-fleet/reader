import { Readability } from '@mozilla/readability';
import { streamText } from 'ai';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { parseHTML } from 'linkedom';

import { getLanguageModel } from '../../lib/ai-cloudflare';
import { fetchAllTags, fetchArticlesForSourceMap, searchArticles } from '../../lib/articles-db';
import { getAuthenticatedUserId } from '../../lib/auth-api';
import type { BrowserMemorySnapshotInput } from '../../lib/browser-memory-import';
import { importBrowserMemorySnapshots } from '../../lib/browser-memory-import';
import { db, schema } from '../../lib/db/client';
import { users } from '../../lib/db/schema';
import { searchMemories } from '../../lib/memories-db';
import { buildSourceRelationshipMap } from '../../lib/research-brief';
import {
  DEFAULT_SYSTEM_PROMPT,
  normalizeChatMessages,
  normalizeText,
  TEXT_STREAM_HEADERS,
  toSDKMessages,
} from '../../lib/ai-server';
import { fetchWithValidatedRedirects } from '../../lib/safe-fetch';
import { validateExternalUrl } from '../../lib/url-validation';
import type { WorkerEnv } from '../../lib/worker-env';

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const MAX_BATCH_SIZE = 50;
const EXPORT_VERSION = 1;

const EXT_MAX_MESSAGES = 6;
const EXT_MAX_SYSTEM_PROMPT_LENGTH = 2_000;
const DAILY_LIMIT = 10;
const rateLimitMap = new Map<string, { count: number; resetDate: string }>();

function getClientIP(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const today = getTodayDate();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetDate !== today) {
    rateLimitMap.set(ip, { count: 1, resetDate: today });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }

  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

const misc = new Hono<{ Bindings: WorkerEnv }>();

misc.get('/auth/me', async (c) => {
  const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  return c.json({
    uid: user.id,
    email: user.email ?? null,
    displayName: user.name ?? null,
    photoURL: user.image ?? null,
  });
});

misc.get('/search', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const query = c.req.query('q') || '';
    const projectId = c.req.query('projectId') || undefined;

    if (!query || query.trim().length < 2) {
      return c.json({ results: [] });
    }

    const [articleResults, memoryResults] = await Promise.all([
      searchArticles(userId, query, projectId),
      searchMemories(userId, query),
    ]);
    const results = [...articleResults, ...memoryResults].sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );
    return c.json({ results });
  } catch (error) {
    console.error('Error searching articles:', error);
    return c.json({ error: 'Failed to search articles' }, 500);
  }
});

misc.get('/tags', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const tags = await fetchAllTags(userId);
    return c.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return c.json({ error: 'Failed to fetch tags' }, 500);
  }
});

misc.get('/data-export', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const [articles, boards, lists] = await Promise.all([
      db.select().from(schema.articles).where(eq(schema.articles.userId, userId)),
      db.select().from(schema.boards).where(eq(schema.boards.userId, userId)),
      db.select().from(schema.lists).where(eq(schema.lists.userId, userId)),
    ]);

    const exportedAt = new Date().toISOString();
    const payload = {
      format: 'reader-export',
      formatVersion: EXPORT_VERSION,
      exportedAt,
      userId,
      counts: {
        articles: articles.length,
        boards: boards.length,
        lists: lists.length,
      },
      tables: {
        articles,
        boards,
        lists,
      },
    };

    const filename = `reader-${exportedAt.slice(0, 10)}.json`;
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return c.json({ error: 'Failed to export data' }, 500);
  }
});

misc.get('/research/source-map', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const focusId = c.req.query('focusId') || undefined;
    const articles = await fetchArticlesForSourceMap(userId);
    return c.json(buildSourceRelationshipMap(articles, focusId));
  } catch (error) {
    console.error('Error building source map:', error);
    return c.json({ error: 'Failed to build source map' }, 500);
  }
});

const SNAPSHOT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchSnapshot(targetUrl: string): Promise<{
  title: string;
  content: string;
  byline: string | null;
  siteName: string | null;
  url: string;
}> {
  const { response } = await fetchWithValidatedRedirects(targetUrl, {
    headers: {
      'User-Agent': SNAPSHOT_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_RESPONSE_SIZE) {
    throw new Error('Response too large');
  }

  const html = new TextDecoder().decode(body);
  const { document } = parseHTML(html);

  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) {
    throw new Error('Failed to parse article content');
  }

  return {
    title: article.title ?? '',
    content: article.content ?? '',
    byline: article.byline ?? null,
    siteName: article.siteName ?? null,
    url: targetUrl,
  };
}

misc.get('/snapshot', async (c) => {
  const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const targetUrl = c.req.query('url');
  if (!targetUrl) {
    return new Response('URL parameter is required', { status: 400 });
  }

  const validation = await validateExternalUrl(targetUrl);
  if (!validation.ok) {
    return new Response(validation.reason, { status: 400 });
  }

  try {
    const snapshot = await fetchSnapshot(validation.url.href);
    return c.json({ snapshot });
  } catch (error: unknown) {
    console.error('Snapshot error:', error);
    return c.json({ message: 'Failed to capture the website content.' }, 500);
  }
});

misc.get('/proxy', async (c) => {
  const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const targetUrl = c.req.query('url');
  if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

  const validation = await validateExternalUrl(targetUrl);
  if (!validation.ok) return new Response(validation.reason, { status: 400 });
  const parsed = validation.url;

  try {
    const upstream = await fetchWithValidatedRedirects(parsed, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BlogReader/1.0)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.response.ok) {
      return new Response(`Upstream returned ${upstream.response.status}`, { status: 502 });
    }

    const contentType = upstream.response.headers.get('content-type') || '';
    const body = await upstream.response.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_SIZE) {
      return new Response('Response too large', { status: 502 });
    }

    const isHtml = contentType.includes('text/html');
    const responseHeaders = new Headers();
    responseHeaders.set('content-type', contentType);
    responseHeaders.set('cache-control', 'private, no-store');

    if (isHtml) {
      let html = new TextDecoder().decode(body);
      const baseTag = `<base href="${parsed.origin}/">`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else if (html.includes('<head ')) {
        html = html.replace(/<head\s[^>]*>/, `$&${baseTag}`);
      } else if (html.includes('<html')) {
        html = html.replace(/<html[^>]*>/, `$&<head>${baseTag}</head>`);
      } else {
        html = baseTag + html;
      }

      responseHeaders.set(
        'Content-Security-Policy',
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'"
      );
      responseHeaders.set('X-Content-Type-Options', 'nosniff');

      return new Response(html, { status: 200, headers: responseHeaders });
    }

    return new Response(body, { status: 200, headers: responseHeaders });
  } catch (err) {
    console.error('Proxy error:', err);
    return new Response('Proxy fetch failed', { status: 502 });
  }
});

misc.post('/browser-memory/import', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const snapshots = body?.snapshots;
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return c.json({ error: 'snapshots array is required' }, 400);
    }
    if (snapshots.length > MAX_BATCH_SIZE) {
      return c.json({ error: `At most ${MAX_BATCH_SIZE} snapshots per request` }, 400);
    }

    const category = typeof body.category === 'string' ? body.category : undefined;
    // Memories have no list/category columns; surface category as an extra tag
    // so imported captures remain groupable alongside the browser-memory tag.
    const extraTags = category ? [category] : undefined;

    const result = await importBrowserMemorySnapshots(
      userId,
      snapshots as BrowserMemorySnapshotInput[],
      { extraTags }
    );

    return c.json(result);
  } catch (error) {
    console.error('browser-memory import error:', error);
    return c.json({ error: 'Failed to import browser memory' }, 500);
  }
});

misc.post('/ext/chat', async (c) => {
  const ip = getClientIP(c.req.raw);
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return c.json(
      { error: 'Daily chat limit reached. Please try again tomorrow.' },
      {
        status: 429,
        headers: { 'Retry-After': '86400' },
      }
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    systemPrompt?: unknown;
    messages?: unknown;
  };

  const systemPrompt =
    normalizeText(body.systemPrompt, EXT_MAX_SYSTEM_PROMPT_LENGTH) || DEFAULT_SYSTEM_PROMPT;
  const messages = normalizeChatMessages(body.messages).slice(-EXT_MAX_MESSAGES);

  if (messages.length === 0) {
    return c.json({ error: 'At least one message is required' }, 400);
  }

  try {
    const result = streamText({
      model: getLanguageModel({
        binding: c.env.AI,
        endpointUrl: '',
        apiKey: '',
        model: '',
      }),
      system: systemPrompt,
      messages: toSDKMessages(messages),
      maxRetries: 0,
    });

    return result.toTextStreamResponse({
      headers: {
        ...TEXT_STREAM_HEADERS,
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch (error) {
    console.error('Extension chat request failed:', error);
    return c.json({ error: 'Failed to stream AI response' }, 500);
  }
});

export default misc;
