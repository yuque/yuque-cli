import open from 'open';
import { splitRepoDoc } from './utils.js';
import {
  getUser,
  listRepos as apiListRepos,
  listDocs as apiListDocs,
  searchDocs as apiSearchDocs,
  getDoc,
  createDoc as apiCreateDoc
} from './api.js';

export function createCommands(deps = {}) {
  const {
    getUserFn = getUser,
    listReposFn = apiListRepos,
    listDocsFn = apiListDocs,
    searchDocsFn = apiSearchDocs,
    getDocFn = getDoc,
    createDocFn = apiCreateDoc,
    splitRepoDocFn = splitRepoDoc,
    openUrlFn = open
  } = deps;

  async function whoami() {
    return await getUserFn();
  }

  async function listRepos() {
    return await listReposFn();
  }

  async function listDocs(repo) {
    return await listDocsFn(repo);
  }

  async function searchDocs(repo, q) {
    return await searchDocsFn(repo, q);
  }

  async function openDoc(input, fallbackRepo = null) {
    const parsed = splitRepoDocFn(input);
    const repo = parsed?.repo || fallbackRepo;
    const slug = parsed?.doc || input;
    if (!repo || !slug) {
      throw new Error('Use <repo>/<doc> format or set current repo');
    }
    const doc = await getDocFn(repo, slug);
    const finalUrl = doc?.url || `https://www.yuque.com/${repo}/${slug}`;
    await openUrlFn(finalUrl);
    return { ...(doc || {}), url: finalUrl };
  }

  async function readDoc(repo, slug) {
    return await getDocFn(repo, slug);
  }

  async function createDoc(repo, payload) {
    return await createDocFn(repo, payload);
  }

  return {
    whoami,
    listRepos,
    listDocs,
    searchDocs,
    openDoc,
    readDoc,
    createDoc
  };
}

const defaultCommands = createCommands();

export const {
  whoami,
  listRepos,
  listDocs,
  searchDocs,
  openDoc,
  readDoc,
  createDoc
} = defaultCommands;
