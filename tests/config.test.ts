import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOST,
  MISSING_TOKEN_MESSAGE,
  resolveTimeoutMs,
  normalizeHost,
  resolveHost,
  resolveToken,
} from '../src/config.js';
import { UsageError } from '../src/errors.js';

describe('resolveToken', () => {
  it('prefers the flag over env vars', () => {
    expect(resolveToken('flag-token', { YUQUE_TOKEN: 'env-token' })).toBe('flag-token');
  });

  it('falls back to YUQUE_TOKEN then YUQUE_PERSONAL_TOKEN', () => {
    expect(resolveToken(undefined, { YUQUE_TOKEN: 'a', YUQUE_PERSONAL_TOKEN: 'b' })).toBe('a');
    expect(resolveToken(undefined, { YUQUE_PERSONAL_TOKEN: 'b' })).toBe('b');
  });

  it('returns undefined when nothing is set', () => {
    expect(resolveToken(undefined, {})).toBeUndefined();
  });
});

describe('MISSING_TOKEN_MESSAGE', () => {
  it('documents every way resolveToken accepts a token', () => {
    expect(MISSING_TOKEN_MESSAGE).toContain('YUQUE_TOKEN');
    expect(MISSING_TOKEN_MESSAGE).toContain('YUQUE_PERSONAL_TOKEN');
    expect(MISSING_TOKEN_MESSAGE).toContain('--token');
  });

  it('keeps the prefix the README troubleshooting table keys on', () => {
    expect(MISSING_TOKEN_MESSAGE.startsWith('A Yuque API token is required')).toBe(true);
  });
});

describe('resolveHost / normalizeHost', () => {
  it('defaults to www.yuque.com', () => {
    expect(resolveHost(undefined, {})).toBe(DEFAULT_HOST);
  });

  it('prefers the flag over YUQUE_HOST', () => {
    expect(resolveHost('https://a.yuque.com', { YUQUE_HOST: 'https://b.yuque.com' })).toBe(
      'https://a.yuque.com'
    );
  });

  it('adds https:// to bare domains', () => {
    expect(normalizeHost('space.yuque.com')).toBe('https://space.yuque.com');
  });

  it('strips trailing slashes and an /api/v2 suffix', () => {
    expect(normalizeHost('https://space.yuque.com/')).toBe('https://space.yuque.com');
    expect(normalizeHost('https://space.yuque.com/api/v2')).toBe('https://space.yuque.com');
    expect(normalizeHost('https://space.yuque.com/api/v2/')).toBe('https://space.yuque.com');
  });

  it('keeps http:// for private deployments', () => {
    expect(normalizeHost('http://yuque.internal:8080/')).toBe('http://yuque.internal:8080');
  });
});

describe('resolveTimeoutMs', () => {
  it('defaults to 30000', () => {
    expect(resolveTimeoutMs(undefined, {})).toBe(30000);
  });

  it('prefers the flag over YUQUE_TIMEOUT_MS', () => {
    expect(resolveTimeoutMs('5000', { YUQUE_TIMEOUT_MS: '60000' })).toBe(5000);
    expect(resolveTimeoutMs(undefined, { YUQUE_TIMEOUT_MS: '60000' })).toBe(60000);
  });

  it('rejects non-positive or non-numeric values as usage errors', () => {
    expect(() => resolveTimeoutMs('0', {})).toThrow(UsageError);
    expect(() => resolveTimeoutMs('abc', {})).toThrow(UsageError);
    expect(() => resolveTimeoutMs(undefined, { YUQUE_TIMEOUT_MS: '-1' })).toThrow(UsageError);
  });
});
