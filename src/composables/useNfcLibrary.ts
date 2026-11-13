import { computed, ref, watch, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchMyShares, fetchShare } from '@/api/share'
import { fetchMyGroups } from '@/api/group'
import { libraryEntries, resolveLibraryMedia, type LibraryEntry, type LibraryKind, type UploadedMedia } from '@/features/nfc/content'
import { logger } from '@/utils/logger'

export function nfcError(error: unknown, fallback = '暂时无法读取，请稍后重试') {
  const message = error instanceof Error ? error.message : ''
  return message && !/[a-zA-Z]{4,}/.test(message) ? message : fallback
}
export function useNfcLibrary() {
  const auth = useAuthStore()
  const entries = ref<LibraryEntry[]>([]), loading = ref(false), error = ref('')
  const filter = ref<LibraryKind | 'all'>('all'), query = ref(''), limit = ref(30)
  let generation = 0, running: Promise<void> | null = null
  const filtered = computed(() => entries.value.filter(item => (filter.value === 'all' || item.kind === filter.value) && item.title.toLowerCase().includes(query.value.trim().toLowerCase())))
  const visible = computed(() => filtered.value.slice(0, limit.value))
  watch([filter, query], () => { limit.value = 30 })
  function load() {
    if (running) return running
    if (!auth.isLoggedIn) { entries.value = []; return Promise.resolve() }
    const version = ++generation, token = auth.token, started = Date.now()
    loading.value = true; error.value = ''
    const task = Promise.allSettled([fetchMyShares('all'), fetchMyGroups()]).then(([shares, groups]) => {
      if (version !== generation || token !== auth.token) return
      entries.value = libraryEntries(shares.status === 'fulfilled' ? shares.value.shares : [], groups.status === 'fulfilled' ? groups.value.groups : [])
      if (shares.status === 'rejected') error.value = nfcError(shares.reason, '已上传内容读取失败，请重试')
      else if (groups.status === 'rejected') error.value = '合集暂时无法读取，其余内容仍可使用'
      logger.info('[nfc-library] loaded', { count: entries.value.length, elapsedMs: Date.now() - started })
    }).finally(() => { if (version === generation) loading.value = false; if (running === task) running = null })
    running = task; return task
  }
  async function readMedia(item: LibraryEntry): Promise<UploadedMedia> {
    const token = auth.token
    const detail = await fetchShare(item.sourceId)
    if (token !== auth.token) throw new Error('登录账号已切换，请重新选择内容')
    return resolveLibraryMedia(detail)
  }
  watch(() => auth.token, () => { ++generation; running = null; entries.value = []; void load() })
  onUnmounted(() => { ++generation })
  return { auth, entries, loading, error, filter, query, limit, filtered, visible, load, readMedia }
}
