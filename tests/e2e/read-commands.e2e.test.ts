import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixtureServer } from './fixture-server.js';
import { runYuque } from './run-cli.js';

/**
 * Functional tests: the built dist/bin.js binary against a mock Yuque API.
 * These verify the full chain — argv parsing, config resolution, HTTP wire
 * format (paths/query/headers), rendering, and exit codes — with no mocks
 * inside the process under test.
 */

let server: FixtureServer;
let host: string;

beforeEach(async () => {
  server = new FixtureServer();
  host = await server.start();
});

afterEach(async () => {
  await server.stop();
});

describe('auth & user', () => {
  it('ping hits /hello with the token header and exits 0', async () => {
    server.route('GET', '/api/v2/hello', { body: { data: { message: 'Hello e2e-user' } } });
    const result = await runYuque(['ping'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Hello e2e-user');
    expect(server.requests[0].headers['x-auth-token']).toBe('e2e-test-token');
  });

  it('auth status reports the signed-in identity', async () => {
    server.route('GET', '/api/v2/user', {
      body: { data: { id: 1, login: 'tester', name: '测试员' } },
    });
    const result = await runYuque(['auth', 'status'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('测试员');
    expect(result.stdout).toContain('@tester');
  });

  it('user info --json prints the full payload', async () => {
    const user = { id: 1, login: 'tester', name: 'Tester', followers_count: 42 };
    server.route('GET', '/api/v2/user', { body: { data: user } });
    const result = await runYuque(['user', 'info', '--json'], { host });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(user);
  });

  it('user groups lists groups with the role filter in the query', async () => {
    server.route('GET', '/api/v2/users/testers/groups', {
      body: { data: [{ id: 9, login: 'eng', name: 'Engineering', members_count: 8 }] },
    });
    const result = await runYuque(['user', 'groups', 'testers', '--role', '1'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Engineering');
    expect(server.requests[0].query).toEqual({ role: '1' });
  });
});

describe('search & repo', () => {
  it('search sends q/type and renders a table', async () => {
    server.route('GET', '/api/v2/search', {
      body: { data: [{ id: 1, type: 'doc', title: '灰度发布', url: '/x/y' }] },
    });
    const result = await runYuque(['search', '灰度发布', '--type', 'doc'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('灰度发布');
    expect(server.requests[0].query).toEqual({ q: '灰度发布', type: 'doc' });
  });

  it('repo list --group --all drains pages and prints a JSON array', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      slug: `r${i}`,
      name: `R${i}`,
    }));
    server.route('GET', '/api/v2/groups/eng/repos', (request) =>
      request.query.offset === '0'
        ? { body: { data: fullPage } }
        : { body: { data: [{ id: 100, slug: 'last', name: 'Last' }] } }
    );
    const result = await runYuque(['repo', 'list', 'eng', '--group', '--all', '--json'], { host });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveLength(101);
    const offsets = server
      .requestsFor('GET', '/api/v2/groups/eng/repos')
      .map((r) => r.query.offset);
    expect(offsets).toEqual(['0', '100']);
  });

  it('repo get resolves an owner/slug namespace to the namespace path', async () => {
    server.route('GET', '/api/v2/repos/yuque/help', {
      body: { data: { id: 42, name: '帮助中心', namespace: 'yuque/help', slug: 'help' } },
    });
    const result = await runYuque(['repo', 'get', 'yuque/help'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('帮助中心');
  });
});

describe('doc reading', () => {
  it('doc get prints the markdown body verbatim for piping', async () => {
    server.route('GET', '/api/v2/repos/yuque/help/docs/intro', {
      body: {
        data: { id: 7, slug: 'intro', title: 'Intro', format: 'markdown', body: '# Hi\n\nBody.\n' },
      },
    });
    const result = await runYuque(['doc', 'get', 'yuque/help', 'intro'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('# Hi\n\nBody.\n');
    expect(result.stderr).toBe('');
  });

  it('doc get renders sheet docs from body_sheet when body is empty', async () => {
    server.route('GET', '/api/v2/repos/docs/123', {
      body: {
        data: {
          id: 123,
          slug: 's',
          title: 'Sheet',
          format: 'sheet',
          body: '',
          body_sheet: '{"rows":[1]}',
        },
      },
    });
    const result = await runYuque(['doc', 'get', '123'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('{"rows":[1]}\n');
  });

  it('doc get warns on stderr when no content field is renderable', async () => {
    server.route('GET', '/api/v2/repos/docs/124', {
      body: { data: { id: 124, slug: 'b', title: 'Board', format: 'board' } },
    });
    const result = await runYuque(['doc', 'get', '124'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('no renderable body');
  });

  it('doc list forwards the spec query filters', async () => {
    server.route('GET', '/api/v2/repos/8/docs', { body: { data: [] } });
    const result = await runYuque(
      ['doc', 'list', '8', '--deleted', '--changed-at-gte', '2026-01-01T00:00:00Z', '--limit', '5'],
      { host }
    );
    expect(result.code).toBe(0);
    expect(server.requests[0].query).toEqual({
      deleted: 'true',
      changed_at_gte: '2026-01-01T00:00:00Z',
      limit: '5',
    });
  });

  it('doc version prints body_md', async () => {
    server.route('GET', '/api/v2/doc_versions/55', {
      body: { data: { id: 55, doc_id: 7, title: 'v2', body_md: 'old text\n' } },
    });
    const result = await runYuque(['doc', 'version', '55'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('old text\n');
  });
});

describe('toc & stats', () => {
  it('toc get renders an indented tree', async () => {
    server.route('GET', '/api/v2/repos/9/toc', {
      body: {
        data: [
          { uuid: 'a', type: 'TITLE', title: 'Part 1', level: 0 },
          { uuid: 'b', type: 'DOC', title: 'Chapter', slug: 'ch1', level: 1 },
        ],
      },
    });
    const result = await runYuque(['toc', 'get', '9'], { host });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Part 1\n  Chapter (ch1)');
  });

  it('stats members --json preserves rows and total', async () => {
    server.route('GET', '/api/v2/groups/eng/statistics/members', {
      body: { data: { members: [{ user_id: 1, read_count: 5 }], total: 1 } },
    });
    const result = await runYuque(['stats', 'members', 'eng', '--json'], { host });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      members: [{ user_id: 1, read_count: 5 }],
      total: 1,
    });
  });
});
