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

describe('auth / user / search commands', () => {
  const request = vi.fn();
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    stdout = [];
    stderr = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    vi.stubEnv('YUQUE_TOKEN', 'test-token');
    vi.stubEnv('YUQUE_PERSONAL_TOKEN', '');
    vi.stubEnv('YUQUE_HOST', '');
    request.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAxios.create.mockReturnValue({ request } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const user = {
    id: 42,
    login: 'zhangsan',
    name: '张三',
    description: 'hello',
    books_count: 3,
    followers_count: 7,
  };

  describe('ping', () => {
    it('calls GET /hello and prints the greeting', async () => {
      request.mockResolvedValueOnce({ data: { data: { message: 'Hello, zhangsan!' } } });
      const code = await runCli(['node', 'yuque', 'ping']);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', url: '/hello' })
      );
      expect(stdout.join('')).toContain('Hello, zhangsan!');
    });

    it('prints the full payload with --json', async () => {
      request.mockResolvedValueOnce({ data: { data: { message: 'Hi' } } });
      const code = await runCli(['node', 'yuque', 'ping', '--json']);
      expect(code).toBe(0);
      expect(JSON.parse(stdout.join(''))).toEqual({ message: 'Hi' });
    });
  });

  describe('auth status', () => {
    it('calls GET /user and prints host + identity', async () => {
      request.mockResolvedValueOnce({ data: { data: user } });
      const code = await runCli(['node', 'yuque', 'auth', 'status']);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', url: '/user' })
      );
      expect(stdout.join('')).toBe('Logged in to https://www.yuque.com as 张三 (@zhangsan)\n');
    });

    it('prints the full user with --json', async () => {
      request.mockResolvedValueOnce({ data: { data: user } });
      const code = await runCli(['node', 'yuque', 'auth', 'status', '--json']);
      expect(code).toBe(0);
      expect(JSON.parse(stdout.join(''))).toEqual(user);
    });

    it('exits 3 when no token is configured', async () => {
      vi.stubEnv('YUQUE_TOKEN', '');
      const code = await runCli(['node', 'yuque', 'auth', 'status']);
      expect(code).toBe(3);
      expect(request).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('token');
    });
  });

  describe('user info', () => {
    it('calls GET /user and prints key fields', async () => {
      request.mockResolvedValueOnce({ data: { data: user } });
      const code = await runCli(['node', 'yuque', 'user', 'info']);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', url: '/user' })
      );
      const output = stdout.join('');
      expect(output).toContain('zhangsan');
      expect(output).toContain('张三');
      expect(output).toContain('books_count');
    });

    it('prints the full user with --json', async () => {
      request.mockResolvedValueOnce({ data: { data: user } });
      const code = await runCli(['node', 'yuque', 'user', 'info', '--json']);
      expect(code).toBe(0);
      expect(JSON.parse(stdout.join(''))).toEqual(user);
    });
  });

  describe('user groups', () => {
    const groups = [
      { id: 1, login: 'dev', name: 'Dev Team', members_count: 10, books_count: 4 },
      { id: 2, login: 'design', name: '设计组', members_count: 5, books_count: 2 },
    ];

    it('calls GET /users/{id}/groups and prints a table', async () => {
      request.mockResolvedValueOnce({ data: { data: groups } });
      const code = await runCli(['node', 'yuque', 'user', 'groups', 'zhangsan']);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', url: '/users/zhangsan/groups', params: {} })
      );
      const output = stdout.join('');
      expect(output).toContain('LOGIN');
      expect(output).toContain('Dev Team');
      expect(output).toContain('设计组');
    });

    it('passes --role and --offset as query params', async () => {
      request.mockResolvedValueOnce({ data: { data: [] } });
      const code = await runCli([
        'node',
        'yuque',
        'user',
        'groups',
        '42',
        '--role',
        '1',
        '--offset',
        '5',
      ]);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/users/42/groups', params: { role: 1, offset: 5 } })
      );
    });

    it('drains all pages with --all', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        login: `g${i + 1}`,
        name: `Group ${i + 1}`,
      }));
      request
        .mockResolvedValueOnce({ data: { data: fullPage } })
        .mockResolvedValueOnce({ data: { data: [{ id: 101, login: 'g101', name: 'Group 101' }] } });
      const code = await runCli(['node', 'yuque', 'user', 'groups', 'zhangsan', '--all', '--json']);
      expect(code).toBe(0);
      expect(request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ params: { offset: 0 } })
      );
      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ params: { offset: 100 } })
      );
      expect(JSON.parse(stdout.join(''))).toHaveLength(101);
    });

    it('rejects a non-integer --offset with exit code 2', async () => {
      const code = await runCli(['node', 'yuque', 'user', 'groups', 'zhangsan', '--offset', 'x']);
      expect(code).toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const results = [
      { id: 1, type: 'doc', title: 'Getting started', url: '/yuque/help/start' },
      { id: 2, type: 'doc', title: '入门指南', url: '/yuque/help/intro' },
    ];

    it('calls GET /search with all query params and prints a table', async () => {
      request.mockResolvedValueOnce({ data: { data: results } });
      const code = await runCli([
        'node',
        'yuque',
        'search',
        'guide',
        '--type',
        'doc',
        '--scope',
        'yuque/help',
        '--creator',
        'zhangsan',
        '--page',
        '2',
      ]);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'get',
          url: '/search',
          params: { q: 'guide', type: 'doc', scope: 'yuque/help', creator: 'zhangsan', page: 2 },
        })
      );
      const output = stdout.join('');
      expect(output).toContain('TITLE');
      expect(output).toContain('Getting started');
      expect(output).toContain('/yuque/help/intro');
    });

    it('prints the full result list with --json', async () => {
      request.mockResolvedValueOnce({ data: { data: results } });
      const code = await runCli(['node', 'yuque', 'search', 'guide', '--type', 'repo', '--json']);
      expect(code).toBe(0);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ params: { q: 'guide', type: 'repo' } })
      );
      expect(JSON.parse(stdout.join(''))).toEqual(results);
    });

    it('requires --type (exit code 2)', async () => {
      const code = await runCli(['node', 'yuque', 'search', 'guide']);
      expect(code).toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('--type');
    });

    it('rejects an invalid --type value (exit code 2)', async () => {
      const code = await runCli(['node', 'yuque', 'search', 'guide', '--type', 'user']);
      expect(code).toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });
});
