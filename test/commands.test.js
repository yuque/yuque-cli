import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommands } from '../src/commands.js';

test('whoami delegates to getUser', async () => {
  const expected = { id: 1, login: 'foo' };
  const c = createCommands({
    getUserFn: async () => expected
  });

  const got = await c.whoami();
  assert.deepEqual(got, expected);
});

test('listRepos/listDocs/searchDocs delegate to api functions', async () => {
  const repos = [{ namespace: 'a/b' }];
  const docs = [{ slug: 'doc-1' }];
  const search = [{ title: 'doc-1' }];
  const c = createCommands({
    listReposFn: async () => repos,
    listDocsFn: async (repo) => {
      assert.equal(repo, 'a/b');
      return docs;
    },
    searchDocsFn: async (repo, q) => {
      assert.equal(repo, 'a/b');
      assert.equal(q, 'k');
      return search;
    }
  });

  assert.deepEqual(await c.listRepos(), repos);
  assert.deepEqual(await c.listDocs('a/b'), docs);
  assert.deepEqual(await c.searchDocs('a/b', 'k'), search);
});

test('openDoc opens URL when found', async () => {
  const calls = [];
  const c = createCommands({
    getDocFn: async (repo, slug) => {
      calls.push(['getDoc', repo, slug]);
      return { url: 'https://www.yuque.com/a/b/doc-1' };
    },
    openUrlFn: async (url) => {
      calls.push(['open', url]);
    }
  });

  const doc = await c.openDoc('a/b/doc-1');
  assert.equal(doc.url, 'https://www.yuque.com/a/b/doc-1');
  assert.deepEqual(calls, [
    ['getDoc', 'a/b', 'doc-1'],
    ['open', 'https://www.yuque.com/a/b/doc-1']
  ]);
});

test('openDoc supports fallback repo and uses synthesized url when missing', async () => {
  const calls = [];
  const c = createCommands({
    getDocFn: async (repo, slug) => {
      calls.push(['getDoc', repo, slug]);
      return { slug };
    },
    openUrlFn: async (url) => {
      calls.push(['open', url]);
    }
  });

  const doc = await c.openDoc('doc-2', 'a/b');
  assert.equal(doc.slug, 'doc-2');
  assert.equal(doc.url, 'https://www.yuque.com/a/b/doc-2');
  assert.deepEqual(calls, [
    ['getDoc', 'a/b', 'doc-2'],
    ['open', 'https://www.yuque.com/a/b/doc-2']
  ]);
});

test('openDoc throws on missing repo', async () => {
  const c = createCommands({
    splitRepoDocFn: () => null
  });

  await assert.rejects(
    () => c.openDoc('', null),
    /Use <repo>\/<doc> format or set current repo/
  );
});

test('createDoc delegates to api function', async () => {
  const c = createCommands({
    createDocFn: async (repo, payload) => {
      assert.equal(repo, 'a/b');
      assert.deepEqual(payload, { title: 't', slug: 's', body: 'x' });
      return { id: 3 };
    }
  });

  const doc = await c.createDoc('a/b', { title: 't', slug: 's', body: 'x' });
  assert.deepEqual(doc, { id: 3 });
});

test('readDoc delegates to getDoc function', async () => {
  const c = createCommands({
    getDocFn: async (repo, slug) => {
      assert.equal(repo, 'a/b');
      assert.equal(slug, 'd1');
      return { slug: 'd1', body: '# hi' };
    }
  });

  const doc = await c.readDoc('a/b', 'd1');
  assert.deepEqual(doc, { slug: 'd1', body: '# hi' });
});
