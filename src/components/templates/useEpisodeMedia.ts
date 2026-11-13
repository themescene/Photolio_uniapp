/**
 * Episode -> MediaItem[] 转换器。
 *
 * episode.images 后端字段是 `{ image_url, media_type?, thumbnail_url? }[]`；
 * 历史数据可能有些是纯字符串。统一映射为 TemplateImage 接受的 MediaItem。
 *
 * 用于所有模板 Card，避免每个 Card 重复 boilerplate。
 */
import { computed, type ComputedRef } from 'vue'
import type { ReportEpisode } from '@/types'
import type { MediaItem } from './TemplateImage.vue'

export function useEpisodeMedia(
  episodeRef: ComputedRef<ReportEpisode | null | undefined> | (() => ReportEpisode | null | undefined),
): ComputedRef<MediaItem[]> {
  return computed<MediaItem[]>(() => {
    const ep = typeof episodeRef === 'function' ? episodeRef() : episodeRef.value
    const arr = Array.isArray(ep?.images) ? ep!.images : []
    return arr
      .map((i): MediaItem | null => {
        if (typeof i === 'string') {
          return { url: i, type: 'image', thumbnail: '', archived: false }
        }
        const obj = i as { image_url?: string; media_type?: string; thumbnail_url?: string; archived?: boolean }
        if (!obj?.image_url) return null
        const isVideo = obj.media_type === 'video'
        // 2026-09-16 v2：**图片模板卡不用 gthumb，直接用原图**。之前给 image 派生了
        // `<stem>__gthumb.jpg`（300px q65，相册网格用的小档），TemplateImage 拿去在
        // 模板卡（4:3 全宽 ~600px）显示 → 拉大必糊（用户报"回忆视图除第一节其他都很糊"）。
        // 画匣子模板卡是大视觉，每次只显一张图，直接用原图 + `<image lazy-load>` 即可，
        // 不会撞 h2 并发上限。
        // 视频：保留 backend 提取的封面帧 thumbnail_url（真封面帧，非 gthumb），
        //       <video :poster> 用它承载首帧。
        const rawThumb = obj.thumbnail_url || ''
        const thumbnail = isVideo
          ? rawThumb
          : ''  // 图片：让 TemplateImage 直接用 cur.url（原图）
        return {
          url: obj.image_url,
          type: isVideo ? 'video' : 'image',
          thumbnail,
          // 2026-07-25 hotfix13：3 年归档后 backend 会把这个字段设为 true
          // TemplateImage 检到 archived 直接渲染灰色占位符（不再拉云端 URL）
          archived: !!obj.archived,
        }
      })
      .filter((x): x is MediaItem => x !== null)
  })
}
