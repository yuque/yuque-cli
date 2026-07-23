import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { runCli } from '../../src/cli.js';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    default: {
      ...actual.default,
      create: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

const mockedAxios = vi.mocked(axios, { partial: true });
const request = vi.fn();

let stdoutChunks: string[] = [];
let stderrChunks: string[] = [];
const stdoutText = () => stdoutChunks.join('');
const stderrText = () => stderrChunks.join('');

/** Pin isTTY to false so color codes and confirm prompts behave deterministically. */
function forceNonTty(stream: NodeJS.WriteStream | NodeJS.ReadStream): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(stream, 'isTTY');
  Object.defineProperty(stream, 'isTTY', { value: false, configurable: true });
  return () => {
    if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor);
    else delete (stream as { isTTY?: boolean }).isTTY;
  };
}

let restoreTty: Array<() => void> = [];

beforeEach(() => {
  request.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedAxios.create.mockReturnValue({ request } as any);
  vi.stubEnv('YUQUE_TOKEN', 'test-token');
  stdoutChunks = [];
  stderrChunks = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderrChunks.push(String(chunk));
    return true;
  });
  restoreTty = [forceNonTty(process.stdin), forceNonTty(process.stdout)];
});

afterEach(() => {
  restoreTty.forEach((restore) => restore());
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('toc get', () => {
  it('prints an indented tree with slug/url suffixes', async () => {
    request.mockResolvedValueOnce({
      data: {
        data: [
          { uuid: 'u1', type: 'TITLE', title: 'Guide', level: 0, depth: 1 },
          { uuid: 'u2', type: 'DOC', title: 'Intro', slug: 'intro', level: 1, depth: 2 },
          {
            uuid: 'u3',
            type: 'LINK',
            title: 'Homepage',
            url: 'https://example.com',
            level: 1,
            depth: 2,
          },
        ],
      },
    });
    const code = await runCli(['node', 'yuque', 'toc', 'get', 'yuque/help']);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/repos/yuque/help/toc',
      params: undefined,
      data: undefined,
    });
    expect(stdoutText()).toBe('Guide\n  Intro (intro)\n  Homepage (https://example.com)\n');
  });

  it('--json prints the full payload for a numeric repo id', async () => {
    const items = [{ uuid: 'u1', type: 'DOC', title: 'Intro', slug: 'intro', level: 0 }];
    request.mockResolvedValueOnce({ data: { data: items } });
    const code = await runCli(['node', 'yuque', 'toc', 'get', '123456', '--json']);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/repos/123456/toc',
      params: undefined,
      data: undefined,
    });
    expect(JSON.parse(stdoutText())).toEqual(items);
  });
});

describe('toc update', () => {
  it('appends DOC nodes with the spec body fields', async () => {
    request.mockResolvedValueOnce({ data: { data: [{ uuid: 'a' }, { uuid: 'b' }] } });
    const code = await runCli([
      'node',
      'yuque',
      'toc',
      'update',
      'yuque/help',
      '--action',
      'appendNode',
      '--action-mode',
      'child',
      '--target-uuid',
      'tu',
      '--type',
      'DOC',
      '--doc-ids',
      '11,22',
    ]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'put',
      url: '/repos/yuque/help/toc',
      params: undefined,
      data: {
        action: 'appendNode',
        action_mode: 'child',
        target_uuid: 'tu',
        type: 'DOC',
        doc_ids: [11, 22],
      },
    });
    expect(stdoutText()).toContain('✓ Toc updated (2 nodes)');
  });

  it('edits a node with title/url/open-window/visible flags', async () => {
    const items = [{ uuid: 'nu', type: 'LINK', title: 'Docs' }];
    request.mockResolvedValueOnce({ data: { data: items } });
    const code = await runCli([
      'node',
      'yuque',
      'toc',
      'update',
      '123',
      '--action',
      'editNode',
      '--node-uuid',
      'nu',
      '--type',
      'LINK',
      '--title',
      'Docs',
      '--url',
      'https://example.com',
      '--open-window',
      '1',
      '--visible',
      '0',
      '--json',
    ]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'put',
      url: '/repos/123/toc',
      params: undefined,
      data: {
        action: 'editNode',
        node_uuid: 'nu',
        type: 'LINK',
        title: 'Docs',
        url: 'https://example.com',
        open_window: 1,
        visible: 0,
      },
    });
    expect(JSON.parse(stdoutText())).toEqual(items);
  });

  it('rejects an --action outside the spec enum without calling the API', async () => {
    const code = await runCli(['node', 'yuque', 'toc', 'update', '123', '--action', 'explode']);
    expect(code).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });

  it('requires --action', async () => {
    const code = await runCli(['node', 'yuque', 'toc', 'update', '123']);
    expect(code).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('group members', () => {
  it('lists members with role filter and offset', async () => {
    request.mockResolvedValueOnce({
      data: {
        data: [
          { id: 1, role: 1, user: { id: 9, login: 'alice', name: 'Alice' } },
          { id: 2, role: 0, user: { id: 10, login: 'bob', name: 'Bob' } },
        ],
      },
    });
    const code = await runCli([
      'node',
      'yuque',
      'group',
      'members',
      'mygroup',
      '--role',
      '1',
      '--offset',
      '20',
    ]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'get',
      url: '/groups/mygroup/users',
      params: { role: 1, offset: 20 },
      data: undefined,
    });
    expect(stdoutText()).toBe('LOGIN  NAME   ROLE\nalice  Alice  member\nbob    Bob    admin\n');
  });

  it('--all drains pages of 100 and merges the results', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      role: 1,
      user: { id: i, login: `u${i}`, name: `User ${i}` },
    }));
    const page2 = [{ id: 100, role: 2, user: { id: 100, login: 'last', name: 'Last' } }];
    request
      .mockResolvedValueOnce({ data: { data: page1 } })
      .mockResolvedValueOnce({ data: { data: page2 } });
    const code = await runCli(['node', 'yuque', 'group', 'members', 'g', '--all', '--json']);
    expect(code).toBe(0);
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'get',
      url: '/groups/g/users',
      params: { offset: 0 },
      data: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'get',
      url: '/groups/g/users',
      params: { offset: 100 },
      data: undefined,
    });
    expect(JSON.parse(stdoutText())).toHaveLength(101);
  });
});

describe('group member set', () => {
  it('puts the role to /groups/{login}/users/{id}', async () => {
    request.mockResolvedValueOnce({
      data: { data: { id: 1, role: 0, user: { id: 9, login: 'alice', name: 'Alice' } } },
    });
    const code = await runCli([
      'node',
      'yuque',
      'group',
      'member',
      'set',
      'g',
      'alice',
      '--role',
      '0',
    ]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'put',
      url: '/groups/g/users/alice',
      params: undefined,
      data: { role: 0 },
    });
    expect(stdoutText()).toContain('✓ Set alice in group g to role admin');
  });

  it('requires --role', async () => {
    const code = await runCli(['node', 'yuque', 'group', 'member', 'set', 'g', 'alice']);
    expect(code).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('group member remove', () => {
  it('--yes skips the prompt and deletes the member', async () => {
    request.mockResolvedValueOnce({ data: { data: { user_id: '9' } } });
    const code = await runCli([
      'node',
      'yuque',
      'group',
      'member',
      'remove',
      'g',
      'alice',
      '--yes',
    ]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith({
      method: 'delete',
      url: '/groups/g/users/alice',
      params: undefined,
      data: undefined,
    });
    expect(stdoutText()).toContain('✓ Removed alice from group g');
  });

  it('refuses without --yes when stdin is not a TTY', async () => {
    const code = await runCli(['node', 'yuque', 'group', 'member', 'remove', 'g', 'alice']);
    expect(code).toBe(2);
    expect(request).not.toHaveBeenCalled();
    expect(stderrText()).toContain('--yes');
  });
});

describe('toc update cross-field validation (spec semantics)', () => {
  it('rejects editNode/removeNode without --node-uuid (exit 2, no request)', async () => {
    for (const action of ['editNode', 'removeNode']) {
      const code = await runCli(['node', 'yuque', 'toc', 'update', '1', '--action', action]);
      expect(code).toBe(2);
    }
    expect(stderrText()).toContain('--node-uuid is required');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects creating a node without --type', async () => {
    const code = await runCli(['node', 'yuque', 'toc', 'update', '1', '--action', 'appendNode']);
    expect(code).toBe(2);
    expect(stderrText()).toContain('--type is required');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects DOC creation without --doc-ids and LINK creation without --title/--url', async () => {
    const doc = await runCli([
      'node',
      'yuque',
      'toc',
      'update',
      '1',
      '--action',
      'appendNode',
      '--type',
      'DOC',
    ]);
    const link = await runCli([
      'node',
      'yuque',
      'toc',
      'update',
      '1',
      '--action',
      'prependNode',
      '--type',
      'LINK',
      '--title',
      't',
    ]);
    expect(doc).toBe(2);
    expect(link).toBe(2);
    expect(request).not.toHaveBeenCalled();
  });

  it('allows a move: appendNode with --node-uuid and no --type', async () => {
    request.mockResolvedValueOnce({ data: { data: [{ uuid: 'nu' }] } });
    const code = await runCli([
      'node',
      'yuque',
      'toc',
      'update',
      '1',
      '--action',
      'appendNode',
      '--node-uuid',
      'nu',
      '--target-uuid',
      'tu',
    ]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { action: 'appendNode', target_uuid: 'tu', node_uuid: 'nu' },
      })
    );
  });
});
