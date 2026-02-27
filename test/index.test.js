import test from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/index.js';

function makeIo() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line)
  };
}

test('main starts repl when no args', async () => {
  let called = 0;
  const io = makeIo();
  await main(['node', 'src/index.js'], {
    ...io,
    startReplFn: async () => {
      called += 1;
    }
  });
  assert.equal(called, 1);
});

test('repl command starts interactive mode', async () => {
  let called = 0;
  const io = makeIo();
  await main(['node', 'src/index.js', 'repl'], {
    ...io,
    startReplFn: async () => {
      called += 1;
    }
  });
  assert.equal(called, 1);
});

test('whoami command prints formatted user', async () => {
  const io = makeIo();
  await main(['node', 'src/index.js', 'whoami'], {
    ...io,
    whoamiFn: async () => ({ id: 7, login: 'foo' })
  });
  assert.deepEqual(io.out, ['foo (7)']);
});

test('list repos prints each namespace', async () => {
  const io = makeIo();
  await main(['node', 'src/index.js', 'list', 'repos'], {
    ...io,
    listReposFn: async () => [{ namespace: 'a/b' }, { namespace: 'x/y' }]
  });
  assert.deepEqual(io.out, ['a/b', 'x/y']);
});

test('list docs prints each slug with repo argument', async () => {
  const io = makeIo();
  await main(['node', 'src/index.js', 'list', 'docs', 'a/b'], {
    ...io,
    listDocsFn: async (repo) => {
      assert.equal(repo, 'a/b');
      return [{ slug: 'd1' }, { slug: 'd2' }];
    }
  });
  assert.deepEqual(io.out, ['d1', 'd2']);
});

test('list docs requires repo argument', async () => {
  const io = makeIo();
  const originalExitCode = process.exitCode;
  process.exitCode = 0;

  await main(['node', 'src/index.js', 'list', 'docs'], {
    ...io,
    listDocsFn: async () => [{ slug: 'd1' }]
  });

  assert.match(io.err[0], /Repo required/);
  assert.equal(process.exitCode, 1);
  process.exitCode = originalExitCode;
});

test('open command delegates to openDoc', async () => {
  let got = null;
  const io = makeIo();
  await main(['node', 'src/index.js', 'open', 'a/b/d1'], {
    ...io,
    openDocFn: async (repoDoc) => {
      got = repoDoc;
    }
  });
  assert.equal(got, 'a/b/d1');
});

test('show command prints markdown body', async () => {
  const io = makeIo();
  await main(['node', 'src/index.js', 'show', 'a/b/d1'], {
    ...io,
    readDocFn: async (repo, slug) => {
      assert.equal(repo, 'a/b');
      assert.equal(slug, 'd1');
      return { body: '# doc' };
    }
  });
  assert.deepEqual(io.out, ['# doc']);
});

test('search command prints title or slug', async () => {
  const io = makeIo();
  await main(['node', 'src/index.js', 'search', 'k', 'a/b'], {
    ...io,
    searchDocsFn: async () => [{ title: 'T1' }, { slug: 's2' }]
  });
  assert.deepEqual(io.out, ['T1', 's2']);
});
