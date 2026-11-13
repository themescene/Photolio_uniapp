/**
 * 画匣子 (share) 相关 API。
 *
 * 对齐网页端 [annualreport/src/views/UploadView.vue + ShareModal.vue]：
 *   GET    /user/shares?type=personal|liked → { shares: ShareListItem[] }
 *   GET    /share/<id> → ShareDetail
 *   GET    /share/<id>/permissions → EditPermissions
 *   POST   /share/<id>/begin-edit → 拿编辑锁
 *   POST   /share/<id>/end-edit → 释放编辑锁
 *   PUT    /share/<id>/update body: { report_title, episode_patch, ... }
 *   DELETE /share/<id>
 *   DELETE /share/<id>/unlike
 */
import { request, uploadFile } from './request'
import { VIDEO_UPLOAD_BASE } from '@/config/env'
import type { ShareListItem, ShareDetail } from '@/types'

export function fetchMyShares(type: 'all' | 'personal' | 'liked' = 'personal') {
  return request<{ shares: ShareListItem[] }>({
    method: 'GET',
    path: '/user/shares',
    query: { type },
  })
}

export function fetchShare(shareId: string) {
  return request<ShareDetail>({
    method: 'GET',
    path: `/share/${shareId}`,
    requireAuth: false,
  })
}

export function deleteShare(shareId: string) {
  return request({
    method: 'DELETE',
    path: `/share/${shareId}`,
  })
}

export function unlikeShare(shareId: string) {
  return request({
    method: 'DELETE',
    path: `/share/${shareId}/unlike`,
  })
}

/** 加入喜欢 —— 后端 "喜欢" 语义即 "把当前用户加入 share.editors"，与网页端一致
 *  返回 { already_saved: true } 表示幂等；owner 自己触发时后端返回 already_saved=true 不报错。
 *  对应端点：POST /share/<id>/save-to-collection，同 unlike 是一对反操作。 */
export function likeShare(shareId: string) {
  return request<{ already_saved?: boolean }>({
    method: 'POST',
    path: `/share/${shareId}/save-to-collection`,
  })
}

// ============ 编辑相关 ============

/** 编辑权限：can_edit / is_owner / editing_lock 等
 *
 * 2026-07-13 加入 visibility / access_level / share_type 三档，backend
 * 返回时会附带（若旧数据无字段，取默认 with_link + edit_and_share + memory）。
 */
export interface EditPermissions {
  can_edit: boolean
  is_owner: boolean
  is_editor: boolean
  editing_lock: { user_id: string; locked_at: string } | null
  lock_is_mine?: boolean
  lock_is_stale?: boolean
  /** 2026-07-13：可见性档位 0-3（见 PermissionSheet） */
  visibility?: 0 | 1 | 2 | 3
  /** 2026-07-13：权限等级 0-2 */
  access_level?: 0 | 1 | 2
  /** 2026-07-13：'memory' | 'album' */
  share_type?: 'memory' | 'album'
  /** 2026-07-19：贴一贴权限（NFC 触达者的能力档），独立轴 */
  nfc_access?: 'off' | 'view' | 'edit'
}

export function fetchPermissions(shareId: string) {
  // 2026-08-10：未登录也允许调（backend 允许 no-token，返回 can_edit=false + access_level=<manifest 值>）
  // 前端 canContribute 现在只看 access_level → 未登录用户也能看到「追加」入口，点击时再弹登录
  return request<EditPermissions>({
    method: 'GET',
    path: `/share/${shareId}/permissions`,
    requireAuth: false,
  })
}

/** 2026-07-13：更新 share 的 visibility / access_level（仅 owner）
 * 2026-07-19：加 nfc_access（贴一贴权限独立轴）
 */
export interface PermissionsUpdatePayload {
  visibility?: 0 | 1 | 2 | 3
  access_level?: 0 | 1 | 2
  nfc_access?: 'off' | 'view' | 'edit'
}
export function updateSharePermissions(shareId: string, payload: PermissionsUpdatePayload) {
  return request<{ visibility: number; access_level: number; nfc_access: string }>({
    method: 'PUT',
    path: `/share/${shareId}/permissions`,
    body: payload,
  })
}

/** 2026-07-13：相册模式批量打包下载（返回临时 zip URL） */
export function requestAlbumBatchDownload(shareId: string, mediaUrls: string[]) {
  return request<{ zip_url: string; file_count: number }>({
    method: 'POST',
    path: `/share/${shareId}/album-download`,
    body: { media_urls: mediaUrls, preserve_filenames: true },
  })
}

/** 2026-07-13：好友画匣子流（发现流）—— 画匣子好友 + 曾互相看过 share 的微信用户的最近发布 */
export interface FriendFeedItem {
  share_id: string
  author_user_id: string
  report_title: string
  created_at: string
  cover_image?: string
  share_type: 'memory' | 'album'
}
export function fetchFriendsFeed(limit = 60) {
  return request<{ items: FriendFeedItem[] }>({
    method: 'GET',
    path: `/friends-feed?limit=${limit}`,
  }).then((r) => r.items)
}

export function beginEdit(shareId: string) {
  return request({
    method: 'POST',
    path: `/share/${shareId}/begin-edit`,
  })
}

export function endEdit(shareId: string) {
  return request({
    method: 'POST',
    path: `/share/${shareId}/end-edit`,
  })
}

/** 编辑更新接口
 *
 * 对齐网页端 ShareModal.vue:552-611 saveEdit() 的 payload 结构：
 *   {
 *     report_title?: string,
 *     report_style?: StyleKey | null,
 *     personal_pinned?: boolean,
 *     author_display_name?: string,
 *     episode_patch?: {
 *       episode_id: string,
 *       copywriting: { h1, h2, body, style },
 *       template_id, audio_url, images, show_audio
 *     }
 *   }
 */
export interface ShareUpdatePayload {
  report_title?: string
  report_style?: string | null
  personal_pinned?: boolean
  author_display_name?: string
  /** 完整替换整个 episodes 数组（删除章节场景） */
  episodes?: unknown[]
  episode_patch?: {
    /**
     * 主 episode（老数据，没显式 episode_id）在 backend 是 None，body 里传 null 或
     * 省略字段都能命中（backend `ep.get('episode_id') == ep_id` 走 None == None）。
     * append-section 建的 episode 是数字。**不是 string** —— 之前 TS 声明错。
     */
    episode_id?: number | null
    copywriting?: { h1?: string; h2?: string; body?: string; style?: string | null }
    template_id?: string
    audio_url?: string
    audio_duration?: number
    images?: unknown[]
    show_audio?: boolean
  }
}

export function updateShare(shareId: string, payload: ShareUpdatePayload) {
  return request({
    method: 'PUT',
    path: `/share/${shareId}/update`,
    body: payload,
  })
}

// ============ 非 owner 追加新 episode（section） ============
// 契约（backend share_service.append_episode_section）：
//   - 必须是 editor（含 owner），无编辑权限 403
//   - 新 episode.author_id = 当前用户，独立追加不影响已有 episode
//   - 相册模式：非 owner append-section 建带 images 的新 episode；
//     前端 album/index.vue mediaList 聚合所有 episode.images 显示
// 为什么不能用 update-share + episode_patch：那条路径要求 episode.author_id === user_id，
// 非 owner 改 owner 的 episode 会被拒 "无权修改他人的回忆段落"（用户 2026-09-16 实测踩到）。
export interface AppendSectionRequest {
  display_name?: string
  template_id?: string
  copywriting?: { h1?: string; h2?: string; body?: string; style?: string | null }
  audio_url?: string
  audio_duration?: number
  images?: Array<Record<string, unknown>>
}
export function appendShareSection(shareId: string, section: AppendSectionRequest) {
  return request<{ episode_id: number }>({
    method: 'POST',
    path: `/share/${shareId}/append-section`,
    body: section,
  })
}

// ============ 编辑期图片上传（不分析） ============
// 对齐网页端 ShareModal.vue:746 uploadEpisodeImage —— /upload-image + analyze=0
export interface UploadImageResult {
  image_url: string
  thumbnail_url?: string
}

export function uploadShareImage(filePath: string, sessionId: string) {
  return uploadFile<UploadImageResult>({
    path: '/upload-image',
    filePath,
    name: 'image',
    formData: { session_id: sessionId, analyze: 0 },
  })
}

// ============ 编辑期视频上传 + 转码轮询 ============
// 对齐网页端 ShareModal.vue:802 uploadEpisodeVideo
export interface VideoUploadResult {
  job_id: string
}
export interface VideoStatusResult {
  status: 'pending' | 'transcoding' | 'done' | 'error'
  output_size_mb?: number
  video_url?: string
  thumbnail_url?: string | null
  message?: string
  /** 2026-07-13：相册模式 list 视图所需的元信息（backend `_process_video_bg` 打包写入） */
  original_filename?: string
  size_bytes?: number
  taken_at?: string | null
  duration?: number
  resolution?: string
}

export function uploadShareVideo(
  filePath: string,
  sessionId: string,
  onProgress?: (p: number) => void,
  originalQuality = false,
  originalFilenameOverride?: string,
) {
  // 2026-07-14：chooseMessageFile 能拿到真名（含 EXIF/mediainfo），传给后端做 display_filename
  const extraForm: Record<string, string | number> = {
    session_id: sessionId,
    ...(originalQuality ? { original_quality: '1' } : {}),
    ...(originalFilenameOverride ? { original_filename: originalFilenameOverride } : {}),
  }
  return uploadFile<VideoUploadResult>({
    path: '/upload-video',
    filePath,
    name: 'video',
    // original_quality=1 时后端跳过重编码（h264/mp4 直接保留、h264/mov -c copy 换容器），
    // 用户勾了「使用原图」就应该拿到原始画质，之前只写 manifest 元数据没用 —— hotfix6 修
    formData: extraForm,
    baseURL: VIDEO_UPLOAD_BASE,
    timeout: 600_000,
    onProgress,
  })
}

export function pollVideoStatus(jobId: string) {
  return request<VideoStatusResult>({
    method: 'GET',
    path: `/video-status/${jobId}`,
    baseURL: VIDEO_UPLOAD_BASE,
    requireAuth: false,
  })
}

// ============ 邀请共编 ============
// 对齐网页端 ShareModal.vue:90 / InviteEditModal.vue:57 — POST /share/:id/invite
export interface InviteCodeResult { code: string }

export function inviteShare(shareId: string, maxEditors: number | null = null) {
  return request<InviteCodeResult>({
    method: 'POST',
    path: `/share/${shareId}/invite`,
    body: { max_editors: maxEditors },
  })
}

/** 邀请共创：受邀者打开带 invite 参数的卡片后调用，把当前用户加入 share 集合
 *  对齐 annualreport/src/views/SharePlayView.vue:440 consumeInviteCode */
export interface AcceptInviteResult {
  group_id?: string
  group_name?: string
  is_self?: boolean
}

export function acceptInvite(shareId: string, inviteCode: string) {
  return request<AcceptInviteResult>({
    method: 'POST',
    path: `/share/${shareId}/join-group`,
    body: { invite_code: inviteCode },
  })
}

/**
 * 「智能标题」：让后端用首图 / 正文生成一个更"活"的标题（2026-09-14）。
 *
 * 背景：保存时的自动起名已按用户契约默认关闭（默认不 AI 起名）。
 * 这是它的显式入口 —— 用户在主页长按卡片菜单里主动点了才跑。
 */
export function autoTitleShare(shareId: string) {
  return request<{ report_title: string }>({
    method: 'POST',
    path: `/share/${encodeURIComponent(shareId)}/auto-title`,
  })
}
