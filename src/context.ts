import type { Command } from 'commander';
import { AuthError } from './errors.js';
import { MISSING_TOKEN_MESSAGE, resolveHost, resolveTimeoutMs, resolveToken } from './config.js';
import { YuqueHttp } from './client/http.js';

export interface CommandContext {
  http: YuqueHttp;
  json: boolean;
}

/**
 * Build the per-invocation context from global options (--token/--host/--json
 * merged with env). Call from inside command actions only, so `yuque --help`
 * never demands a token.
 */
export function getContext(command: Command): CommandContext {
  const options = command.optsWithGlobals<{
    token?: string;
    host?: string;
    json?: boolean;
    timeout?: string;
  }>();
  const token = resolveToken(options.token);
  if (!token) throw new AuthError(MISSING_TOKEN_MESSAGE);
  return {
    http: new YuqueHttp({
      token,
      host: resolveHost(options.host),
      timeoutMs: resolveTimeoutMs(options.timeout),
    }),
    json: Boolean(options.json),
  };
}
