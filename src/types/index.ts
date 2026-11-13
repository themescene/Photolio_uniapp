/**
 * 全局类型定义。
 *
 * 设计原则：
 * - 所有 API 响应数据类型在这里集中
 * - 类型按业务域分块（user / share / nfc / report / group / comment / preset）
 * - 平台相关类型（File、HTMLElement 等）不出现在这里
 */

// ============ 用户 ============

export interface CurrentUser {
  user_id: string
  username: string
  nickname: string
  default_display_name: string
  avatar_url: string | null
  has_password: boolean
  linked_wx: boolean
  linked_legacy_user_id: string | null
  phone: string | null
  email: string | null
  entitlements: string[]
  created_via: 'legacy' | 'wx' | 'phone' | 'email' | null
  /** @deprecated 2026-07-17 起改用 storage 汇总；保留字段兼容旧客户端读取 */
  weekly_media_used_bytes?: number
  /** @deprecated 同上 */
  weekly_media_limit_bytes?: number
  /** 2026-07-17：新存储额度模型（grant + 3 年 record TTL） */
  storage?: StorageUsageSummary
}

// ============ 存储额度（2026-07-17） ============

/** 一份"允许上传的容量池"（永不过期） */
export interface StorageGrant {
  grant_id: string
  bytes: number
  granted_at: string
  source: 'signup' | string // 'boost:<code>' | 'admin'
  note?: string
}

/** 每次上传占用的 record（3 年后过期自动回池） */
export interface MediaUsageRecord {
  record_id: string
  bytes_size: number
  uploaded_at: string
  expires_at: string
  file_type: 'image' | 'video' | 'audio' | 'file'
  context?: string | null
}

export interface StorageUsageSummary {
  total_bytes: number
  used_bytes: number
  available_bytes: number
  record_ttl_days: number
  grants: StorageGrant[]
  expiring_soon: MediaUsageRecord[]
  active_record_count: number
}

export interface StorageBoostPreview {
  code: string
  capacity_bytes: number
  note?: string | null
  is_redeemed: boolean
}

export interface StorageBoost extends StorageBoostPreview {
  created_at: string
  created_by: string
  redeemed_by: string | null
  redeemed_at: string | null
  label?: string | null
}

export interface RedeemResult {
  kind: 'storage' | 'entitlement'
  // kind = storage 时
  grant?: StorageGrant
  boost?: StorageBoost
  summary?: StorageUsageSummary
  // kind = entitlement 时
  entitlements?: string[]
}

export interface AuthSuccess {
  user_id: string
  username: string
  nickname?: string
  token: string
  is_new?: boolean
}

// ============ NFC ============

export interface NfcResolveResult {
  preset_id: string
  status: 'empty' | 'filled'
  bound_type: 'share' | 'couplet' | 'nfc' | null
  bound_share_id: string | null
  bound_url: string | null
}

// ============ Share（画匣子） ============

export interface ShareListItem {
  share_id: string
  report_title: string
  created_at: string
  share_url: string
  cover_image?: string
  is_owner: boolean
  group_id?: string | null
  liked_at?: string
  personal_pinned?: boolean
  /** 2026-07-13：share_type='album' 时点击应进 /pages/album/index 而非 share/play */
  share_type?: 'memory' | 'album'
}

// ============ 创作链路 ============

export interface AnalyzeImageResult {
  session_id: string
  image_url: string
  thumbnail_url: string
  description: string
  comment?: string
  memory_questions?: string[]
  visual_tags: string[]
  ocr_text: string
  // 2026-07-15：analyze-image 与 upload-image 对齐，都返回文件元数据；
  // 首图（走 analyze-image）之前拿不到这些 → 相册列表视图显示 fallback「图片」
  original_filename?: string
  size_bytes?: number
  taken_at?: string
  has_gps?: boolean
  camera_model?: string
}

export interface ReportRequestImage {
  image_index: number
  image_url: string
  ocr_text: string
  visual_tags: string[]
}

export interface ReportRequestRound {
  round_index: number
  audio_url: string
  asr_text: string
  audio_duration: number
  images: ReportRequestImage[]
}

export interface AnnualReport {
  report_title: string
  total_duration?: number
  episodes: ReportEpisode[]
  report_style?: string
}

export interface ReportEpisode {
  template_id?: TemplateType | 'nfc_video' | 'nfc_audio' | 'nfc_file'
  images?: { image_url: string; thumbnail_url?: string; media_type?: string; original_filename?: string; archived?: boolean }[]
  copywriting?: { h1?: string; h2?: string; body?: string; style?: string }
  [key: string]: unknown
}

export interface SavedShare {
  share_id: string
  share_url: string
}

export interface ShareDetail {
  share_type?: 'memory' | 'album'
  share_id: string
  created_at: string
  group_id?: string | null
  personal_pinned?: boolean
  author_display_name?: string
  original_quality?: boolean
  auto_play_audio?: boolean
  nfc_fullscreen?: boolean
  report: AnnualReport
}

// ============ 模板 ============

// 对齐网页端 ShareCard.vue:25-36 的 THEMES 键集合
export type TemplateType =
  | 'food'
  | 'work'
  | 'sports'
  | 'entertainment'
  | 'hobby'
  | 'reflection'
  | 'pixel_surf'
  | 'wooden_box'
  | 'valentine'
  | 'travel_vlog'

// ============ 文风 ============

// 对齐网页端 4 种文风
export type StyleKey = '独白' | '家书' | '给兄弟' | '给闺蜜'

// ============ 评论 ============

export interface Comment {
  comment_id: string
  author_display_name: string
  content: string
  created_at: string
  media_urls?: string[]
}

// ============ 群组 ============

export interface GroupInfo {
  group_id: string
  group_name: string
  is_solo?: boolean
  has_personal_pinned?: boolean
  share_count?: number
  member_count?: number
  /** 后端字段名是 cover_url（不是 cover_image），对齐 annualreport/src/components/GroupFolderCard.vue:123 */
  cover_url?: string | null
  latest_created_at?: string
  my_role?: 'creator' | 'member'
}

// ============ NFC Preset ============

export interface PresetLink {
  preset_id: string
  preset_url: string
  bound_share_id?: string | null
  bound_share_title?: string | null
  created_at?: string
}

// ============ 通用 ============

export interface PaginatedList<T> {
  items: T[]
  total: number
}
