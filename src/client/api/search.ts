import type { YuqueHttp } from '../http.js';
import type { ApiEnvelope, V2SearchResult } from '../types.js';

export interface SearchParams {
  q: string;
  type: 'doc' | 'repo';
  /** Namespace scope, e.g. `group` or `group/repo`; defaults to the current user/team. */
  scope?: string;
  /** Only results created by this login. */
  creator?: string;
  /** Page number (page size is fixed at 20 by the API). */
  page?: number;
}

/** GET /search — generic search over docs or repos. */
export async function search(http: YuqueHttp, params: SearchParams): Promise<V2SearchResult[]> {
  const res = await http.get<ApiEnvelope<V2SearchResult[]>>('/search', {
    q: params.q,
    type: params.type,
    scope: params.scope,
    creator: params.creator,
    page: params.page,
  });
  return res.data;
}
