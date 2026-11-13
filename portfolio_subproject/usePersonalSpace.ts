import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/request'
import * as api from './api'
import type { PersonalSpace, SpaceSummary } from './types'

import { readableError, askConfirm } from './ui/feedback'
export { readableError, askConfirm } from './ui/feedback'

export function usePersonalSpace() {
  const auth = useAuthStore()
  const space = ref<PersonalSpace | null>(null)
  const mine = ref<SpaceSummary[]>([])
  const sectionId = ref('')
  const loading = ref(true)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const editing = ref(false)
  const draft = ref<PersonalSpace | null>(null)
  const menuOpen = ref(false)
  const createOpen = ref(false)
  const createTitle = ref('')
  const linkFallback = ref('')
  const activeSection = computed(() => space.value?.sections.find(s => s.id === sectionId.value) || space.value?.sections[0])
  let currentId = ''
  let loadVersion = 0
  let authAtLoad = ''

  function route(id: string, section?: string, replace = false) {
    const query = new URLSearchParams()
    if (id) query.set('space', id)
    if (section) query.set('section', section)
    const url = '#/pages/personal/index' + (query.toString() ? '?' + query.toString() : '')
    // 地址记录只存空间/栏目，不保存token或依赖上一个页面状态。
    if (replace) history.replaceState(null, '', url)
    else location.hash = url.slice(1)
  }

  async function load(id = currentId) {
    const version = ++loadVersion
    loading.value = true; error.value = ''
    try {
      const result = id ? await api.fetchSpace(id) : await api.fetchTemplate()
      if (version !== loadVersion) return
      space.value = result; currentId = id
      authAtLoad = auth.token || ''
      if (!result.sections.some(s => s.id === sectionId.value)) sectionId.value = result.sections[0]?.id || ''
      uni.setNavigationBarTitle({ title: result.title })
      if (auth.isLoggedIn) {
        void api.fetchMySpaces().then(result => { if (version === loadVersion) mine.value = result.spaces }).catch(() => { if (version === loadVersion) mine.value = [] })
      } else mine.value = []
    } catch (err) {
      if (version === loadVersion) { space.value = null; error.value = readableError(err) }
    } finally { if (version === loadVersion) loading.value = false }
  }

  function readRoute() {
    if (location.hash.split('?')[0] !== '#/pages/personal/index') return
    const query = new URLSearchParams(location.hash.split('?')[1] || '')
    const id = query.get('space') || ''
    sectionId.value = query.get('section') || ''
    menuOpen.value = false
    if (id !== currentId || !space.value) { editing.value = false; draft.value = null; void load(id) }
  }
  function chooseSection(id: string) { sectionId.value = id; menuOpen.value = false; route(currentId, id) }
  async function openSpace(id: string) {
    if (editing.value && !await askConfirm('离开将放弃尚未保存的更改，继续吗？')) return
    editing.value = false; draft.value = null; route(id)
    if (currentId === id) void load(id)
  }
  function edit() {
    if (!space.value?.can_edit) return
    menuOpen.value = false
    draft.value = JSON.parse(JSON.stringify(space.value)) as PersonalSpace
    editing.value = true; notice.value = ''; error.value = ''
  }
  async function cancel() {
    if (await askConfirm('放弃尚未保存的更改？')) { editing.value = false; draft.value = null; error.value = '' }
  }
  async function save(savedSectionId?: string) {
    if (!draft.value || busy.value) return
    busy.value = true; error.value = ''; notice.value = ''
    try {
      space.value = await api.saveSpace(draft.value)
      uni.setNavigationBarTitle({ title: space.value.title })
      editing.value = false; draft.value = null
      notice.value = '已保存，空间可通过链接公开查看'
      chooseSection(space.value.sections.find(s => s.id === (savedSectionId || sectionId.value))?.id || space.value.sections[0].id)
    } catch (err) {
      error.value = readableError(err)
      if (err instanceof ApiError && err.httpCode === 409) notice.value = '请先复制需要保留的文字，再重新加载；当前编辑内容仍保留在这里。'
    } finally { busy.value = false }
  }
  function beginCreate() {
    menuOpen.value = false
    if (!auth.isLoggedIn) { uni.navigateTo({ url: '/pages/auth/login' }); return }
    createTitle.value = auth.nickname ? `${auth.nickname}的个人空间` : '我的个人空间'
    createOpen.value = true
  }
  async function create() {
    const title = createTitle.value.trim()
    if (!title || busy.value) return
    busy.value = true; error.value = ''
    try {
      const created = await api.createSpace(title.trim(), space.value?.space_id || undefined)
      currentId = created.space_id; space.value = created
      uni.setNavigationBarTitle({ title: created.title })
      sectionId.value = created.sections[0].id; route(currentId, sectionId.value, true)
      mine.value = [{ space_id: created.space_id, title: created.title, revision: created.revision }, ...mine.value.filter(item => item.space_id !== created.space_id)]
      createOpen.value = false
      edit()
    } catch (err) { error.value = readableError(err) }
    finally { busy.value = false }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); notice.value = '链接已复制' }
    catch { linkFallback.value = location.href; notice.value = '请选中下方链接复制' }
  }
  function setPageActive(active: boolean) { document.documentElement.classList.toggle('personal-space-active', active) }
  function beforeLeave(event: BeforeUnloadEvent) {
    if (editing.value) { event.preventDefault(); event.returnValue = '' }
  }
  onLoad(() => {
    readRoute()
    window.addEventListener('hashchange', readRoute)
    window.addEventListener('beforeunload', beforeLeave)
  })
  onMounted(() => setPageActive(true))
  onShow(() => { setPageActive(true); if (space.value && authAtLoad !== (auth.token || '')) void load() })
  onHide(() => setPageActive(false))
  onUnload(() => setPageActive(false))
  onUnmounted(() => {
    ++loadVersion; setPageActive(false)
    window.removeEventListener('hashchange', readRoute)
    window.removeEventListener('beforeunload', beforeLeave)
  })
  return { auth, space, mine, sectionId, activeSection, loading, busy, error, notice, editing,
    draft, menuOpen, createOpen, createTitle, linkFallback, load, chooseSection, openSpace, edit, cancel, save, beginCreate, create, copyLink }
}
