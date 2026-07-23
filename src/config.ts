import { UsageError } from './errors.js';

export const DEFAULT_HOST = 'https://www.yuque.com';

/** Matches the yuque-mcp-server client default. */
export const DEFAULT_TIMEOUT_MS = 30000;

export const MISSING_TOKEN_MESSAGE =
  'A Yuque API token is required. Set the YUQUE_TOKEN (or YUQUE_PERSONAL_TOKEN) environment variable or pass --token=<token>. ' +
  'Create one at https://www.yuque.com/settings/tokens';

/** Flag wins over env so scripted one-off overrides behave like gh/glab. */
export function resolveToken(
  flagToken: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return flagToken || env.YUQUE_TOKEN || env.YUQUE_PERSONAL_TOKEN || undefined;
}

export function resolveHost(
  flagHost: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  return normalizeHost(flagHost || env.YUQUE_HOST || DEFAULT_HOST);
}

/** Request timeout in ms: --timeout flag > YUQUE_TIMEOUT_MS env > 30000 default. */
export function resolveTimeoutMs(
  flagTimeout: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = flagTimeout ?? env.YUQUE_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) === 0) {
    throw new UsageError(`Invalid timeout "${raw}" — expected a positive integer of milliseconds`);
  }
  return Number(raw);
}

/**
 * Normalize a host to a site root (no trailing slash, no /api/v2 suffix);
 * the HTTP client appends /api/v2 itself. Accepts bare domains and full API URLs.
 */
export function normalizeHost(input: string): string {
  let host = input.trim();
  if (host === '') return DEFAULT_HOST;
  if (!/^https?:\/\//i.test(host)) host = `https://${host}`;
  host = host.replace(/\/+$/, '');
  host = host.replace(/\/api\/v2$/, '');
  return host.replace(/\/+$/, '');
}
