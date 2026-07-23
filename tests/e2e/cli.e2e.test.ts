import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end tests that drive the *built* CLI (`dist/bin.js`) as a subprocess
 * against the real Yuque API — the true user-facing surface (arg parsing,
 * rendering, exit codes, retry, auth), which the mocked suite cannot exercise.
 *
 * Everything here is gated on env vars and is `describe.skip` otherwise, so the
 * default `npm test` / `npm run check` never touches the network. Run with:
 *   npm run test:e2e
 * See tests/e2e/README.md for the required secrets/variables.
 *
 * Gates:
 *   YUQUE_E2E=1                 enable read paths + error contract
 *   YUQUE_E2E_WRITE=1           enable the doc create/update/delete lifecycle
 *                               (requires YUQUE_E2E_REPO — a dedicated sandbox)
 *   YUQUE_E2E_REPO_LIFECYCLE=1  enable repo create/delete (local only; never
 *                               wired into CI because of its larger blast radius)
 */

const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));

const READ_ENABLED = process.env.YUQUE_E2E === '1';
const WRITE_ENABLED = READ_ENABLED && process.env.YUQUE_E2E_WRITE === '1';
const REPO_LIFECYCLE_ENABLED = READ_ENABLED && process.env.YUQUE_E2E_REPO_LIFECYCLE === '1';

const personalToken = process.env.YUQUE_E2E_TOKEN;
const teamToken = process.env.YUQUE_E2E_TEAM_TOKEN;
const teamHost = process.env.YUQUE_E2E_HOST;
const teamGroup = process.env.YUQUE_E2E_GROUP ?? '';
const sandboxRepo = process.env.YUQUE_E2E_REPO;
const configuredLogin = process.env.YUQUE_E2E_LOGIN;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn the built CLI with an env overlay; undefined overrides unset the key. */
function runCli(args: string[], overrides: Record<string, string | undefined> = {}): RunResult {
  const env: Record<string, string | undefined> = { ...process.env, ...overrides };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync('node', [BIN, ...args], {
    encoding: 'utf8',
    timeout: 60000,
    env: env as NodeJS.ProcessEnv,
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Personal-token invocation (never inherits a stray YUQUE_HOST). */
function pc(args: string[]): RunResult {
  return runCli(args, { YUQUE_TOKEN: personalToken, YUQUE_HOST: undefined });
}

/** Team/space-token invocation (carries YUQUE_HOST for space-bound tokens). */
function tc(args: string[]): RunResult {
  return runCli(args, { YUQUE_TOKEN: teamToken, YUQUE_HOST: teamHost });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function okJson(res: RunResult): any {
  expect(res.code, `expected exit 0, got ${res.code}\nstderr: ${res.stderr}`).toBe(0);
  return JSON.parse(res.stdout);
}

const describeConfig = READ_ENABLED ? describe : describe.skip;
describeConfig('e2e config sanity', () => {
  it('has a personal token', () => {
    expect(personalToken, 'set the YUQUE_E2E_TOKEN secret').toBeTruthy();
  });

  it('has a built binary (run `npm run build` first)', () => {
    expect(existsSync(BIN)).toBe(true);
  });

  it('write mode requires an explicit sandbox repo', () => {
    // Never let writes fall back to a discovered repo — they must target a
    // dedicated throwaway knowledge base, or not run at all.
    if (process.env.YUQUE_E2E_WRITE === '1') {
      expect(
        sandboxRepo,
        'YUQUE_E2E_WRITE=1 requires YUQUE_E2E_REPO (a dedicated sandbox)'
      ).toBeTruthy();
    }
  });
});

const describeRead = READ_ENABLED && personalToken ? describe : describe.skip;
describeRead('read paths (personal token)', () => {
  let login: string;
  let readRepo: string;
  let sampleDocSlug: string | undefined;

  beforeAll(() => {
    login = configuredLogin ?? String(okJson(pc(['auth', 'status', '--json'])).login);
    if (sandboxRepo) {
      readRepo = sandboxRepo;
    } else {
      // Only Book repos serve the /docs and /toc endpoints — a Design (board)
      // repo as the account's first repo would 404 them, so filter server-side.
      const repos = okJson(pc(['repo', 'list', login, '--type', 'Book', '--json']));
      expect(
        Array.isArray(repos) && repos.length,
        'test account has no Book repos to read — create one or set YUQUE_E2E_REPO'
      ).toBeTruthy();
      readRepo = String(repos[0].namespace ?? repos[0].id);
    }
    const docs = okJson(pc(['doc', 'list', readRepo, '--json']));
    sampleDocSlug = Array.isArray(docs) && docs.length ? String(docs[0].slug) : undefined;
  });

  it('ping exits 0', () => {
    expect(pc(['ping']).code).toBe(0);
  });

  it('auth status --json reports a login', () => {
    expect(okJson(pc(['auth', 'status', '--json'])).login).toBeTruthy();
  });

  it('user info --json has id and login', () => {
    const user = okJson(pc(['user', 'info', '--json']));
    expect(user.id).toBeTruthy();
    expect(user.login).toBeTruthy();
  });

  it('user groups --json returns an array', () => {
    expect(Array.isArray(okJson(pc(['user', 'groups', login, '--json'])))).toBe(true);
  });

  it('search --json returns an array', () => {
    expect(Array.isArray(okJson(pc(['search', 'test', '--type', 'doc', '--json'])))).toBe(true);
  });

  it('repo list --json returns an array', () => {
    expect(Array.isArray(okJson(pc(['repo', 'list', login, '--json'])))).toBe(true);
  });

  it('repo get --json returns the repo', () => {
    expect(okJson(pc(['repo', 'get', readRepo, '--json'])).id).toBeTruthy();
  });

  it('doc list --json returns an array', () => {
    expect(Array.isArray(okJson(pc(['doc', 'list', readRepo, '--json'])))).toBe(true);
  });

  it('doc get --json returns a doc', () => {
    if (!sampleDocSlug) return; // empty repo — nothing to fetch, skip vacuously
    expect(okJson(pc(['doc', 'get', readRepo, sampleDocSlug, '--json'])).id).toBeTruthy();
  });

  it('toc get --json returns an array', () => {
    expect(Array.isArray(okJson(pc(['toc', 'get', readRepo, '--json'])))).toBe(true);
  });
});

const describeError = READ_ENABLED && personalToken ? describe : describe.skip;
describeError('error contract', () => {
  it('an invalid token exits 3 (auth error)', () => {
    const res = runCli(['user', 'info'], {
      YUQUE_TOKEN: 'e2e-definitely-invalid-token',
      YUQUE_HOST: undefined,
    });
    expect(res.code).toBe(3);
  });

  it('a nonexistent repo exits 4 (not found)', () => {
    expect(pc(['repo', 'get', '999999999']).code).toBe(4);
  });
});

const describeTeam = READ_ENABLED && teamToken && teamGroup ? describe : describe.skip;
describeTeam('team + statistics (team/space token)', () => {
  it('group members --json returns an array', () => {
    expect(Array.isArray(okJson(tc(['group', 'members', teamGroup, '--json'])))).toBe(true);
  });

  it('stats group --json returns an object', () => {
    expect(typeof okJson(tc(['stats', 'group', teamGroup, '--json']))).toBe('object');
  });

  it('stats members --json returns an array', () => {
    expect(Array.isArray(okJson(tc(['stats', 'members', teamGroup, '--json'])))).toBe(true);
  });

  it('stats books --json returns an array', () => {
    expect(Array.isArray(okJson(tc(['stats', 'books', teamGroup, '--json'])))).toBe(true);
  });

  it('stats docs --json returns an array', () => {
    expect(Array.isArray(okJson(tc(['stats', 'docs', teamGroup, '--json'])))).toBe(true);
  });
});

const describeWrite = WRITE_ENABLED && personalToken && sandboxRepo ? describe : describe.skip;
describeWrite('write lifecycle (sandbox repo)', () => {
  const repo = sandboxRepo as string;
  const stamp = `${Date.now()}`;
  const createdIds: string[] = [];

  /** Delete any leftover e2e-* docs so scheduled CI never accumulates junk. */
  function sweep(): void {
    const docs = okJson(pc(['doc', 'list', repo, '--all', '--json']));
    if (!Array.isArray(docs)) return;
    for (const doc of docs) {
      if (typeof doc.slug === 'string' && doc.slug.startsWith('e2e-')) {
        pc(['doc', 'delete', repo, String(doc.id), '--yes']);
      }
    }
  }

  beforeAll(() => sweep());
  afterAll(() => {
    for (const id of createdIds) pc(['doc', 'delete', repo, id, '--yes']);
    sweep();
  });

  it('creates, reads, updates, and deletes a doc', () => {
    const slug = `e2e-${stamp}`;
    const created = okJson(
      pc([
        'doc',
        'create',
        repo,
        '--title',
        `[E2E] ${stamp}`,
        '--slug',
        slug,
        '--body',
        `created at ${stamp}`,
        '--json',
      ])
    );
    expect(created.id).toBeTruthy();
    const id = String(created.id);
    createdIds.push(id);

    const fetched = okJson(pc(['doc', 'get', repo, id, '--json']));
    expect(fetched.id).toBe(created.id);

    const updated = okJson(
      pc(['doc', 'update', repo, id, '--body', `updated at ${stamp}`, '--json'])
    );
    expect(updated.id).toBe(created.id);

    // Yuque delete may be soft (recycle bin) or hard; assert the command
    // succeeds and let afterAll's sweep guarantee removal either way.
    expect(pc(['doc', 'delete', repo, id, '--yes']).code).toBe(0);
    createdIds.length = 0;
  });
});

const describeRepoLifecycle = REPO_LIFECYCLE_ENABLED && personalToken ? describe : describe.skip;
describeRepoLifecycle('repo lifecycle (ephemeral repo, local only)', () => {
  it('creates, reads, and deletes a repo', () => {
    expect(configuredLogin, 'YUQUE_E2E_LOGIN is required for the repo lifecycle test').toBeTruthy();
    const login = configuredLogin as string;
    const stamp = `${Date.now()}`;
    const created = okJson(
      pc([
        'repo',
        'create',
        login,
        '--name',
        `[E2E] ${stamp}`,
        '--slug',
        `e2e-repo-${stamp}`,
        '--json',
      ])
    );
    expect(created.id).toBeTruthy();
    const id = String(created.id);
    try {
      expect(okJson(pc(['repo', 'get', id, '--json'])).id).toBeTruthy();
    } finally {
      expect(pc(['repo', 'delete', id, '--yes']).code).toBe(0);
    }
  });
});
