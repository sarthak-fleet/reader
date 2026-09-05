import { describe, expect, it, vi } from 'vitest';

import { createPing } from './ping';

function fakeFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response('', { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('createPing', () => {
  it('is a silent no-op without an ingest key', async () => {
    const { fetchImpl, calls } = fakeFetch(202);
    const ping = createPing({ key: undefined, fetch: fetchImpl });
    expect(await ping('signup')).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('posts one LogBatchV1 per call with the bearer key and drops undefined props', async () => {
    const { fetchImpl, calls } = fakeFetch(202);
    const ping = createPing({
      key: 'ahk_test',
      environment: 'staging',
      url: 'https://ingest.test/v1/logs',
      fetch: fetchImpl,
    });
    expect(
      await ping('signup', { title: 'a@b.co', props: { plan: 'free', skip: undefined } })
    ).toBe(true);
    expect(calls[0].url).toBe('https://ingest.test/v1/logs');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer ahk_test');
    const body = JSON.parse(String(calls[0].init.body)) as {
      schema_version: string;
      environment: string;
      logs: { event: string; level: string; props: Record<string, unknown> }[];
    };
    expect(body.schema_version).toBe('v1');
    expect(body.environment).toBe('staging');
    expect(body.logs[0]).toMatchObject({ event: 'signup', level: 'info', props: { plan: 'free' } });
  });

  it('sets the level through the helpers and reports failures without throwing', async () => {
    const errors: unknown[] = [];
    const rejected = fakeFetch(401);
    const ping = createPing({
      key: 'ahk_test',
      fetch: rejected.fetchImpl,
      onError: (err) => errors.push(err),
    });
    expect(await ping.error('boom')).toBe(false);
    expect(JSON.parse(String(rejected.calls[0].init.body)).logs[0].level).toBe('error');
    const throwing = createPing({
      key: 'ahk_test',
      fetch: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      onError: (err) => errors.push(err),
    });
    expect(await throwing.warn('x')).toBe(false);
    expect(errors).toHaveLength(2);
  });
});
