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

function argv(...args: string[]): string[] {
  return ['node', 'yuque', ...args];
}

/** Axios response wrapping the Yuque `{ data: ... }` envelope. */
function envelope(data: unknown) {
  return { data: { data } };
}

const BOOK = {
  id: 42,
  type: 'Book',
  slug: 'help',
  name: '帮助中心',
  namespace: 'yuque/help',
  items_count: 12,
  public: 1,
  description: 'Product docs',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2025-06-01T00:00:00.000Z',
  _extra: 'kept in --json output',
};

describe('repo commands', () => {
  const request = vi.fn();
  let stdoutChunks: string[] = [];
  let stderrChunks: string[] = [];
  const stdoutText = () => stdoutChunks.join('');
  const stderrText = () => stderrChunks.join('');

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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('repo list', () => {
    it('lists user repos and prints a table', async () => {
      request.mockResolvedValueOnce(envelope([BOOK]));
      await expect(runCli(argv('repo', 'list', 'yuque'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/users/yuque/repos',
        params: {},
        data: undefined,
      });
      expect(stdoutText()).toContain('NAMESPACE');
      expect(stdoutText()).toContain('yuque/help');
      expect(stdoutText()).toContain('帮助中心');
    });

    it('lists group repos with filter and pagination params', async () => {
      request.mockResolvedValueOnce(envelope([]));
      const args = ['repo', 'list', 'mygroup', '--group'];
      args.push('--type', 'Book', '--offset', '10', '--limit', '20');
      await expect(runCli(argv(...args))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/groups/mygroup/repos',
        params: { offset: 10, limit: 20, type: 'Book' },
        data: undefined,
      });
    });

    it('treats --type all as no server-side filter', async () => {
      request.mockResolvedValueOnce(envelope([]));
      await expect(runCli(argv('repo', 'list', 'yuque', '--type', 'all'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ params: {} }));
    });

    it('drains every page with --all', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        ...BOOK,
        id: i,
        namespace: `yuque/r${i}`,
      }));
      request.mockResolvedValueOnce(envelope(fullPage)).mockResolvedValueOnce(envelope([BOOK]));
      await expect(runCli(argv('repo', 'list', 'yuque', '--all', '--json'))).resolves.toBe(0);
      expect(request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ url: '/users/yuque/repos', params: { offset: 0, limit: 100 } })
      );
      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ params: { offset: 100, limit: 100 } })
      );
      expect(JSON.parse(stdoutText())).toHaveLength(101);
    });

    it('rejects an unknown --type', async () => {
      await expect(runCli(argv('repo', 'list', 'yuque', '--type', 'Wiki'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('--type');
    });

    it('rejects a non-numeric --offset', async () => {
      await expect(runCli(argv('repo', 'list', 'yuque', '--offset', 'abc'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('repo get', () => {
    it('gets a repo by id and prints the full payload with --json', async () => {
      request.mockResolvedValueOnce(envelope(BOOK));
      await expect(runCli(argv('repo', 'get', '42', '--json'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/repos/42',
        params: undefined,
        data: undefined,
      });
      expect(JSON.parse(stdoutText())).toEqual(BOOK);
    });

    it('gets a repo by namespace and prints a record', async () => {
      request.mockResolvedValueOnce(envelope(BOOK));
      await expect(runCli(argv('repo', 'get', 'yuque/help'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/repos/yuque/help' }));
      expect(stdoutText()).toContain('帮助中心');
      expect(stdoutText()).not.toContain('_extra');
    });

    it('rejects a malformed repo reference', async () => {
      await expect(runCli(argv('repo', 'get', 'not-a-ref'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('repo create', () => {
    it('creates a user repo with name and slug', async () => {
      request.mockResolvedValueOnce(envelope(BOOK));
      const args = ['repo', 'create', 'yuque', '--name', '帮助中心', '--slug', 'help'];
      await expect(runCli(argv(...args))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'post',
        url: '/users/yuque/repos',
        params: undefined,
        data: { name: '帮助中心', slug: 'help' },
      });
      expect(stdoutText()).toContain('Created repo yuque/help');
    });

    it('creates a group repo with all optional fields', async () => {
      request.mockResolvedValueOnce(envelope(BOOK));
      const args = ['repo', 'create', 'mygroup', '--group', '--name', 'Docs', '--slug', 'docs'];
      args.push('--description', 'd', '--public', '2', '--enhanced-privacy', '--json');
      await expect(runCli(argv(...args))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'post',
        url: '/groups/mygroup/repos',
        params: undefined,
        data: { name: 'Docs', slug: 'docs', description: 'd', public: 2, enhancedPrivacy: true },
      });
      expect(JSON.parse(stdoutText())).toEqual(BOOK);
    });

    it('rejects a --limit above the spec cap on repo list', async () => {
      const args = ['repo', 'list', 'yuque', '--limit', '101'];
      await expect(runCli(argv(...args))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });

    it('passes --filter-by-ability through to the query', async () => {
      request.mockResolvedValueOnce(envelope([BOOK]));
      const args = ['repo', 'list', 'yuque', '--filter-by-ability', 'create_doc', '--json'];
      await expect(runCli(argv(...args))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/users/yuque/repos',
        params: { filterByAbility: 'create_doc' },
        data: undefined,
      });
    });
  });

  describe('repo update', () => {
    it('sends only the provided fields', async () => {
      request.mockResolvedValueOnce(envelope(BOOK));
      const args = ['repo', 'update', '42', '--name', 'New name', '--public', '0'];
      await expect(runCli(argv(...args))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'put',
        url: '/repos/42',
        params: undefined,
        data: { name: 'New name', public: 0 },
      });
      expect(stdoutText()).toContain('Updated repo yuque/help');
    });

    it('rejects an update with no fields', async () => {
      await expect(runCli(argv('repo', 'update', '42'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('Nothing to update');
    });
  });

  describe('repo delete', () => {
    it('deletes with --yes without prompting', async () => {
      request.mockResolvedValueOnce(envelope(BOOK));
      await expect(runCli(argv('repo', 'delete', 'yuque/help', '--yes'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'delete',
        url: '/repos/yuque/help',
        params: undefined,
        data: undefined,
      });
      expect(stdoutText()).toContain('Deleted repo yuque/help');
    });

    it('refuses without --yes when stdin is not a TTY', async () => {
      const originalIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;
      try {
        await expect(runCli(argv('repo', 'delete', 'yuque/help'))).resolves.toBe(2);
      } finally {
        process.stdin.isTTY = originalIsTTY;
      }
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('--yes');
    });
  });
});
