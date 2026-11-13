import type { ContentItem, PersonalSpace, SpaceBlock, SpaceSection } from '../types'

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
export function moveItem<T>(list: T[], index: number, delta: number) {
  if (index < 0 || index >= list.length || index + delta < 0 || index + delta >= list.length) return
  const [item] = list.splice(index, 1); list.splice(index + delta, 0, item)
}
export function makeBlock(kind: SpaceBlock['kind']): SpaceBlock {
  return { id: newId(), title: '', kind, span: 1, display: 'embed', text: '', url: '', media_type: 'image' }
}
export function addSection(draft: PersonalSpace): SpaceSection {
  const section: SpaceSection = { id: newId(), title: '新栏目', layout: 'grid', blocks: [] }
  draft.sections.push(section); return section
}
export function commitReference(draft: PersonalSpace, sectionId: string, blockId: string | undefined, item: ContentItem): SpaceBlock {
  const section = draft.sections.find(value => value.id === sectionId)
  if (!section || !item.ref) throw new Error('目标栏目已不存在，请重新选择')
  const index = blockId ? section.blocks.findIndex(value => value.id === blockId) : -1
  if (blockId && index < 0) throw new Error('目标内容位已不存在，请重新选择')
  const previous = index < 0 ? undefined : section.blocks[index]
  const block: SpaceBlock = { id: previous?.id || newId(), kind: 'reference', title: item.title,
    span: previous?.span || 1, display: ['share', 'group'].includes(item.type) ? 'link' : 'embed', ref: item.ref, resolved: item }
  if (index < 0) section.blocks.push(block)
  else section.blocks.splice(index, 1, block)
  return block
}

export function commitCover(draft: PersonalSpace, sectionId: string, blockId: string, item: ContentItem) {
  const block = draft.sections.find(section => section.id === sectionId)?.blocks.find(value => value.id === blockId)
  if (!block || !item.ref || !['image', 'gif'].includes(item.type)) throw new Error('请选择一张可用的图片作为缩略图')
  block.cover_ref = item.ref; block.cover_url = item.url
}
