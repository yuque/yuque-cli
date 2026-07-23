/**
 * CLI-level errors carry the process exit code they should terminate with.
 *
 * Exit code contract (stable, scripts may rely on it):
 *   0 success · 1 API/unknown error · 2 usage error · 3 auth error · 4 not found · 5 rate limited
 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = 'UsageError';
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super(message, 3);
    this.name = 'AuthError';
  }
}

/** Error thrown for any failed Yuque API request, normalized from axios errors. */
export class YuqueError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'YuqueError';
  }
}

const STATUS_HINTS: Record<number, string> = {
  400: 'the request parameters were rejected by the Yuque API',
  401: 'token invalid or expired — set YUQUE_TOKEN or pass --token, see https://www.yuque.com/settings/tokens',
  403: 'the token does not have permission for this resource',
  404: 'the requested resource does not exist — check the id, namespace, or slug',
  410: 'the resource was permanently deleted or the endpoint is deprecated',
  429: 'rate limited by the Yuque API — wait a moment and retry',
};

export function statusHint(statusCode?: number): string | undefined {
  if (statusCode === undefined) return undefined;
  if (statusCode >= 500) return 'the Yuque API had a server-side error — retry later';
  return STATUS_HINTS[statusCode];
}

export function exitCodeForStatus(statusCode?: number): number {
  if (statusCode === 401 || statusCode === 403) return 3;
  if (statusCode === 404) return 4;
  if (statusCode === 429) return 5;
  return 1;
}
