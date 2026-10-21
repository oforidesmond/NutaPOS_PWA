function stripSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readEnv(name: 'VITE_API_URL' | 'VITE_API_PREFIX'): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value : undefined;
}

/** Origin with no trailing slash. Empty when `VITE_API_URL` is unset. */
export function getApiBaseUrl(): string {
  return stripSlash(readEnv('VITE_API_URL') ?? '');
}

/** Leading-slash prefix. Defaults to `/api/v1`. */
export function getApiPrefix(): string {
  const raw = readEnv('VITE_API_PREFIX') ?? '/api/v1';
  if (!raw) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/** Origin + prefix. Empty when the origin is unset. */
export function getApiV1BaseURL(): string {
  const base = getApiBaseUrl();
  const prefix = getApiPrefix();
  if (!base) return '';
  return `${stripSlash(base)}${prefix}`;
}

/** Path under the v1 API root. Use with an axios `baseURL` of `getApiV1BaseURL()`. */
export function buildApiPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Path on the API origin, outside `/api/v1`.
 * `GET /time` uses this, not `buildApiPath`.
 */
export function buildRootPath(path: string): string {
  const base = getApiBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalized;
  return `${base}${normalized}`;
}
