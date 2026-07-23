import type { YuqueHttp } from '../http.js';
import type {
  ApiEnvelope,
  V2BookStatistics,
  V2DocStatistics,
  V2GroupStatistics,
  V2MemberStatistics,
} from '../types.js';

/** Query filters shared by the members/books/docs statistics list endpoints. */
export interface StatsListParams {
  name?: string;
  /** 0 = all time, 30 = last 30 days, 365 = last year. */
  range?: number;
  page?: number;
  /** The statistics endpoints cap this at 20 (spec maximum). */
  limit?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DocStatsListParams extends StatsListParams {
  bookId?: number;
}

// The spec declares the list payloads' item field as a single object, but the
// live API returns an array; typed as arrays here on purpose.
export interface MemberStatsPage {
  members: V2MemberStatistics[];
  total?: number;
  [key: string]: unknown;
}

export interface BookStatsPage {
  books: V2BookStatistics[];
  total?: number;
  [key: string]: unknown;
}

export interface DocStatsPage {
  docs: V2DocStatistics[];
  total?: number;
  [key: string]: unknown;
}

function statsPath(login: string, suffix = ''): string {
  return `/groups/${encodeURIComponent(login)}/statistics${suffix}`;
}

/** Drop undefined values so unset optional flags never reach the query string. */
function compact(params: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined));
}

export async function getGroupStatistics(
  http: YuqueHttp,
  login: string
): Promise<V2GroupStatistics> {
  const res = await http.get<ApiEnvelope<V2GroupStatistics>>(statsPath(login));
  return res.data;
}

export async function listMemberStatistics(
  http: YuqueHttp,
  login: string,
  params: StatsListParams = {}
): Promise<MemberStatsPage> {
  const res = await http.get<ApiEnvelope<MemberStatsPage>>(
    statsPath(login, '/members'),
    compact(params)
  );
  return res.data;
}

export async function listBookStatistics(
  http: YuqueHttp,
  login: string,
  params: StatsListParams = {}
): Promise<BookStatsPage> {
  const res = await http.get<ApiEnvelope<BookStatsPage>>(
    statsPath(login, '/books'),
    compact(params)
  );
  return res.data;
}

export async function listDocStatistics(
  http: YuqueHttp,
  login: string,
  params: DocStatsListParams = {}
): Promise<DocStatsPage> {
  const res = await http.get<ApiEnvelope<DocStatsPage>>(statsPath(login, '/docs'), compact(params));
  return res.data;
}
