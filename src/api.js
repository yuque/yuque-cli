import { getToken } from './config.js';

const DEFAULT_ENDPOINT = 'https://www.yuque.com';

function getBaseUrl() {
  const endpoint = process.env.YUQUE_ENDPOINT || DEFAULT_ENDPOINT;
  return `${endpoint.replace(/\/$/, '')}/api/v2`;
}

function encodePath(segment) {
  return encodeURIComponent(segment);
}

function encodeNamespace(namespace) {
  return String(namespace)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

async function request(path, { method = 'GET', params, body } = {}) {
  const token = await getToken();
  if (!token) {
    const err = new Error('Missing token');
    err.code = 'NO_TOKEN';
    throw err;
  }

  const url = new URL(getBaseUrl() + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'yuque-cli',
      'X-Auth-Token': token,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = new Error(json?.message || `Request failed: ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}

export async function getUser() {
  const res = await request('/user');
  return res?.data || null;
}

export async function listRepos() {
  try {
    const res = await request('/user/repos');
    return normalizeArray(res?.data ?? res);
  } catch (err) {
    if (err?.status !== 404) throw err;
  }

  const user = await getUser();
  if (!user?.id) {
    throw new Error('Unable to resolve user for repos');
  }
  const res = await request(`/users/${encodePath(user.id)}/repos`);
  return normalizeArray(res?.data ?? res);
}

export async function listDocs(repo) {
  const res = await request(`/repos/${encodeNamespace(repo)}/docs`);
  return normalizeArray(res?.data ?? res);
}

export async function getDoc(repo, slug) {
  const res = await request(`/repos/${encodeNamespace(repo)}/docs/${encodePath(slug)}`);
  return res?.data || null;
}

export async function searchDocs(repo, q) {
  const res = await request('/search', {
    params: {
      q,
      type: 'doc',
      scope: repo
    }
  });
  return normalizeArray(res?.data ?? res);
}

export async function createDoc(repo, payload) {
  const res = await request(`/repos/${encodeNamespace(repo)}/docs`, {
    method: 'POST',
    body: payload
  });
  return res?.data || null;
}
