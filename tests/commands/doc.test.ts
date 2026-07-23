import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** Wrap payload the way axios delivers a Yuque response: { data: <envelope> }. */
function ok(data: unknown) {
  return { data: { data } };
}

describe('doc commands', () => {
  const request = vi.fn();
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

  describe('doc list', () => {
    const docs = [
      { id: 1, slug: 'intro', title: 'Intro', word_count: 120, updated_at: '2026-01-01' },
      { id: 2, slug: 'guide', title: 'Guide', word_count: 300, updated_at: '2026-01-02' },
    ];

    it('GETs {repoBase}/docs for a namespace and prints the full JSON with --json', async () => {
      request.mockResolvedValueOnce(ok(docs));
      await expect(runCli(argv('doc', 'list', 'yuque/help', '--json'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/repos/yuque/help/docs',
        params: {},
        data: undefined,
      });
      expect(JSON.parse(stdoutText())).toEqual(docs);
    });

    it('accepts a numeric repo id and spec query flags', async () => {
      request.mockResolvedValueOnce(ok([]));
      await expect(
        runCli(
          argv(
            'doc',
            'list',
            '123456',
            '--offset',
            '10',
            '--limit',
            '5',
            '--deleted',
            '--changed-at-gte',
            '2026-01-01T00:00:00.000Z',
            '--optional-properties',
            'hits,tags'
          )
        )
      ).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/repos/123456/docs',
        params: {
          offset: 10,
          limit: 5,
          deleted: true,
          changed_at_gte: '2026-01-01T00:00:00.000Z',
          optional_properties: 'hits,tags',
        },
        data: undefined,
      });
    });

    it('renders a human table with slug/title/word_count/updated_at', async () => {
      request.mockResolvedValueOnce(ok(docs));
      await expect(runCli(argv('doc', 'list', 'yuque/help'))).resolves.toBe(0);
      const out = stdoutText();
      expect(out).toContain('SLUG');
      expect(out).toContain('intro');
      expect(out).toContain('Guide');
      expect(out).toContain('300');
      expect(out).toContain('2026-01-02');
    });

    it('--all drains pages via offset/limit until a short page', async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i, slug: `d${i}` }));
      request.mockResolvedValueOnce(ok(fullPage)).mockResolvedValueOnce(ok([{ id: 100 }]));
      await expect(runCli(argv('doc', 'list', 'yuque/help', '--all', '--json'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ params: { offset: 0, limit: 100 } })
      );
      expect(request).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ params: { offset: 100, limit: 100 } })
      );
      expect(JSON.parse(stdoutText())).toHaveLength(101);
    });

    it('rejects a non-integer --limit with exit code 2', async () => {
      await expect(runCli(argv('doc', 'list', 'yuque/help', '--limit', 'ten'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects a non-integer --limit with exit code 2 even with --all', async () => {
      await expect(
        runCli(argv('doc', 'list', 'yuque/help', '--all', '--limit', 'banana'))
      ).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('--limit expects a non-negative integer');
    });

    it('--all overrides valid --offset/--limit values with the paginator schedule', async () => {
      request.mockResolvedValueOnce(ok([{ id: 1 }]));
      await expect(
        runCli(argv('doc', 'list', 'yuque/help', '--all', '--offset', '10', '--limit', '5'))
      ).resolves.toBe(0);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ params: { offset: 0, limit: 100 } })
      );
    });
  });

  describe('doc get', () => {
    const detail = {
      id: 42,
      slug: 'intro',
      title: 'Intro',
      format: 'markdown',
      word_count: 2,
      body: '# Hello\n\nWorld.\n',
    };

    it('with <repo> <doc> GETs {repoBase}/docs/{doc} and prints the raw body', async () => {
      request.mockResolvedValueOnce(ok(detail));
      await expect(runCli(argv('doc', 'get', 'yuque/help', 'intro'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/repos/yuque/help/docs/intro',
        params: undefined,
        data: undefined,
      });
      expect(stdoutText()).toBe('# Hello\n\nWorld.\n');
    });

    it('with one numeric arg GETs /repos/docs/{id}', async () => {
      request.mockResolvedValueOnce(ok(detail));
      await expect(runCli(argv('doc', 'get', '42'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/repos/docs/42',
        params: undefined,
        data: undefined,
      });
    });

    it('with one non-numeric arg exits 2 without a request', async () => {
      await expect(runCli(argv('doc', 'get', 'intro'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('not a numeric doc id');
    });

    it('--meta prints metadata and never the body', async () => {
      request.mockResolvedValueOnce(ok(detail));
      await expect(runCli(argv('doc', 'get', 'yuque/help', 'intro', '--meta'))).resolves.toBe(0);
      const out = stdoutText();
      expect(out).toContain('Intro');
      expect(out).toContain('markdown');
      expect(out).not.toContain('# Hello');
    });

    it('--json prints the full payload including the body', async () => {
      request.mockResolvedValueOnce(ok(detail));
      await expect(runCli(argv('doc', 'get', 'yuque/help', 'intro', '--json'))).resolves.toBe(0);
      expect(JSON.parse(stdoutText())).toEqual(detail);
    });
  });

  describe('doc create', () => {
    const created = { id: 7, slug: 'new-doc', title: 'New Doc' };

    it('POSTs {repoBase}/docs with the spec body fields', async () => {
      request.mockResolvedValueOnce(ok(created));
      await expect(
        runCli(
          argv(
            'doc',
            'create',
            'yuque/help',
            '--title',
            'New Doc',
            '--slug',
            'new-doc',
            '--body',
            '# hi',
            '--format',
            'markdown',
            '--public',
            '1',
            '--json'
          )
        )
      ).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'post',
        url: '/repos/yuque/help/docs',
        params: undefined,
        data: { title: 'New Doc', slug: 'new-doc', body: '# hi', format: 'markdown', public: 1 },
      });
      expect(JSON.parse(stdoutText())).toEqual(created);
    });

    it('--body-file reads the body from disk', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'yuque-cli-test-'));
      const file = join(dir, 'body.md');
      writeFileSync(file, '# from file\n');
      try {
        request.mockResolvedValueOnce(ok(created));
        await expect(
          runCli(argv('doc', 'create', 'yuque/help', '--title', 'T', '--body-file', file))
        ).resolves.toBe(0);
        expect(request).toHaveBeenCalledWith(
          expect.objectContaining({ data: { title: 'T', body: '# from file\n' } })
        );
        expect(stdoutText()).toContain('Created doc');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('rejects --body together with --body-file with exit code 2', async () => {
      await expect(
        runCli(
          argv('doc', 'create', 'yuque/help', '--title', 'T', '--body', 'a', '--body-file', 'b.md')
        )
      ).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('mutually exclusive');
    });

    it('requires a body (spec: body is required) with exit code 2', async () => {
      await expect(runCli(argv('doc', 'create', 'yuque/help', '--title', 'T'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('doc update', () => {
    it('PUTs {repoBase}/docs/{doc} with only the given fields', async () => {
      request.mockResolvedValueOnce(ok({ id: 42, slug: 'intro', title: 'Renamed' }));
      await expect(
        runCli(argv('doc', 'update', 'yuque/help', 'intro', '--title', 'Renamed'))
      ).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'put',
        url: '/repos/yuque/help/docs/intro',
        params: undefined,
        data: { title: 'Renamed' },
      });
      expect(stdoutText()).toContain('Updated doc yuque/help/intro');
    });

    it('rejects an empty update with exit code 2', async () => {
      await expect(runCli(argv('doc', 'update', 'yuque/help', 'intro'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('nothing to update');
    });
  });

  describe('doc delete', () => {
    it('--yes skips confirmation and DELETEs {repoBase}/docs/{doc}', async () => {
      request.mockResolvedValueOnce(ok({ id: 42, slug: 'intro' }));
      await expect(runCli(argv('doc', 'delete', 'yuque/help', 'intro', '--yes'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'delete',
        url: '/repos/yuque/help/docs/intro',
        params: undefined,
        data: undefined,
      });
      expect(stdoutText()).toContain('Deleted doc yuque/help/intro');
    });

    it('without --yes on a non-TTY stdin exits 2 and never calls the API', async () => {
      const originalIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;
      try {
        await expect(runCli(argv('doc', 'delete', 'yuque/help', 'intro'))).resolves.toBe(2);
      } finally {
        process.stdin.isTTY = originalIsTTY;
      }
      expect(request).not.toHaveBeenCalled();
      expect(stderrText()).toContain('--yes');
    });
  });

  describe('doc versions', () => {
    const versions = [
      { id: 900, doc_id: 42, title: 'v2', updated_at: '2026-01-02', user: { name: 'Alice' } },
      { id: 899, doc_id: 42, title: 'v1', updated_at: '2026-01-01', user: { name: 'Bob' } },
    ];

    it('GETs /doc_versions?doc_id=... and prints the full JSON with --json', async () => {
      request.mockResolvedValueOnce(ok(versions));
      await expect(runCli(argv('doc', 'versions', '42', '--json'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/doc_versions',
        params: { doc_id: 42 },
        data: undefined,
      });
      expect(JSON.parse(stdoutText())).toEqual(versions);
    });

    it('renders a human table with id/title/updated_at/user', async () => {
      request.mockResolvedValueOnce(ok(versions));
      await expect(runCli(argv('doc', 'versions', '42'))).resolves.toBe(0);
      const out = stdoutText();
      expect(out).toContain('900');
      expect(out).toContain('v1');
      expect(out).toContain('Alice');
    });

    it('rejects a non-numeric doc id with exit code 2', async () => {
      await expect(runCli(argv('doc', 'versions', 'intro'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('doc version', () => {
    const versionDetail = {
      id: 900,
      doc_id: 42,
      title: 'v2',
      format: 'lake',
      body: '<lake>raw</lake>',
      body_md: '# v2 body\n',
    };

    it('GETs /doc_versions/{id} and prints body_md by default', async () => {
      request.mockResolvedValueOnce(ok(versionDetail));
      await expect(runCli(argv('doc', 'version', '900'))).resolves.toBe(0);
      expect(request).toHaveBeenCalledWith({
        method: 'get',
        url: '/doc_versions/900',
        params: undefined,
        data: undefined,
      });
      expect(stdoutText()).toBe('# v2 body\n');
    });

    it('falls back to body when body_md is absent', async () => {
      request.mockResolvedValueOnce(ok({ id: 900, title: 'v2', body: 'plain body' }));
      await expect(runCli(argv('doc', 'version', '900'))).resolves.toBe(0);
      expect(stdoutText()).toBe('plain body\n');
    });

    it('--meta prints metadata and --json the full payload', async () => {
      request.mockResolvedValueOnce(ok(versionDetail)).mockResolvedValueOnce(ok(versionDetail));
      await expect(runCli(argv('doc', 'version', '900', '--meta'))).resolves.toBe(0);
      expect(stdoutText()).toContain('lake');
      expect(stdoutText()).not.toContain('# v2 body');

      stdout.mockClear();
      await expect(runCli(argv('doc', 'version', '900', '--json'))).resolves.toBe(0);
      expect(JSON.parse(stdoutText())).toEqual(versionDetail);
    });

    it('rejects a non-numeric version id with exit code 2', async () => {
      await expect(runCli(argv('doc', 'version', 'latest'))).resolves.toBe(2);
      expect(request).not.toHaveBeenCalled();
    });
  });
});
