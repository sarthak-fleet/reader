import { generateText, streamText } from 'ai';
import { Hono } from 'hono';

import { getLanguageModel } from '../../lib/ai-cloudflare';
import { isLocalCLIEnabled } from '../../lib/ai-config';
import {
  createLocalAITextStream,
  DEFAULT_SYSTEM_PROMPT,
  MAX_SYSTEM_PROMPT_LENGTH,
  normalizeApiKey,
  normalizeChatMessages,
  normalizeEndpointUrl,
  normalizeText,
  TEXT_STREAM_HEADERS,
  toSDKMessages,
} from '../../lib/ai-server';
import { fetchModels } from '../../lib/ai-vendor';
import { getAuthenticatedUserId } from '../../lib/auth-api';
import type { WorkerEnv } from '../../lib/worker-env';
import type { SummaryLength } from '../../types';

const SUMMARY_LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  short: 'Provide a brief 2-3 sentence summary.',
  medium: 'Provide a comprehensive 4-6 sentence summary.',
  long: 'Provide a detailed 8-10 sentence summary covering all major points.',
};

const SUMMARY_SYSTEM_PROMPT = `You are an expert at analyzing and summarizing articles. Your task is to:
1. Create a clear, concise summary that captures the main ideas and key insights
2. Extract 3-5 key points as bullet points that represent the most important takeaways
3. Maintain objectivity and accuracy

Format your response as JSON with this structure:
{
  "summary": "The summary text here...",
  "keyPoints": ["First key point", "Second key point", "Third key point"]
}`;

const ai = new Hono<{ Bindings: WorkerEnv }>();

ai.post('/chat', async (c) => {
  const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    endpointUrl?: unknown;
    model?: unknown;
    apiKey?: unknown;
    systemPrompt?: unknown;
    messages?: unknown;
    local?: unknown;
  };

  const endpointUrl = normalizeEndpointUrl(body.endpointUrl);
  const model = normalizeText(body.model, 180);
  const apiKey = normalizeApiKey(body.apiKey);
  const systemPrompt =
    normalizeText(body.systemPrompt, MAX_SYSTEM_PROMPT_LENGTH) || DEFAULT_SYSTEM_PROMPT;
  const messages = normalizeChatMessages(body.messages);
  const isLocal = body.local === true;

  if (messages.length === 0) {
    return c.json({ error: 'At least one message is required' }, 400);
  }

  if (isLocal) {
    if (!isLocalCLIEnabled()) {
      return c.json(
        { error: 'Local AI is available only in development environments.' },
        { status: 400 }
      );
    }

    try {
      const stream = await createLocalAITextStream({ model, messages, systemPrompt });
      return new Response(stream, { headers: TEXT_STREAM_HEADERS });
    } catch (error) {
      console.error('Local AI chat request failed:', error);
      return c.json(
        { error: error instanceof Error ? error.message : 'Failed to stream local AI response' },
        500
      );
    }
  }

  if (!model) {
    return c.json({ error: 'Model is required' }, 400);
  }

  try {
    const result = streamText({
      model: getLanguageModel({
        binding: c.env.AI,
        endpointUrl,
        apiKey,
        model,
      }),
      system: systemPrompt,
      messages: toSDKMessages(messages),
      maxRetries: 0,
    });

    return result.toTextStreamResponse({
      headers: TEXT_STREAM_HEADERS,
    });
  } catch (error) {
    console.error('AI chat request failed:', error);
    return c.json({ error: 'Failed to stream AI response' }, 500);
  }
});

ai.post('/summarize', async (c) => {
  const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    endpointUrl?: unknown;
    model?: unknown;
    apiKey?: unknown;
    articleContent?: unknown;
    articleTitle?: unknown;
    summaryLength?: unknown;
    local?: unknown;
  };

  const endpointUrl = normalizeEndpointUrl(body.endpointUrl);
  const model = normalizeText(body.model, 180);
  const apiKey = normalizeApiKey(body.apiKey);
  const articleContent = normalizeText(body.articleContent, 100_000);
  const articleTitle = normalizeText(body.articleTitle, 500);
  const isLocal = body.local === true;
  const summaryLength = (
    body.summaryLength === 'short' ||
    body.summaryLength === 'medium' ||
    body.summaryLength === 'long'
      ? body.summaryLength
      : 'medium'
  ) as SummaryLength;

  if (!articleContent) {
    return c.json({ error: 'Article content is required' }, 400);
  }

  if (isLocal) {
    if (!isLocalCLIEnabled()) {
      return c.json(
        { error: 'Local AI is available only in development environments.' },
        { status: 400 }
      );
    }
    return c.json({ error: 'Local AI is not supported for summary generation.' }, 400);
  }

  if (!model) {
    return c.json({ error: 'Model is required' }, 400);
  }

  try {
    const lengthInstruction = SUMMARY_LENGTH_INSTRUCTIONS[summaryLength];
    const userPrompt = `Please analyze and summarize the following article${articleTitle ? ` titled "${articleTitle}"` : ''}:

${articleContent}

${lengthInstruction}

Remember to respond with valid JSON in the exact format specified.`;

    const result = await generateText({
      model: getLanguageModel({
        binding: c.env.AI,
        endpointUrl,
        apiKey,
        model,
      }),
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxRetries: 1,
    });

    let parsedResponse: { summary: string; keyPoints: string[] };
    try {
      const text = result.text.trim();
      const jsonMatch =
        text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || text.match(/(\{[\s\S]*\})/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;
      parsedResponse = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      parsedResponse = {
        summary: result.text,
        keyPoints: [],
      };
    }

    if (!parsedResponse.summary || typeof parsedResponse.summary !== 'string') {
      throw new Error('Invalid summary format from AI');
    }

    if (!Array.isArray(parsedResponse.keyPoints)) {
      parsedResponse.keyPoints = [];
    }

    parsedResponse.keyPoints = parsedResponse.keyPoints.slice(0, 5);

    return c.json({
      summary: parsedResponse.summary,
      keyPoints: parsedResponse.keyPoints,
    });
  } catch (error) {
    console.error('AI summary generation failed:', error);
    return c.json({ error: 'Failed to generate summary' }, 500);
  }
});

ai.post('/models', async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c.req.raw.headers, c.env);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = (await c.req.json().catch(() => ({}))) as {
      endpointUrl?: unknown;
      apiKey?: unknown;
    };

    const endpointUrl = normalizeEndpointUrl(body.endpointUrl);
    const apiKey = normalizeApiKey(body.apiKey);

    if (!endpointUrl) {
      return c.json({ models: [], source: 'empty' });
    }

    const models = await fetchModels(endpointUrl, apiKey);

    return c.json({
      models: models.map((id) => ({ id })),
      source: models.length > 0 ? 'live' : 'empty',
    });
  } catch (error) {
    console.error('AI model discovery failed:', error);
    return c.json({ models: [], source: 'error' });
  }
});

export default ai;
