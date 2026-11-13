import { useAuthStore } from '@/stores/auth'
import { logger } from '@/utils/logger'
import { fetchContent } from '../api'
import type { ContentItem } from '../types'
import { ReadRequestCache } from './requestCache'
export type ContentCategory = 'share' | 'group' | 'preset'
export interface ContentQuery { category: ContentCategory; q: string; offset: number; sourceId?: string }
const cache = new ReadRequestCache()
export function contentKey(item: ContentItem) {
  return item.ref ? [item.ref.source, item.ref.id, item.ref.part, item.ref.key].join(':') : [item.source, item.id].join(':')
}
export function contentTypeLabel(type: string) {
  return ({ memory: '画匣子', album: '相册', group: '合集', share: '整个画匣子',
    image: '图片', video: '视频', audio: '音频', text: '文字', file: '文件' } as Record<string, string>)[type] || '内容'
}
export async function readContent(query: ContentQuery, refresh = false) {
  const started = performance.now()
  const result = await cache.read(useAuthStore().token || '', JSON.stringify(query), () =>
    fetchContent(query.q, query.offset, query.sourceId ? 'share' : undefined, query.sourceId, query.category), refresh)
  logger.info('[picker-perf] read', JSON.stringify({ category: query.category, source: !!query.sourceId, count: result.items.length, elapsedMs: Math.round(performance.now() - started) }))
  return result
}
