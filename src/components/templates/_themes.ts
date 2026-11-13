/**
 * 模板主题色 / 字体注册表。
 *
 * 完全对齐网页端 [annualreport/src/components/ShareCard.vue:25-36] 的 THEMES 字段。
 * 这里多加 fontFamily / textSoft / textMute 用于卡片内部多层级文字。
 */
import type { TemplateType } from '@/types'

export interface TemplateTheme {
  bg: string          // 主背景色
  text: string        // 主文字（标题）色
  textSoft: string    // 次级文字色（副标题）
  textMute: string    // 弱化文字色（正文）
  accent: string      // 强调色（分隔线 / 徽标）
  fontFamily: string  // 字体栈
  /** 一个简单的"暗色字段"哈希，用于卡片内部判断暗黑对比 */
  isDarkBg?: boolean
}

const SERIF = "'Ma Shan Zheng', 'STKaiti', 'KaiTi', serif"
const SANS = "'PingFang SC', 'Source Han Sans CN', 'Microsoft YaHei', system-ui, sans-serif"

export const TEMPLATE_THEMES: Record<TemplateType, TemplateTheme> = {
  food: {
    bg: '#f5f1e8', text: '#8b4513', textSoft: '#a0826d', textMute: '#b8997f',
    accent: '#d4a574', fontFamily: SERIF,
  },
  work: {
    bg: '#fafafa', text: '#1a1a1a', textSoft: '#374151', textMute: '#6b7280',
    accent: '#1e3a5f', fontFamily: SANS,
  },
  sports: {
    bg: '#f7f7f7', text: '#1a1a1a', textSoft: '#374151', textMute: '#6b7280',
    accent: '#bf3931', fontFamily: SANS,
  },
  entertainment: {
    bg: '#ffffff', text: '#1a1a1a', textSoft: '#374151', textMute: '#6b7280',
    accent: '#c4973d', fontFamily: SANS,
  },
  hobby: {
    bg: '#fdfcf9', text: '#2a2a2a', textSoft: '#5a4540', textMute: '#7d6660',
    accent: '#c48f85', fontFamily: SANS,
  },
  reflection: {
    bg: '#f8f9fa', text: '#374151', textSoft: '#4b5563', textMute: '#6b7280',
    accent: '#a78bfa', fontFamily: SERIF,
  },
  pixel_surf: {
    bg: '#ffffff', text: '#1d2129', textSoft: '#374151', textMute: '#6b7280',
    accent: '#4361ee', fontFamily: SANS,
  },
  wooden_box: {
    bg: '#d9c2a0', text: '#1f1a14', textSoft: '#524638', textMute: '#8a7050',
    accent: '#b8956a', fontFamily: SANS, isDarkBg: false,
  },
  valentine: {
    bg: '#fff0f3', text: '#be185d', textSoft: '#c2185b', textMute: '#9f1d56',
    accent: '#ec4899', fontFamily: SERIF,
  },
  travel_vlog: {
    bg: '#f8fafb', text: '#1a1a1a', textSoft: '#374151', textMute: '#6b7280',
    accent: '#10b981', fontFamily: SANS,
  },
}

export function getTheme(t: string | undefined | null): TemplateTheme {
  return TEMPLATE_THEMES[(t as TemplateType) || 'wooden_box'] || TEMPLATE_THEMES.wooden_box
}
