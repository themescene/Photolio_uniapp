/**
 * 创作链路 API：上传图片分析 + 录音/ASR + 生成报告 + 保存分享。
 *
 * Phase 3：
 *   - 增加 processRound：multipart 上传 audio + image，后端 ASR + OCR 一体
 *   - saveShare 增加 auto_play_audio / personal_pinned 字段
 */
import { request, uploadFile } from './request'
// request 必须显式导入（analyzeImageUrl 用 request 不用 uploadFile）
import type {
  AnalyzeImageResult,
  AnnualReport,
  ReportRequestRound,
  SavedShare,
} from '@/types'

export function analyzeImage(
  filePath: string,
  sessionId: string,
  onProgress?: (p: number) => void,
  originalQuality?: boolean,
  originalFilenameOverride?: string,
  noRetry?: boolean,
) {
  // 2026-07-13：与 uploadImage 一样支持 ?original=true 让 backend 跳过压缩
  // 之前 analyzeImage 没接原图开关 → 首图（analyze-image）永远被压缩，而后续图（upload-image）
  // 才生效原图；用户反馈"开了原图似乎仍然是压缩过的图"就是首图漏改这条链路
  // 2026-07-15：与 uploadImage 同样接受 originalFilenameOverride（chooseMessageFile 真名）
  // 2026-08-10：analyze 是 nice-to-have（visual_tags/ocr 不是硬需求），
  //   外层有 race+timeout+fallback 兜底时传 noRetry=true 避免 3 次重试放大耗时
  const path = originalQuality ? '/analyze-image?original=true' : '/analyze-image'
  const original_filename = originalFilenameOverride
    || filePath.split(/[\\/]/).pop()
    || ''
  return uploadFile<AnalyzeImageResult>({
    path,
    filePath,
    name: 'image',
    formData: { session_id: sessionId, original_filename },
    requireAuth: false,
    onProgress,
    noRetry,
  })
}

/** upload-image 后端 2026-07-13 起在响应里附带 EXIF/文件元信息（相册列表视图用） */
export interface UploadImageResult {
  image_url: string
  thumbnail_url?: string
  original_filename?: string
  size_bytes?: number
  taken_at?: string
  has_gps?: boolean
  camera_model?: string
}
export function uploadImage(
  filePath: string,
  sessionId: string,
  onProgress?: (p: number) => void,
  originalQuality?: boolean,
  originalFilenameOverride?: string,
) {
  // 2026-07-13：原图/相册模式带 ?original=true → 后端跳过 _compress_image_if_large，
  // 完整保留 EXIF + 原文件名（file_media_repository._compress_image_if_large 现在也
  // 附带 exif 塞回；两处都得配合才能保证真的不动原图）
  const path = originalQuality ? '/upload-image?original=true' : '/upload-image'
  // 2026-07-14：优先用 originalFilenameOverride（chooseMessageFile 能拿到真实文件名 "IMG_20250712_143022.jpg"），
  // 否则回退到 tempFilePath basename（chooseMedia / chooseImage 只能拿到 "tmp_xxxx.jpg" 哈希名）
  const original_filename = originalFilenameOverride
    || filePath.split(/[\\/]/).pop()
    || ''
  return uploadFile<UploadImageResult>({
    path,
    filePath,
    name: 'image',
    formData: { session_id: sessionId, original_filename },
    requireAuth: false,
    onProgress,
  })
}

/**
 * 对服务器上已有的 URL（视频转码后的 thumbnail / cover_only 帧）做 AI 分析。
 * 对齐网页端 MediaAiPanel.analyzeVideoThumbnail（POST /analyze-image-url）。
 * 视频场景下网页端 frontend 强制把 visual_tags / ocr_text 置空（只取 description / comment /
 * memory_questions 喂 UI 的记忆问题）；photolio 不展示记忆问题，因此**保留后端返回的
 * visual_tags 和 ocr_text** 用来喂 generate-report，让 AI 真正"看"到视频内容。
 */
export interface AnalyzeImageUrlResult {
  description: string
  comment: string
  memory_questions?: string[]
  visual_tags?: string[]
  ocr_text?: string
  image_url?: string
  thumbnail_url?: string
}
export function analyzeImageUrl(imageUrl: string, lang: 'zh' | 'en' = 'zh') {
  return request<AnalyzeImageUrlResult>({
    method: 'POST',
    path: '/analyze-image-url',
    body: { image_url: imageUrl, lang },
    requireAuth: false,
  })
}

/** /api/process-round：multipart 上传单轮的音频 + 已上传图片 url 列表，后端 ASR 后回填 round */
export interface ProcessRoundResponse {
  session_id: string
  round_index: number
  asr_text: string
  audio_duration: number
  audio_url: string
  image_urls?: string[]
  image_tags?: { image_index: number; ocr_text: string; visual_tags: string[] }[]
}
export interface ProcessRoundPayload {
  sessionId: string
  roundIndex: number
  audioFilePath: string
  imageAlreadyUploaded: boolean
  imageUrl?: string
  lang?: 'zh' | 'en'
}
export function processRound(p: ProcessRoundPayload) {
  return uploadFile<ProcessRoundResponse>({
    path: '/process-round',
    filePath: p.audioFilePath,
    name: 'audio',
    formData: {
      session_id: p.sessionId,
      round_index: p.roundIndex,
      image_already_uploaded: p.imageAlreadyUploaded ? 'true' : 'false',
      image_url: p.imageUrl ?? '',
      lang: p.lang ?? 'zh',
    },
    requireAuth: false,
  })
}

export interface GenerateReportPayload {
  session_id: string
  rounds: ReportRequestRound[]
  style?: string
  preferred_template?: string
  lang?: 'zh' | 'en'
}

export function generateReport(payload: GenerateReportPayload) {
  return request<AnnualReport>({
    method: 'POST',
    path: '/generate-report',
    body: payload,
    requireAuth: false,
  })
}

export interface SaveSharePayload {
  session_id: string
  report: AnnualReport
  cover_thumbnail?: string
  /** 既有NFC独立媒体存档，与网页版saveToServer保持一致。 */
  nfc_fullscreen?: boolean
  group_id?: string
  author_display_name?: string
  personal_pinned?: boolean
  auto_play_audio?: boolean
  original_quality?: boolean
  /** 2026-07-13：'memory' 或 'album'（相册模式跳过 report_data 强校验） */
  share_type?: 'memory' | 'album'
  /** 2026-07-13：visibility 0-3；见 PermissionSheet */
  visibility?: 0 | 1 | 2 | 3
  /** 2026-07-13：access_level 0-2 */
  access_level?: 0 | 1 | 2
}

export function saveShare(payload: SaveSharePayload) {
  return request<SavedShare>({
    method: 'POST',
    path: '/save-share',
    body: payload,
  })
}

export function newSessionId(): string {
  const rand = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')
  return `s_${Date.now().toString(36)}_${rand()}${rand()}`
}
