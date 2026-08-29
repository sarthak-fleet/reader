import { describe, expect, it } from 'vitest';
import { isSpaRoute } from './spa-route';

describe('Reader SPA route boundary', () => {
  it.each([
    '/about',
    '/privacy',
    '/sample',
    '/library',
    '/login',
    '/reader/article-1',
    '/board',
    '/board/research-1',
    '/share/public-board',
    '/share/article/public-article',
    '/memory',
    '/rss',
    '/extension',
  ])('keeps %s on the application shell', (pathname) => {
    expect(isSpaRoute(pathname)).toBe(true);
  });

  it.each([
    '/',
    '/faq',
    '/changelog',
    '/developer-portal',
    '/.well-known/mcp.json',
    '/oauth2/authorize',
    '/api',
    '/unknown',
  ])('does not disguise %s as an application route', (pathname) => {
    expect(isSpaRoute(pathname)).toBe(false);
  });
});
