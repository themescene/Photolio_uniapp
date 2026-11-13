/**
 * NFC 相关 API。
 */
import { request, uploadFile } from './request'
import { VIDEO_UPLOAD_BASE } from '@/config/env'
import type { NfcResolveResult } from '@/types'

/**
 * 用 14 位 hex UID 查 preset 状态。
 * - 首次（empty）：后端自动创建空壳记录
 * - 已绑定（filled）：返回 bound_type + bound_share_id / bound_url
 *
 * 无需登录。
 */
export function resolveNfcUid(uid: string) {
  return request<NfcResolveResult>({
    method: 'GET',
    path: `/nfc/${uid}`,
    requireAuth: false,
  })
}

/**
 * 把一张片语绑定到 NFC preset（preset_id = NFC UID）。
 * 后端策略：物理持卡 = 授权，任何登录用户都能绑。
 */
export function bindPresetToShare(presetId: string, shareId: string) {
  return request<{
    preset_id: string
    bound_share_id: string
    bound_type: string
    status: string
  }>({
    method: 'POST',
    path: `/preset/${presetId}/bind`,
    body: { share_id: shareId, bound_type: 'share' },
    requireAuth: false,
  })
}

// ============ NFC 直链绑定（视频 / 音频 / 文件） ============
// 对齐网页端 NfcLandingView.vue:338 → POST /preset/<id>/bind { bound_type: 'nfc', bound_url, nfc_media_type }
export type NfcMediaType = 'video' | 'audio' | 'file'

export function bindPresetToNfcUrl(
  presetId: string,
  boundUrl: string,
  mediaType: NfcMediaType,
) {
  return request<{ preset_id: string; bound_type: string; status: string }>({
    method: 'POST',
    path: `/preset/${presetId}/bind`,
    body: { bound_type: 'nfc', bound_url: boundUrl, nfc_media_type: mediaType },
    requireAuth: false,
  })
}

// 网页端用 POST /api/nfc/<uid>/reset 把已绑定卡重置回 empty（修改 NFC 匣子内容）
export function resetNfcCard(uid: string) {
  return request({
    method: 'POST',
    path: `/nfc/${uid}/reset`,
    requireAuth: false,
  })
}

// ============ 烧卡助手：14 位 hex UID → 永久 weixin scheme ============
// 仅 entitlement 含 preset_links 的用户在 NFC 烧卡助手页调用。
// 后端在 nfc_redirect_controller.py:get_nfc_scheme，sn 即 UID，scheme 永久落库。
export interface NfcSchemeResult {
  uid: string
  scheme: string
}

export function fetchNfcScheme(uid: string) {
  return request<NfcSchemeResult>({
    method: 'GET',
    path: '/nfc-scheme',
    query: { uid },
  })
}

// ============ NFC 音频 / 文件上传（视频走 share.uploadShareVideo） ============
// 端点对齐网页端 NfcLandingView.vue:217 / :246
export interface NfcAudioUploadResult {
  audio_url: string
  duration?: number
  size_mb?: number
}
export interface NfcFileUploadResult {
  file_url: string
  size_mb?: number
  original_name?: string
}

export function uploadNfcAudio(filePath: string, onProgress?: (p: number) => void) {
  return uploadFile<NfcAudioUploadResult>({
    path: '/upload-nfc-audio',
    filePath,
    name: 'audio',
    baseURL: VIDEO_UPLOAD_BASE,
    timeout: 180_000,
    onProgress,
  })
}

export function uploadNfcFile(
  filePath: string,
  onProgress?: (p: number) => void,
  originalName?: string,
) {
  // 2026-08-11：chooseMessageFile 拿到的真名（如"报告.docx"）必须通过 formData 传给后端，
  //   因为 uni.uploadFile 送的 multipart filename 是 wxfile tempFilePath basename（tmp_xxx.docx）
  //   backend 优先读 formData.original_name 用作 safe_name（Bug 6 根治）
  return uploadFile<NfcFileUploadResult>({
    path: '/upload-nfc-file',
    filePath,
    name: 'file',
    formData: originalName ? { original_name: originalName } : {},
    baseURL: VIDEO_UPLOAD_BASE,
    timeout: 300_000,
    onProgress,
  })
}
