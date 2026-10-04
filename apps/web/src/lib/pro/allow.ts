/** The cabinet proxy's allowlist: which `/v1/pro/*` calls the browser may make, and how each
 * one's body and answer are handled. Anything not listed here never reaches the jobs worker. */

export type ProxyKind = 'json' | 'pdf' | 'image' | 'image-upload';

export interface ProxyMatch {
  /** The jobs path below `/v1/pro/`, rebuilt only from checked segments. */
  path: string;
  kind: ProxyKind;
}

type Methods = Partial<Record<'GET' | 'POST' | 'PUT' | 'DELETE', ProxyKind>>;

/** `:id` stands for one id segment; every other segment must match literally. */
const ROUTES: [pattern: string, methods: Methods][] = [
  ['clients', { GET: 'json', POST: 'json' }],
  ['clients/:id', { GET: 'json', DELETE: 'json' }],
  ['readings', { GET: 'json', POST: 'json' }],
  ['readings/:id', { GET: 'json' }],
  ['readings/:id/sections/:id/regenerate', { POST: 'json' }],
  ['readings/:id/sections/:id/report', { POST: 'json' }],
  ['readings/:id/pdf', { GET: 'pdf', POST: 'json' }],
  ['demo', { GET: 'json' }],
  ['brand', { GET: 'json', PUT: 'json' }],
  ['brand/logo', { GET: 'image', PUT: 'image-upload', DELETE: 'json' }],
  ['brand/photo', { GET: 'image', PUT: 'image-upload', DELETE: 'json' }],
  ['purchases', { GET: 'json', POST: 'json' }],
  ['me', { GET: 'json' }],
  ['invite', { POST: 'json' }],
];

const PATTERNS = ROUTES.map(([pattern, methods]) => ({ parts: pattern.split('/'), methods }));

const ID = /^[A-Za-z0-9-]+$/;

/** A segment is usable only if it is non-empty, not `.`/`..`, and holds no slash either as
 * given or once decoded (a double-encoded `%252F` arrives as `%2F`). */
function clean(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return false;
  }
  return !/\/|%2f/i.test(segment) && !decoded.includes('/') && decoded === segment;
}

/** The allowlisted call for this method and path, or null. Ids are `[A-Za-z0-9-]+`. */
export function matchProxy(method: string, segments: readonly string[]): ProxyMatch | null {
  if (segments.length === 0 || !segments.every(clean)) return null;
  for (const { parts, methods } of PATTERNS) {
    if (parts.length !== segments.length) continue;
    const fits = parts.every((part, i) => {
      const segment = segments[i] as string;
      return part === ':id' ? ID.test(segment) : part === segment;
    });
    if (!fits) continue;
    const kind = Object.hasOwn(methods, method) ? methods[method as keyof Methods] : undefined;
    return kind ? { path: segments.join('/'), kind } : null;
  }
  return null;
}
