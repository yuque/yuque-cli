import type { YuqueHttp } from '../http.js';
import type { ApiEnvelope, V2Group, V2User } from '../types.js';

export interface HelloData {
  message?: string;
  [key: string]: unknown;
}

/** GET /hello — heartbeat, returns a greeting for the authenticated token. */
export async function hello(http: YuqueHttp): Promise<HelloData> {
  const res = await http.get<ApiEnvelope<HelloData>>('/hello');
  return res.data;
}

/** GET /user — the user that owns the current token. */
export async function getCurrentUser(http: YuqueHttp): Promise<V2User> {
  const res = await http.get<ApiEnvelope<V2User>>('/user');
  return res.data;
}

export interface ListUserGroupsParams {
  /** Role filter: 0 admin, 1 member. */
  role?: number;
  offset?: number;
}

/** GET /users/{id}/groups — groups a user belongs to; `user` is a login or numeric id. */
export async function listUserGroups(
  http: YuqueHttp,
  user: string,
  params: ListUserGroupsParams = {}
): Promise<V2Group[]> {
  const res = await http.get<ApiEnvelope<V2Group[]>>(`/users/${encodeURIComponent(user)}/groups`, {
    role: params.role,
    offset: params.offset,
  });
  return res.data;
}
