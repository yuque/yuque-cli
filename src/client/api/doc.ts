import type { YuqueHttp } from '../http.js';
import type {
  ApiEnvelope,
  V2Doc,
  V2DocDetail,
  V2DocVersion,
  V2DocVersionDetail,
} from '../types.js';
import { repoBasePath, type RepoRef } from '../repo-ref.js';

/** Query parameters of GET {repo}/docs, mirroring the spec. */
export interface DocListParams {
  offset?: number;
  limit?: number;
  deleted?: boolean;
  changed_at_gte?: string;
  optional_properties?: string;
  // Structural bridge to YuqueHttp's Record<string, unknown> params.
  [key: string]: unknown;
}

/** Request body of doc create/update; create requires `body`, update sends only set fields. */
export interface DocWritePayload {
  title?: string;
  slug?: string;
  body?: string;
  format?: string;
  public?: number;
}

export async function listDocs(
  http: YuqueHttp,
  repo: RepoRef,
  params: DocListParams = {}
): Promise<V2Doc[]> {
  const res = await http.get<ApiEnvelope<V2Doc[]>>(`${repoBasePath(repo)}/docs`, params);
  return res.data;
}

export async function getDoc(http: YuqueHttp, repo: RepoRef, doc: string): Promise<V2DocDetail> {
  const res = await http.get<ApiEnvelope<V2DocDetail>>(
    `${repoBasePath(repo)}/docs/${encodeURIComponent(doc)}`
  );
  return res.data;
}

/** Fetch a doc by its globally unique numeric id (no repo needed). */
export async function getDocById(http: YuqueHttp, id: number): Promise<V2DocDetail> {
  const res = await http.get<ApiEnvelope<V2DocDetail>>(`/repos/docs/${id}`);
  return res.data;
}

export async function createDoc(
  http: YuqueHttp,
  repo: RepoRef,
  payload: DocWritePayload
): Promise<V2DocDetail> {
  const res = await http.post<ApiEnvelope<V2DocDetail>>(`${repoBasePath(repo)}/docs`, payload);
  return res.data;
}

export async function updateDoc(
  http: YuqueHttp,
  repo: RepoRef,
  doc: string,
  payload: DocWritePayload
): Promise<V2DocDetail> {
  const res = await http.put<ApiEnvelope<V2DocDetail>>(
    `${repoBasePath(repo)}/docs/${encodeURIComponent(doc)}`,
    payload
  );
  return res.data;
}

export async function deleteDoc(http: YuqueHttp, repo: RepoRef, doc: string): Promise<V2DocDetail> {
  const res = await http.delete<ApiEnvelope<V2DocDetail>>(
    `${repoBasePath(repo)}/docs/${encodeURIComponent(doc)}`
  );
  return res.data;
}

export async function listDocVersions(http: YuqueHttp, docId: number): Promise<V2DocVersion[]> {
  const res = await http.get<ApiEnvelope<V2DocVersion[]>>('/doc_versions', { doc_id: docId });
  return res.data;
}

export async function getDocVersion(http: YuqueHttp, id: number): Promise<V2DocVersionDetail> {
  const res = await http.get<ApiEnvelope<V2DocVersionDetail>>(`/doc_versions/${id}`);
  return res.data;
}
