// 参考：annualreport/src/views/NfcLandingView.vue saveToServer / NfcHistoryView.vue。
import type { AnnualReport, ShareDetail, ShareListItem, GroupInfo } from '@/types'

export type MediaKind = 'video' | 'audio' | 'file'
export type LibraryKind = MediaKind | 'share' | 'group'
export interface UploadedMedia {
  session_id: string; type: MediaKind; title: string; url: string
  thumbnail?: string; size_mb?: number; duration?: number
}
export interface LibraryEntry {
  id: string; sourceId: string; kind: LibraryKind; title: string; created_at: string; cover?: string
  share_type?: 'memory' | 'album'
}
const PREFIXES = { video: 'NFC视频', audio: 'NFC音频', file: 'NFC文件' } as const
export const KIND_LABELS: Record<LibraryKind, string> = { video: '视频', audio: '音频', file: '文件', share: '画匣子', group: '合集' }
export function mediaKind(title: string): MediaKind | undefined {
  return (Object.keys(PREFIXES) as MediaKind[]).find(kind => new RegExp('^' + PREFIXES[kind] + '[:：]').test(title))
}
export function displayContentTitle(title: string): string { return title.replace(/^NFC(?:视频|音频|文件)[:：]\s*/, '') }
export function fileUrl(url: string, name: string): string {
  if (!name || /[?&]name=/.test(url)) return url
  return url + (url.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(name)
}
export function buildMediaReport(media: UploadedMedia): AnnualReport {
  return {
    report_title: `${PREFIXES[media.type]}: ${media.title}`, total_duration: media.duration || 0,
    episodes: [{ episode_id: 0, round_index: 0, template_id: `nfc_${media.type}`,
      audio_url: media.type === 'audio' ? media.url : '', audio_duration: media.duration || 0,
      images: media.type === 'audio' ? [] : [{ media_type: media.type, image_url: media.url,
        thumbnail_url: media.thumbnail || '', original_filename: media.title }],
      copywriting: { h1: PREFIXES[media.type], h2: media.title, body: '' },
      image_transition: { type: 'static', interval: 0 },
    }],
  }
}
export function libraryEntries(shares: ShareListItem[], groups: GroupInfo[]): LibraryEntry[] {
  const groupIds = new Set(groups.map(group => group.group_id))
  const entries: LibraryEntry[] = shares.filter(share => share.is_owner).flatMap(share => {
    const kind = mediaKind(share.report_title || '')
    if (!kind && groupIds.has(share.share_id)) return []
    return [{ id: 'share:' + share.share_id, sourceId: share.share_id, kind: kind || 'share',
      title: kind ? share.report_title.replace(/^NFC(?:视频|音频|文件)[:：]\s*/, '') : share.report_title || '未命名画匣子',
      created_at: share.created_at || '', cover: kind === 'file' || kind === 'audio' ? '' : share.cover_image,
      share_type: share.share_type }]
  })
  for (const group of groups) {
    // 旧网页版用 __nfc__ 收纳直链记录，它不是用户创建的合集。
    if (group.group_id === '__nfc__') continue
    entries.push({ id: 'group:' + group.group_id, sourceId: group.group_id, kind: 'group',
      title: group.group_name || '合集', created_at: group.latest_created_at || '', cover: group.cover_url || '' })
  }
  return entries.sort((a, b) => b.created_at.localeCompare(a.created_at))
}
export function resolveLibraryMedia(detail: ShareDetail): UploadedMedia {
  const episode = detail.report?.episodes?.[0]
  if (!episode) throw new Error('这份内容暂时无法读取')
  const kind = /^nfc_(video|audio|file)$/.exec(episode.template_id || '')?.[1] as MediaKind | undefined
  const type = kind || mediaKind(detail.report.report_title || '')
  if (!type) throw new Error('这份内容不是独立媒体，请从画匣子入口打开')
  const media = episode.images?.[0]
  if (media?.archived) throw new Error('媒体已归档，请先前往原画匣子取回')
  const url = type === 'audio' ? String(episode.audio_url || '') : media?.image_url || ''
  if (!url) throw new Error('原文件已移除或暂时无法读取')
  return { session_id: '', type, title: episode.copywriting?.h2 || detail.report.report_title,
    url: type === 'file' ? fileUrl(url, episode.copywriting?.h2 || '') : url,
    thumbnail: media?.thumbnail_url, duration: Number(episode.audio_duration) || undefined }
}
