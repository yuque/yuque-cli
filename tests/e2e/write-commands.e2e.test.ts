import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('repo writes', () => {
  it('repo create posts the spec body fields', async () => {
    server.route('POST', '/api/v2/users/me/repos', {
      body: { data: { id: 1, slug: 'notes', namespace: 'me/notes', name: '笔记' } },
    });
    const result = await runYuque(
      [
        'repo',
        'create',
        'me',
        '--name',
        '笔记',
        '--slug',
        'notes',
        '--public',
        '0',
        '--enhanced-privacy',
      ],
      { host }
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Created repo me/notes');
    expect(server.requests[0].body).toEqual({
      name: '笔记',
      slug: 'notes',
      public: 0,
      enhancedPrivacy: true,
    });
  });

  it('repo create rejects an out-of-enum --public locally (exit 2, no request)', async () => {
    const result = await runYuque(
      ['repo', 'create', 'me', '--name', 'n', '--slug', 's', '--public', '3'],
      {
        host,
      }
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--public must be 0');
    expect(server.requests).toHaveLength(0);
  });

  it('repo delete requires --yes when stdin is not a TTY', async () => {
    const refused = await runYuque(['repo', 'delete', '42'], { host });
    expect(refused.code).toBe(2);
    expect(server.requests).toHaveLength(0);

    server.route('DELETE', '/api/v2/repos/42', {
      body: { data: { id: 42, slug: 'gone', namespace: 'me/gone' } },
    });
    const deleted = await runYuque(['repo', 'delete', '42', '--yes'], { host });
    expect(deleted.code).toBe(0);
    expect(deleted.stdout).toContain('Deleted repo me/gone');
  });
});

describe('doc writes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'yuque-e2e-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('doc create reads the body from --body-file', async () => {
    const draft = join(dir, 'draft.md');
    writeFileSync(draft, '# 周会\n\n内容\n');
    server.route('POST', '/api/v2/repos/me/notes/docs', {
      body: { data: { id: 7, slug: 'weekly', title: '周会' } },
    });
    const result = await runYuque(
      ['doc', 'create', 'me/notes', '--title', '周会', '--slug', 'weekly', '--body-file', draft],
      { host }
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Created doc me/notes/weekly');
    expect(server.requests[0].body).toEqual({
      title: '周会',
      slug: 'weekly',
      body: '# 周会\n\n内容\n',
    });
  });

  it('doc update puts only the provided fields', async () => {
    server.route('PUT', '/api/v2/repos/8/docs/7', {
      body: { data: { id: 7, slug: 'weekly', title: '改名' } },
    });
    const result = await runYuque(['doc', 'update', '8', '7', '--title', '改名'], { host });
    expect(result.code).toBe(0);
    expect(server.requests[0].body).toEqual({ title: '改名' });
  });

  it('doc delete --yes sends the DELETE', async () => {
    server.route('DELETE', '/api/v2/repos/8/docs/7', {
      body: { data: { id: 7, slug: 'weekly', title: 'Weekly' } },
    });
    const result = await runYuque(['doc', 'delete', '8', '7', '--yes'], { host });
    expect(result.code).toBe(0);
    expect(server.requestsFor('DELETE', '/api/v2/repos/8/docs/7')).toHaveLength(1);
  });
});

describe('toc & group writes', () => {
  it('toc update moves a node (append + --node-uuid, no --type needed)', async () => {
    server.route('PUT', '/api/v2/repos/9/toc', { body: { data: [{ uuid: 'n' }] } });
    const result = await runYuque(
      ['toc', 'update', '9', '--action', 'appendNode', '--node-uuid', 'n', '--target-uuid', 't'],
      { host }
    );
    expect(result.code).toBe(0);
    expect(server.requests[0].body).toEqual({
      action: 'appendNode',
      target_uuid: 't',
      node_uuid: 'n',
    });
  });

  it('toc update editNode without --node-uuid fails locally', async () => {
    const result = await runYuque(['toc', 'update', '9', '--action', 'editNode', '--title', 'x'], {
      host,
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--node-uuid is required');
    expect(server.requests).toHaveLength(0);
  });

  it('group member set puts the role and remove requires --yes', async () => {
    server.route('PUT', '/api/v2/groups/eng/users/bob', {
      body: { data: { id: 1, role: 1, user: { login: 'bob', name: 'Bob' } } },
    });
    const set = await runYuque(['group', 'member', 'set', 'eng', 'bob', '--role', '1'], { host });
    expect(set.code).toBe(0);
    expect(server.requests[0].body).toEqual({ role: 1 });

    const refused = await runYuque(['group', 'member', 'remove', 'eng', 'bob'], { host });
    expect(refused.code).toBe(2);
    expect(server.requestsFor('DELETE', '/api/v2/groups/eng/users/bob')).toHaveLength(0);
  });
});
