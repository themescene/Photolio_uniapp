/**
 * 群组 / 文件夹 API。
 *
 * 对齐网页端 [annualreport/src/views/UploadView.vue:107-150]：
 *   GET /user/groups → { groups: GroupInfo[] }
 *   DELETE /group/<id>/my-share?share_id=xxx → 删除群组里的我的画匣子
 */
import { request } from './request'
import type { GroupInfo } from '@/types'

export function fetchMyGroups() {
  return request<{ groups: GroupInfo[] }>({
    method: 'GET',
    path: '/user/groups',
  })
}

export function deleteMyShareInGroup(groupId: string, shareId: string) {
  return request({
    method: 'DELETE',
    path: `/group/${groupId}/my-share`,
    query: { share_id: shareId },
  })
}

/**
 * 把当前用户在该 share 上的「群组归属」解除：group_id 置 null + personal_pinned 置 true。
 * 后端会顺便检查群组是否已空，若空则删除群组元数据。
 * 前端「删除合集」= 遍历合集里"我"拥有的所有 share，每个都调这个接口，
 * 让画匣子回落成独立单个画匣子（对齐用户需求：合集消失但画匣子还在）。
 */
export function leaveGroup(shareId: string) {
  return request({
    method: 'PUT',
    path: `/share/${shareId}/leave-group`,
  })
}

// 对齐网页端 GroupView.vue:39 + ShareModal.vue:165
// 集合详情：拉集合内所有画匣子（章节顺序）
export interface GroupMemory {
  share_id: string
  title: string
  cover_url?: string | null
  author_name?: string
  // backend 已经返回 author_user_id（group_service.get_group_memories:137），
  // 前端用它判定"这章是不是我写的" → 决定是否显示删除按钮
  author_user_id?: string
  chapter_index?: number
  created_at?: string
}

export function fetchGroupMemories(groupId: string) {
  return request<{ memories: GroupMemory[]; max_members?: number | null }>({
    method: 'GET',
    path: `/group/${groupId}/memories`,
    requireAuth: false,
  })
}

/** 2026-07-19：合集重命名（仅 owner），backend 写 group.custom_name。 */
export function renameGroup(groupId: string, name: string) {
  return request<{ group_id: string; custom_name: string }>({
    method: 'PUT',
    path: `/group/${groupId}`,
    body: { name },
  })
}
