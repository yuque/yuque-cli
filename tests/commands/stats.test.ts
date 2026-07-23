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

function envelope(data: unknown) {
  return { data: { data } };
}

function run(...args: string[]): Promise<number> {
  return runCli(['node', 'yuque', ...args]);
}

describe('stats commands', () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    request.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAxios.create.mockReturnValue({ request } as any);
    vi.stubEnv('YUQUE_TOKEN', 'test-token');
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  function stdoutText(): string {
    return stdout.mock.calls.map((call) => String(call[0])).join('');
  }

  function stderrText(): string {
    return stderr.mock.calls.map((call) => String(call[0])).join('');
  }

  describe('stats group', () => {
    const groupStats = {
      bizdate: '20260721',
      member_count: 12,
      doc_count: 340,
      book_count: 9,
      write_count: 1500,
      read_count: 98765,
      comment_count: 42,
    };

    it('GETs /groups/{login}/statistics and prints a record', async () => {
      request.mockResolvedValueOnce(envelope(groupStats));
      const code = await run('stats', 'group', 'mygroup');
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/groups/mygroup/statistics',
        params: undefined,
        data: undefined,
      });
      const out = stdoutText();
      expect(out).toContain('member_count');
      expect(out).toContain('12');
      expect(out).toContain('98765');
    });

    it('--json prints the full payload', async () => {
      request.mockResolvedValueOnce(envelope(groupStats));
      const code = await run('stats', 'group', 'mygroup', '--json');
      expect(code).toBe(0);
      expect(JSON.parse(stdoutText())).toEqual(groupStats);
    });

    it('URL-encodes the login', async () => {
      request.mockResolvedValueOnce(envelope(groupStats));
      await run('stats', 'group', 'my group');
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/groups/my%20group/statistics' })
      );
    });
  });

  describe('stats members', () => {
    const membersPage = {
      members: [
        { user_id: 1, write_doc_count: 3, write_count: 10, read_count: 200, user: { name: 'Ann' } },
        { user_id: 2, write_doc_count: 1, write_count: 4, read_count: 50, user: { name: 'Bob' } },
      ],
      total: 2,
    };

    it('GETs /statistics/members with spec query params from flags', async () => {
      request.mockResolvedValueOnce(envelope(membersPage));
      const code = await run(
        'stats',
        'members',
        'mygroup',
        '--name',
        'ann',
        '--range',
        '30',
        '--page',
        '2',
        '--limit',
        '5',
        '--sort-field',
        'read_count',
        '--sort-order',
        'asc'
      );
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/groups/mygroup/statistics/members',
        params: {
          name: 'ann',
          range: 30,
          page: 2,
          limit: 5,
          sortField: 'read_count',
          sortOrder: 'asc',
        },
        data: undefined,
      });
      const out = stdoutText();
      expect(out).toContain('NAME');
      expect(out).toContain('Ann');
      expect(out).toContain('Bob');
    });

    it('omits unset optional filters from the query', async () => {
      request.mockResolvedValueOnce(envelope(membersPage));
      await run('stats', 'members', 'mygroup');
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/groups/mygroup/statistics/members', params: {} })
      );
    });

    it('--json prints the member rows as a bare array (same shape as --all)', async () => {
      request.mockResolvedValueOnce(envelope(membersPage));
      const code = await run('stats', 'members', 'mygroup', '--json');
      expect(code).toBe(0);
      expect(JSON.parse(stdoutText())).toEqual(membersPage.members);
    });

    it('--all drains pages at max page size and keeps filters', async () => {
      const fullPage = Array.from({ length: 20 }, (_, i) => ({ user_id: i, read_count: i }));
      const lastPage = [{ user_id: 20, read_count: 20 }];
      request
        .mockResolvedValueOnce(envelope({ members: fullPage, total: 21 }))
        .mockResolvedValueOnce(envelope({ members: lastPage, total: 21 }));
      const code = await run('stats', 'members', 'mygroup', '--all', '--name', 'ann', '--json');
      expect(code).toBe(0);
      expect(request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ params: { name: 'ann', page: 1, limit: 20 } })
      );
      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ params: { name: 'ann', page: 2, limit: 20 } })
      );
      expect(JSON.parse(stdoutText())).toHaveLength(21);
    });

    it('rejects a --range value outside the spec enum with exit code 2', async () => {
      const code = await run('stats', 'members', 'mygroup', '--range', '7');
      expect(code).toBe(2);
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects a non-positive --page with exit code 2', async () => {
      const code = await run('stats', 'members', 'mygroup', '--page', '0');
      expect(code).toBe(2);
      expect(stderrText()).toContain('--page expects a positive integer');
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('stats books', () => {
    const booksPage = {
      books: [{ book_id: 7, name: 'Handbook', slug: 'handbook', post_count: 12, read_count: 300 }],
      total: 1,
    };

    it('GETs /statistics/books and prints a table', async () => {
      request.mockResolvedValueOnce(envelope(booksPage));
      const code = await run('stats', 'books', 'mygroup', '--sort-field', 'word_count');
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/groups/mygroup/statistics/books',
        params: { sortField: 'word_count' },
        data: undefined,
      });
      expect(stdoutText()).toContain('Handbook');
    });

    it('--json prints the book rows as a bare array (same shape as --all)', async () => {
      request.mockResolvedValueOnce(envelope(booksPage));
      const code = await run('stats', 'books', 'mygroup', '--json');
      expect(code).toBe(0);
      expect(JSON.parse(stdoutText())).toEqual(booksPage.books);
    });
  });

  describe('stats docs', () => {
    it('GETs /statistics/docs with the bookId filter', async () => {
      const docsPage = {
        docs: [{ doc_id: 55, title: 'Intro', slug: 'intro', book_id: 7, read_count: 90 }],
        total: 1,
      };
      request.mockResolvedValueOnce(envelope(docsPage));
      const code = await run('stats', 'docs', 'mygroup', '--book-id', '7', '--range', '365');
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/groups/mygroup/statistics/docs',
        params: { bookId: 7, range: 365 },
        data: undefined,
      });
      expect(stdoutText()).toContain('Intro');
    });

    it('--json prints the doc rows as a bare array (same shape as --all)', async () => {
      const docsPage = { docs: [{ doc_id: 55, title: 'Intro' }], total: 1 };
      request.mockResolvedValueOnce(envelope(docsPage));
      const code = await run('stats', 'docs', 'mygroup', '--json');
      expect(code).toBe(0);
      expect(JSON.parse(stdoutText())).toEqual(docsPage.docs);
    });
  });

  it('maps API errors to the exit code contract (404 -> 4)', async () => {
    const error = new Error('not found') as Error & {
      isAxiosError: boolean;
      response: { status: number; data: { message: string }; headers: Record<string, string> };
    };
    error.isAxiosError = true;
    error.response = { status: 404, data: { message: 'group not found' }, headers: {} };
    request.mockRejectedValue(error);
    const code = await run('stats', 'group', 'nope');
    expect(code).toBe(4);
    expect(stderrText()).toContain('group not found');
  });
});
