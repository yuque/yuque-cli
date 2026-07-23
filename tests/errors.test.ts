import { describe, expect, it } from 'vitest';
import { AuthError, CliError, UsageError, exitCodeForStatus } from '../src/errors.js';

/**
 * Exit code contract (errors.ts): 0 success · 1 API/unknown error · 2 usage
 * error · 3 auth error · 4 not found · 5 rate limited. Scripts rely on this,
 * so the full status -> exit-code table is pinned here.
 */
describe('exitCodeForStatus', () => {
  it.each([
    [401, 3],
    [403, 3],
    [404, 4],
    [429, 5],
    [400, 1],
    [410, 1],
    [500, 1],
    [502, 1],
  ])('maps HTTP %i to exit code %i', (status, exitCode) => {
    expect(exitCodeForStatus(status)).toBe(exitCode);
  });

  it('maps a missing status code to the generic exit code 1', () => {
    expect(exitCodeForStatus(undefined)).toBe(1);
    expect(exitCodeForStatus()).toBe(1);
  });
});

describe('CliError exit codes', () => {
  it('defaults CliError to exit code 1', () => {
    expect(new CliError('boom').exitCode).toBe(1);
  });

  it('pins UsageError to exit code 2 and AuthError to exit code 3', () => {
    expect(new UsageError('bad flag').exitCode).toBe(2);
    expect(new AuthError('no token').exitCode).toBe(3);
  });
});
