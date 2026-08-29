const EXACT_SPA_ROUTES = new Set([
  '/about',
  '/privacy',
  '/welcome',
  '/sample',
  '/library',
  '/login',
  '/board',
  '/memory',
  '/rss',
  '/extension',
]);

const PARAMETERIZED_SPA_ROUTES = [
  /^\/reader\/[^/]+$/,
  /^\/board\/[^/]+$/,
  /^\/share\/[^/]+$/,
  /^\/share\/article\/[^/]+$/,
];

export function isSpaRoute(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (
    EXACT_SPA_ROUTES.has(normalized) ||
    PARAMETERIZED_SPA_ROUTES.some((pattern) => pattern.test(normalized))
  );
}
