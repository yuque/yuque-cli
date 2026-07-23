import type { YuqueHttp } from '../http.js';
import type { ApiEnvelope, V2GroupUser } from '../types.js';

export interface GroupMemberListParams {
  /** Role filter: 0 admin, 1 member, 2 read-only. */
  role?: number;
  offset?: number;
}

function groupUsersPath(login: string, user?: string): string {
  const base = `/groups/${encodeURIComponent(login)}/users`;
  return user === undefined ? base : `${base}/${encodeURIComponent(user)}`;
}

export async function listGroupMembers(
  http: YuqueHttp,
  login: string,
  params: GroupMemberListParams = {}
): Promise<V2GroupUser[]> {
  const query: Record<string, unknown> = {};
  if (params.role !== undefined) query.role = params.role;
  if (params.offset !== undefined) query.offset = params.offset;
  const res = await http.get<ApiEnvelope<V2GroupUser[]>>(groupUsersPath(login), query);
  return res.data;
}

export async function updateGroupMember(
  http: YuqueHttp,
  login: string,
  user: string,
  role: number
): Promise<V2GroupUser> {
  const res = await http.put<ApiEnvelope<V2GroupUser>>(groupUsersPath(login, user), { role });
  return res.data;
}

export async function removeGroupMember(
  http: YuqueHttp,
  login: string,
  user: string
): Promise<{ user_id?: string }> {
  const res = await http.delete<ApiEnvelope<{ user_id?: string }>>(groupUsersPath(login, user));
  return res.data;
}
