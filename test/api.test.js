import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as api from '../src/api.js';

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

let originalFetch = global.fetch;
let originalXdg = process.env.XDG_CONFIG_HOME;
let originalToken = process.env.YUQUE_TOKEN;
let originalEndpoint = process.env.YUQUE_ENDPOINT;
let originalHome = process.env.HOME;

test.beforeEach(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'yuque-cli-test-'));
  process.env.XDG_CONFIG_HOME = tmp;
  process.env.HOME = tmp;
  process.env.YUQUE_TOKEN = 'tkn';
  delete process.env.YUQUE_ENDPOINT;
  global.fetch = originalFetch;
});

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  if (originalToken === undefined) delete process.env.YUQUE_TOKEN;
  else process.env.YUQUE_TOKEN = originalToken;
  if (originalEndpoint === undefined) delete process.env.YUQUE_ENDPOINT;
  else process.env.YUQUE_ENDPOINT = originalEndpoint;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

test('listRepos uses /user/repos directly when available', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse(200, { data: [{ namespace: 'a/b' }] });
  };

  const repos = await api.listRepos();
  assert.deepEqual(repos, [{ namespace: 'a/b' }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/v2\/user\/repos$/);
});

test('listRepos falls back to /users/{id}/repos on 404', async () => {
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith('/api/v2/user/repos')) {
      return jsonResponse(404, { message: 'Not Found' });
    }
    if (u.endsWith('/api/v2/user')) {
      return jsonResponse(200, { data: { id: 11 } });
    }
    if (u.endsWith('/api/v2/users/11/repos')) {
      return jsonResponse(200, { data: [{ namespace: 'x/y' }] });
    }
    return jsonResponse(500, { message: 'unexpected url' });
  };

  const repos = await api.listRepos();
  assert.deepEqual(repos, [{ namespace: 'x/y' }]);
  assert.deepEqual(calls, [
    'https://www.yuque.com/api/v2/user/repos',
    'https://www.yuque.com/api/v2/user',
    'https://www.yuque.com/api/v2/users/11/repos'
  ]);
});

test('listDocs/searchDocs normalize array response shapes', async () => {
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/repos/a/b/docs')) {
      return jsonResponse(200, { data: { data: [{ slug: 'd1' }] } });
    }
    if (u.includes('/search')) {
      return jsonResponse(200, { data: { items: [{ title: 'd2' }] } });
    }
    return jsonResponse(500, { message: 'unexpected url' });
  };

  const docs = await api.listDocs('a/b');
  const results = await api.searchDocs('a/b', 'k');
  assert.deepEqual(docs, [{ slug: 'd1' }]);
  assert.deepEqual(results, [{ title: 'd2' }]);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /scope=a%2Fb/);
});

test('createDoc posts JSON body and getDoc returns data', async () => {
  const seen = [];
  global.fetch = async (url, options) => {
    seen.push({ url: String(url), options });
    if (String(url).includes('/repos/a/b/docs/s1')) {
      return jsonResponse(200, { data: { slug: 's1' } });
    }
    if (String(url).includes('/repos/a/b/docs')) {
      return jsonResponse(200, { data: { id: 9 } });
    }
    return jsonResponse(500, { message: 'unexpected url' });
  };

  const created = await api.createDoc('a/b', { title: 't', slug: 's1', body: 'x' });
  const found = await api.getDoc('a/b', 's1');

  assert.deepEqual(created, { id: 9 });
  assert.deepEqual(found, { slug: 's1' });

  assert.equal(seen[0].options.method, 'POST');
  assert.equal(seen[0].options.body, JSON.stringify({ title: 't', slug: 's1', body: 'x' }));
});

test('throws NO_TOKEN when auth missing', async () => {
  delete process.env.YUQUE_TOKEN;
  global.fetch = async () => jsonResponse(200, { data: [] });

  await assert.rejects(
    () => api.listRepos(),
    (err) => err && err.code === 'NO_TOKEN'
  );
});
