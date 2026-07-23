import type { YuqueHttp } from '../http.js';
import { repoBasePath, type RepoRef } from '../repo-ref.js';
import type { ApiEnvelope, V2TocItem } from '../types.js';

/** Body for PUT /repos/.../toc — mirrors the spec requestBody field-for-field. */
export interface TocUpdateBody {
  action: 'appendNode' | 'prependNode' | 'editNode' | 'removeNode';
  action_mode?: 'sibling' | 'child';
  target_uuid?: string;
  node_uuid?: string;
  /** Deprecated in the spec in favor of doc_ids. */
  doc_id?: number;
  doc_ids?: number[];
  type?: 'DOC' | 'LINK' | 'TITLE';
  title?: string;
  url?: string;
  open_window?: number;
  visible?: number;
}

export async function getToc(http: YuqueHttp, repo: RepoRef): Promise<V2TocItem[]> {
  const res = await http.get<ApiEnvelope<V2TocItem[]>>(`${repoBasePath(repo)}/toc`);
  return res.data;
}

export async function updateToc(
  http: YuqueHttp,
  repo: RepoRef,
  body: TocUpdateBody
): Promise<V2TocItem[]> {
  const res = await http.put<ApiEnvelope<V2TocItem[]>>(`${repoBasePath(repo)}/toc`, body);
  return res.data;
}
