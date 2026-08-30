import { generateText } from 'ai';
import { Hono } from 'hono';

import { getLanguageModel } from '../../lib/ai-cloudflare';
import { normalizeApiKey, normalizeEndpointUrl, normalizeText } from '../../lib/ai-server';
import {
  ArticleUpdateValidationError,
  createArticleRecord,
  deleteArticle,
  fetchArticleById,
  fetchArticleSummaries,
  findArticleByUrl,
  generateArticleShareId,
  revokeArticleShareId,
  updateArticle,
  verifyArticleOwnership,
} from '../../lib/articles-db';
import { getAuthenticatedUserId } from '../../lib/auth-api';
import { addArticleToList, removeArticleFromList } from '../../lib/lists-db';
import type { WorkerEnv } from '../../lib/worker-env';
import type { SessionReview } from '../../types';

const SESSION_REVIEW_SYSTEM_PROMPT = `You are an expert at synthesizing reading sessions. Given an article title and the reader's notes (each note may include a highlighted excerpt), produce a compact review artifact.

Respond with valid JSON in exactly this structure:
{
  "summary": "2–3 sentence recap of the core argument or content of the article",
  "keyThemes": ["theme1", "theme2"],
  "actionItems": ["action or follow-up 1", "action or follow-up 2"],
  "notesSummary": "1–2 sentence synthesis of what the reader focused on and annotated"
}

Rules:
- keyThemes: 2–4 short phrases, no sentences
- actionItems: only concrete next steps mentioned in notes; empty array [] if none
- Keep all values concise and factual`;

function buildSessionReviewPrompt(
  title: string,
  notes: Array<{ text: string; textPreview?: string }>
) {
  const notesBlock = notes
    .map((n, i) => {
      const excerpt = n.textPreview ? `\n  Excerpt: "${n.textPreview}"` : '';
      return `${i + 1}. Note: "${n.text}"${excerpt}`;
    })
    .join('\n');

  return `Article title: "${title}"

Reader's notes:
${notesBlock}

Generate the session review JSON.`;
}

const articles = new Hono<{ Bindings: WorkerEnv }>();

articles.get('/', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const projectId = c.req.query('projectId') || undefined;
    const listId = c.req.query('listId') || undefined;
    const summaries = await fetchArticleSummaries(userId, projectId, listId);
    return c.json(summaries);
  } catch (error) {
    console.error('Error fetching articles:', error);
    return c.json({ error: 'Failed to fetch articles' }, 500);
  }
});

articles.post('/', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { url, title, byline, content, projectId, tags, listIds, category, type } = body || {};
    const articleType = type === 'pdf' || type === 'link' ? type : 'article';

    if (!url || (articleType !== 'link' && !content)) {
      return c.json({ error: 'URL and content are required' }, 400);
    }

    if (typeof url === 'string' && !url.startsWith('blob://')) {
      try {
        const { protocol } = new URL(url);
        if (!['http:', 'https:'].includes(protocol)) {
          return c.json({ error: 'Invalid URL scheme' }, 400);
        }
      } catch {
        return c.json({ error: 'Invalid URL' }, 400);
      }
    }

    const existingId = await findArticleByUrl(url, userId);
    if (existingId) {
      return c.json({ id: existingId, existing: true });
    }

    const id = await createArticleRecord({
      url,
      title,
      byline,
      content,
      projectId,
      tags,
      userId,
      type: articleType,
      listIds,
      category,
    });
    return c.json({ id });
  } catch (error) {
    console.error('Error creating article:', error);
    return c.json({ error: 'Failed to create article' }, 500);
  }
});

articles.get('/:id', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const article = await fetchArticleById(id, userId);
    if (!article) return c.json({ error: 'Article not found' }, 404);

    return c.json(article);
  } catch (error) {
    console.error('Error fetching article:', error);
    return c.json({ error: 'Failed to fetch article' }, 500);
  }
});

articles.put('/:id', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const isOwner = await verifyArticleOwnership(id, userId);
    if (!isOwner) return c.json({ error: 'Not found or not authorized' }, 404);

    const body = await c.req.json();
    if (typeof body !== 'object' || body === null) {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    const payload = body as Record<string, unknown>;

    if (payload.shareAction === 'generate') {
      const shareId = await generateArticleShareId(id, userId);
      if (!shareId) return c.json({ error: 'Failed to generate share link' }, 500);
      return c.json({ shareId });
    }

    if (payload.shareAction === 'revoke') {
      await revokeArticleShareId(id, userId);
      return c.json({ success: true });
    }

    try {
      await updateArticle(id, userId, payload);
    } catch (error) {
      if (error instanceof ArticleUpdateValidationError) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating article:', error);
    return c.json({ error: 'Failed to update article' }, 500);
  }
});

articles.delete('/:id', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const isOwner = await verifyArticleOwnership(id, userId);
    if (!isOwner) return c.json({ error: 'Not found or not authorized' }, 404);

    await deleteArticle(id, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting article:', error);
    return c.json({ error: 'Failed to delete article' }, 500);
  }
});

articles.post('/:id/lists', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const articleId = c.req.param('id');
    if (!articleId) return c.json({ error: 'Article id is required' }, 400);

    const body = await c.req.json();
    const { listId } = body || {};

    if (typeof listId !== 'string' || !listId.trim()) {
      return c.json({ error: 'List id is required' }, 400);
    }

    await addArticleToList(articleId, listId, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error adding article to list:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return c.json({ error: 'Unauthorized' }, 403);
      }
      if (error.message === 'Article not found' || error.message === 'List not found') {
        return c.json({ error: error.message }, 404);
      }
    }

    return c.json({ error: 'Failed to add article to list' }, 500);
  }
});

articles.delete('/:id/lists', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const articleId = c.req.param('id');
    if (!articleId) return c.json({ error: 'Article id is required' }, 400);

    const listId = c.req.query('listId');
    if (!listId) return c.json({ error: 'List id is required' }, 400);

    await removeArticleFromList(articleId, listId, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing article from list:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return c.json({ error: 'Unauthorized' }, 403);
      }
      if (error.message === 'Article not found') {
        return c.json({ error: error.message }, 404);
      }
    }

    return c.json({ error: 'Failed to remove article from list' }, 500);
  }
});

articles.post('/:id/session-review', async (c) => {
  const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  const isOwner = await verifyArticleOwnership(id, userId);
  if (!isOwner) return c.json({ error: 'Not found or not authorized' }, 404);

  const article = await fetchArticleById(id, userId);
  if (!article) return c.json({ error: 'Article not found' }, 404);

  const notes = article.notes ?? [];
  if (notes.length === 0) return c.json({ error: 'No notes to review' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as {
    endpointUrl?: unknown;
    model?: unknown;
    apiKey?: unknown;
  };

  const endpointUrl = normalizeEndpointUrl(body.endpointUrl);
  const model = normalizeText(body.model, 180);
  const apiKey = normalizeApiKey(body.apiKey);

  try {
    const noteInputs = notes.map((n) => ({
      text: n.text,
      textPreview: n.anchor?.textPreview,
    }));

    const result = await generateText({
      model: getLanguageModel({
        binding: c.env.AI,
        endpointUrl,
        apiKey,
        model,
      }),
      system: SESSION_REVIEW_SYSTEM_PROMPT,
      prompt: buildSessionReviewPrompt(article.title, noteInputs),
      maxRetries: 1,
    });

    let parsed: {
      summary: string;
      keyThemes: string[];
      actionItems: string[];
      notesSummary: string;
    };
    try {
      const text = result.text.trim();
      const jsonMatch =
        text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || text.match(/(\{[\s\S]*\})/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    } catch {
      return c.json({ error: 'Failed to parse AI response' }, 500);
    }

    if (typeof parsed.summary !== 'string' || !parsed.summary) {
      return c.json({ error: 'Invalid review format from AI' }, 500);
    }

    const review: SessionReview = {
      generatedAt: new Date().toISOString(),
      summary: parsed.summary.trim().slice(0, 1000),
      keyThemes: Array.isArray(parsed.keyThemes)
        ? parsed.keyThemes
            .map((t) => String(t).trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems
            .map((a) => String(a).trim())
            .filter(Boolean)
            .slice(0, 10)
        : [],
      notesSummary:
        typeof parsed.notesSummary === 'string' ? parsed.notesSummary.trim().slice(0, 600) : '',
    };

    await updateArticle(id, userId, { sessionReview: review });

    return c.json({ review });
  } catch (error) {
    console.error('session-review: generation failed', error);
    return c.json({ error: 'Failed to generate review' }, 500);
  }
});

export default articles;
