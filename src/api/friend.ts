/**
 * 好友系统 API 封装（2026-07-13 加入）
 *
 * 后端路由：F:\xiedao\vue\demo\arbackend\src\presentation\controllers\friend_controller.py
 * 数据实体：F:\xiedao\vue\demo\arbackend\src\data\entities\friend_entity.py
 */
import { request } from "./request";

export interface FriendProfile {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  accepted_at: string | null;
  friendship_id: string;
}

export interface IncomingRequest {
  friendship_id: string;
  from_user_id: string;
  from_nickname: string;
  from_avatar_url: string | null;
  created_at: string;
}

export interface OutgoingRequest {
  friendship_id: string;
  to_user_id: string;
  to_nickname: string;
  to_avatar_url: string | null;
  created_at: string;
}

export interface FriendListResp {
  friends: FriendProfile[];
  incoming: IncomingRequest[];
  outgoing: OutgoingRequest[];
}

export interface UserProfileLite {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
}

/** 拉「我的好友 + 收到的请求 + 发出的请求」全部 */
export function fetchFriendList(): Promise<FriendListResp> {
  return request<FriendListResp>({
    method: "GET",
    path: "/friend/list",
    requireAuth: true,
  });
}

/** 通过 user_id 或 username 精确查找一个用户（用于加好友输入框） */
export function searchUserForAdd(q: string): Promise<UserProfileLite | null> {
  return request<{ profile: UserProfileLite | null }>({
    method: "GET",
    path: "/friend/search",
    query: { q },
    requireAuth: true,
  }).then((r) => r.profile);
}

/** 发起好友请求 */
export function sendFriendRequest(
  targetUserId: string,
): Promise<{ friendship_id: string; status: string }> {
  return request({
    method: "POST",
    path: "/friend/request",
    requireAuth: true,
    body: { target_user_id: targetUserId },
  });
}

/** 接受好友请求（我是接收方） */
export function acceptFriendRequest(
  friendshipId: string,
): Promise<{ friendship_id: string; status: string }> {
  return request({
    method: "POST",
    path: `/api/friend/${encodeURIComponent(friendshipId)}/accept`,
    requireAuth: true,
  });
}

/** 拒绝 / 撤回 / 解除好友（同一个 endpoint） */
export function removeFriendship(friendshipId: string): Promise<void> {
  return request({
    method: "DELETE",
    path: `/api/friend/${encodeURIComponent(friendshipId)}`,
    requireAuth: true,
  }) as unknown as Promise<void>;
}
