import { STATIC_BASE } from '@/config/env'
import type { ContentItem, SpaceBlock } from '../types'

export function blockContent(block: SpaceBlock): ContentItem | undefined {
  if (block.kind === 'reference') return block.resolved
  return {
    title: block.title,
    type: block.kind === 'text' ? 'text' : block.media_type || 'file',
    text: block.text,
    url: block.url,
  }
}

export function contentUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('/uploads/')) return STATIC_BASE + value
  if (value.startsWith('/#/pages/')) return value
  return /^https?:\/\//i.test(value) ? value : ''
}

export function blockImage(block: SpaceBlock): string {
  const item = blockContent(block)
  return block.display !== 'link' && (item?.type === 'image' || item?.type === 'gif') ? contentUrl(item.url) : ''
}
