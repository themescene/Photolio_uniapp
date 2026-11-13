import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { logger } from '@/utils/logger'
import { readableError } from '../ui/feedback'
import { readContent, type ContentCategory } from './contentRepository'
import type { ContentItem, SpaceBlock } from '../types'

export function useContentPicker() {
  const category = ref<ContentCategory>('share'), query = ref(''), sourceId = ref(''), sourceTitle = ref('')
  const items = ref<ContentItem[]>([]), selected = ref<ContentItem | null>(null)
  const loading = ref(false), error = ref(''), total = ref(0)
  let generation = 0
  const preview = computed<SpaceBlock | null>(() => selected.value ? {
    id: 'picker-preview', title: selected.value.title, kind: 'reference', ref: selected.value.ref,
    display: ['share', 'group'].includes(selected.value.type) ? 'link' : 'embed', span: 1, resolved: selected.value,
  } : null)
  async function load(more = false, refresh = false) {
    const serial = ++generation
    loading.value = true; error.value = ''; selected.value = null
    if (!more) items.value = []
    const request = { category: category.value, q: query.value, offset: more ? items.value.length : 0, sourceId: sourceId.value || undefined }
    logger.info('[picker-trace] load:start', JSON.stringify({ serial, source: request.sourceId || '', category: request.category }))
    try {
      const result = await readContent(request, refresh)
      if (serial !== generation) return
      items.value = more ? [...items.value, ...result.items] : result.items
      total.value = result.total
      logger.info('[picker-trace] load:commit', JSON.stringify({ serial, count: items.value.length }))
    } catch (err) { if (serial === generation) error.value = readableError(err) }
    finally { if (serial === generation) loading.value = false }
  }
  function switchCategory(next: ContentCategory) {
    if (next === category.value && !sourceId.value) return
    category.value = next; sourceId.value = ''; sourceTitle.value = ''; query.value = ''; void load()
  }
  function choose(item: ContentItem) {
    if (loading.value || item.public === false) return
    if (item.expandable) { sourceId.value = item.id || ''; sourceTitle.value = item.title; query.value = ''; void load(); return }
    selected.value = item
    logger.info('[picker-trace] preview:selected', JSON.stringify({ source: item.ref?.id, type: item.type }))
  }
  function back() { sourceId.value = ''; sourceTitle.value = ''; query.value = ''; void load() }
  function confirmSelection(): ContentItem | null {
    if (loading.value || !selected.value || selected.value.public === false) return null
    logger.info('[picker-trace] confirm', JSON.stringify({ source: selected.value.ref?.id, type: selected.value.type }))
    return selected.value
  }
  watch(() => useAuthStore().token, () => { selected.value = null; sourceId.value = ''; void load() })
  onMounted(() => void load())
  onUnmounted(() => ++generation)
  return { category, query, sourceId, sourceTitle, items, selected, loading, error, total, preview, load, switchCategory, choose, back, confirmSelection }
}
