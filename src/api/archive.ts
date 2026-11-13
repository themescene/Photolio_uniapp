/**
 * 冷存储归档 / 恢复 API —— 2026-07-25 hotfix13
 *
 * 商业契约（跟 backend 严格对齐）：
 * - 媒体上传 3 年后自动归档到用户家里硬盘（加密），云端删原文件
 * - 用户点"取回完整内容" → 请求进 restore queue → 后台 worker 从家里拉
 * - 家里在线：几十秒-几分钟；家里离线：排队等家里上线（12-24h）
 */
import { request } from './request'

/** 请求把 share 里所有 archived=true 的媒体取回来。返回 queue 状态。 */
export interface RestoreResult {
  status: 'queued' | 'already_queued' | 'nothing_to_restore'
  request_id?: string
  eta_hint?: string
  files_count?: number
  message?: string
}
export function requestRestoreMedia(shareId: string) {
  return request<RestoreResult>({
    method: 'POST',
    path: `/share/${shareId}/restore-media`,
  })
}

/** 轮询恢复进度。前端定时器每 5s 调一次。 */
export interface RestoreStatus {
  status: 'no_request' | 'queued' | 'in_progress' | 'done' | 'failed'
  request_id?: string
  eta_hint?: string
  attempts?: number
  last_error?: string
  total_files?: number
  done_files?: number
  requested_at?: string
}
export function getRestoreStatus(shareId: string) {
  return request<RestoreStatus>({
    method: 'GET',
    path: `/share/${shareId}/restore-status`,
    // 无需登录也能查（对齐 share 的 GET 权限）
    requireAuth: false,
  })
}

// ============ Dev endpoints（photolio2026 兑换码解锁 preset_links） ============

/** 立即归档指定 share 的所有媒体（跳过 3 年阈值，测试链路用） */
export function devArchiveShareNow(shareId: string) {
  return request<Record<string, unknown>>({
    method: 'POST',
    path: `/dev/share/${shareId}/archive-now`,
  })
}

/** 检查 rclone + 家里在线状态 */
export interface RcloneStatus {
  home_online: boolean
  message: string
  remote: string
  root: string
}
export function devGetRcloneStatus() {
  return request<RcloneStatus>({
    method: 'GET',
    path: '/dev/archive/rclone-status',
  })
}

/** dump 当前恢复队列（诊断） */
export function devDumpRestoreQueue() {
  return request<{ items: unknown[] }>({
    method: 'GET',
    path: '/dev/archive/queue',
  })
}
