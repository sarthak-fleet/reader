import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { createWorkersAI, type WorkersAISettings } from 'workers-ai-provider';

import type { AIConfig } from './ai-vendor';

type WorkersAiBinding = Extract<WorkersAISettings, { binding: unknown }>['binding'];

/**
 * Build a LanguageModel from an AIConfig, talking to any OpenAI-compatible
 * endpoint (formerly @saas-maker/ai's createAIModel).
 */
function createAIModel(
  config: AIConfig,
  options?: { headers?: Record<string, string>; name?: string }
): LanguageModel {
  const provider = createOpenAICompatible({
    baseURL: config.endpointUrl.trim().replace(/\/+$/, ''),
    apiKey: config.apiKey,
    name: options?.name ?? 'reader-direct',
    headers: options?.headers,
  });
  return provider.chatModel(config.model);
}

/** Default model when the project's direct endpoint is Workers AI. */
const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

interface CreateLanguageModelArgs {
  binding?: WorkersAiBinding;
  endpointUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

function getDirectBaseUrl(): string {
  const fromEnv = process.env.AI_BASE_URL?.trim();
  if (!fromEnv) throw new Error('AI_BASE_URL is required when no BYOK endpoint is supplied');
  return fromEnv.replace(/\/+$/, '');
}

function getDirectApiKey(): string {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) throw new Error('AI_API_KEY is required when no BYOK key is supplied');
  return apiKey;
}

/**
 * Returns a model for an explicit BYOK endpoint or the project's own direct
 * free-provider/local endpoint. No shared gateway fallback exists.
 */
export function getLanguageModel({
  binding,
  endpointUrl,
  apiKey,
  model,
  headers,
}: CreateLanguageModelArgs): LanguageModel {
  // Honour explicit BYO config first (settings UI etc.).
  if (endpointUrl && apiKey) {
    return createAIModel({ endpointUrl, apiKey, model } as AIConfig, { headers });
  }

  if (binding) {
    return createWorkersAI({ binding })(model || DEFAULT_WORKERS_AI_MODEL);
  }

  const resolvedModel = model || DEFAULT_WORKERS_AI_MODEL;

  return createAIModel(
    {
      endpointUrl: getDirectBaseUrl(),
      apiKey: getDirectApiKey(),
      model: resolvedModel,
    } as AIConfig,
    { headers }
  );
}
