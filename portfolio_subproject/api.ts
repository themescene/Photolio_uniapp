import { request } from '@/api/request'
import { API_BASE } from '@/config/env'
import { logger } from '@/utils/logger'
import type { PersonalSpace, SpaceSummary, ContentItem } from './types'

const baseURL = import.meta.env.DEV ? '/personal-api' : API_BASE
export const fetchTemplate = () => request<PersonalSpace>({ baseURL, path: '/spaces/template', requireAuth: false })
export const fetchSpace = (id: string) => request<PersonalSpace>({ baseURL, path: `/spaces/${encodeURIComponent(id)}`, requireAuth: false })
export const fetchMySpaces = () => request<{ spaces: SpaceSummary[] }>({ baseURL, path: '/spaces/mine', requireAuth: false })
export const createSpace = (title: string, template_space?: string) => request<PersonalSpace>({ baseURL, path: '/spaces', method: 'POST', body: { title, template_space } })
export async function saveSpace(space: PersonalSpace) {
  const lengths = (value: PersonalSpace) => value.sections.flatMap(section => section.blocks.filter(block => block.kind === 'text').map(block => block.text?.length || 0))
  logger.info('[space-trace] save request', { id: space.space_id, textLengths: lengths(space) })
  const saved = await request<PersonalSpace>({ baseURL, path: `/spaces/${encodeURIComponent(space.space_id)}`, method: 'PUT', body: space })
  logger.info('[space-trace] save response', { id: saved.space_id, textLengths: lengths(saved) })
  return saved
}
export const fetchContent = (q = '', offset = 0, source?: string, id?: string, category?: string) =>
  request<{ items: ContentItem[]; total: number }>({ baseURL, path: '/spaces/content', query: { q, offset, source, id, category } })
