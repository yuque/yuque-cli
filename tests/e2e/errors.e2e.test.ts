import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureServer } from './fixture-server.js';
import { runYuque } from './run-cli.js';

let server: FixtureServer;
let host: string;

beforeEach(async () => {
  server = new FixtureServer();
  host = await server.start();
});

afterEach(async () => {
  await server.stop();
});

describe('exit-code contract end to end', () => {
  it('401 -> 3 with the token hint on stderr', async () => {
    server.route('GET', '/api/v2/user', { status: 401, body: { message: 'invalid token' } });
    const result = await runYuque(['user', 'info'], { host });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('token invalid or expired');
  });

  it('404 -> 4', async () => {
    server.route('GET', '/api/v2/repos/1/docs/none', {
      status: 404,
      body: { message: 'not found' },
    });
    const result = await runYuque(['doc', 'get', '1', 'none'], { host });
    expect(result.code).toBe(4);
  });

  it('missing token -> 3 without any request', async () => {
    const result = await runYuque(['user', 'info'], { host, token: null });
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('token is required');
    expect(server.requests).toHaveLength(0);
  });

  it('unknown command -> 2', async () => {
    const result = await runYuque(['definitely-not-a-command'], { host });
    expect(result.code).toBe(2);
  });

  it('invalid --timeout -> 2 without any request', async () => {
    const result = await runYuque(['ping', '--timeout', 'banana'], { host });
    expect(result.code).toBe(2);
    expect(server.requests).toHaveLength(0);
  });
});

describe('retry semantics through the real binary', () => {
  it('GET retries a 429 (with Retry-After) and then succeeds', async () => {
    server.route('GET', '/api/v2/hello', (_request, hit) =>
      hit === 1
        ? { status: 429, body: { message: 'rate limited' }, headers: { 'Retry-After': '1' } }
        : { body: { data: { message: 'pong' } } }
    );
    const result = await runYuque(['ping'], { host });
    expect(result.code).toBe(0);
    expect(server.requestsFor('GET', '/api/v2/hello')).toHaveLength(2);
  });

  it('a POST that fails with 502 is not replayed (single request, exit 1)', async () => {
    server.route('POST', '/api/v2/users/me/repos', {
      status: 502,
      body: { message: 'bad gateway' },
    });
    const result = await runYuque(['repo', 'create', 'me', '--name', 'n', '--slug', 's'], { host });
    expect(result.code).toBe(1);
    expect(server.requestsFor('POST', '/api/v2/users/me/repos')).toHaveLength(1);
  });

  it('rate-limit exhaustion surfaces exit 5', async () => {
    server.route('GET', '/api/v2/hello', {
      status: 429,
      body: { message: 'rate limited' },
      headers: { 'Retry-After': '1' },
    });
    const result = await runYuque(['ping'], { host });
    expect(result.code).toBe(5);
    // 1 initial attempt + 3 retries (default maxRetries)
    expect(server.requestsFor('GET', '/api/v2/hello')).toHaveLength(4);
  });
});
