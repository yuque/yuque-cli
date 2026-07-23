import type { YuqueHttp } from '../http.js';
import { repoBasePath, type RepoRef } from '../repo-ref.js';
import type { ApiEnvelope, V2Book, V2BookDetail } from '../types.js';

/** The spec exposes list/create under both /users/:login and /groups/:login. */
export type RepoOwner = 'user' | 'group';

function ownerReposPath(owner: RepoOwner, login: string): string {
  return `/${owner === 'group' ? 'groups' : 'users'}/${encodeURIComponent(login)}/repos`;
}

export interface ListReposOptions {
  offset?: number;
  limit?: number;
  /** Spec enum: Book | Design. Omit for no server-side filter. */
  type?: string;
  /** e.g. `create_doc` — only repos where the token holds that ability. */
  filterByAbility?: string;
}

export async function listRepos(
  http: YuqueHttp,
  owner: RepoOwner,
  login: string,
  options: ListReposOptions = {}
): Promise<V2Book[]> {
  const params: Record<string, unknown> = {};
  if (options.offset !== undefined) params.offset = options.offset;
  if (options.limit !== undefined) params.limit = options.limit;
  if (options.type !== undefined) params.type = options.type;
  if (options.filterByAbility !== undefined) params.filterByAbility = options.filterByAbility;
  const res = await http.get<ApiEnvelope<V2Book[]>>(ownerReposPath(owner, login), params);
  return res.data;
}

export async function getRepo(http: YuqueHttp, ref: RepoRef): Promise<V2BookDetail> {
  const res = await http.get<ApiEnvelope<V2BookDetail>>(repoBasePath(ref));
  return res.data;
}

export interface CreateRepoBody {
  name: string;
  slug: string;
  description?: string;
  public?: number;
  enhancedPrivacy?: boolean;
}

export async function createRepo(
  http: YuqueHttp,
  owner: RepoOwner,
  login: string,
  body: CreateRepoBody
): Promise<V2Book> {
  const res = await http.post<ApiEnvelope<V2Book>>(ownerReposPath(owner, login), body);
  return res.data;
}

export interface UpdateRepoBody {
  name?: string;
  slug?: string;
  description?: string;
  public?: number;
  toc?: string;
}

export async function updateRepo(
  http: YuqueHttp,
  ref: RepoRef,
  body: UpdateRepoBody
): Promise<V2Book> {
  const res = await http.put<ApiEnvelope<V2Book>>(repoBasePath(ref), body);
  return res.data;
}

export async function deleteRepo(http: YuqueHttp, ref: RepoRef): Promise<V2Book> {
  const res = await http.delete<ApiEnvelope<V2Book>>(repoBasePath(ref));
  return res.data;
}
