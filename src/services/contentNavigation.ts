import { fetchShare, fetchPermissions } from '@/api/share'
import { fetchGroupMemories } from '@/api/group'
import { logger } from '@/utils/logger'
export function sharePageUrl(id: string, type: 'memory' | 'album') {
  return `/pages/${type === 'album' ? 'album/index' : 'share/play'}?id=${encodeURIComponent(id)}`
}
/** 详情类型由服务端负责。兼容线上漏返share_type的旧接口，但不在查询失败时猜成memory。 */
export async function resolveContentDestination(id: string) {
  const detail = await fetchShare(id)
  let type = detail.share_type
  if (!type) {
    const permissions = await fetchPermissions(id)
    type = permissions.share_type
    logger.info('[content-route] legacy-contract', { id, type, from: 'permissions' })
  }
  if (type !== 'album' && type !== 'memory') throw new Error('内容类型暂时无法确认，请重新打开')
  let route = sharePageUrl(id, type)
  if (type !== 'album' && detail.group_id === id) {
    const group = await fetchGroupMemories(id)
    if (group.memories.length >= 2) route = `/pages/group/index?id=${encodeURIComponent(id)}`
  }
  logger.info('[content-route] resolved', { id, type, route })
  return route
}
