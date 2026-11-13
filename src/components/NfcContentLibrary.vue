<script setup lang="ts">
import { t as uiText } from "@/i18n";
// 参考：annualreport/src/views/NfcHistoryView.vue；首页MasonryFeed只复用，不改排版契约。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import MasonryFeed, { type MasonryItem } from './MasonryFeed.vue'
import SvgIcon from './SvgIcon.vue'
import { useNfcLibrary, nfcError } from '@/composables/useNfcLibrary'
import { bindPresetToNfcUrl, bindPresetToShare } from '@/api/nfc'
import { STATIC_BASE, STORAGE_KEYS } from '@/config/env'
import { KIND_LABELS, type LibraryEntry, type LibraryKind, type UploadedMedia } from '@/features/nfc/content'
import { clearPending, readPending } from '@/utils/media'
import { openRemoteDocument } from '@/utils/open-document'
import { logger } from '@/utils/logger'

const props = withDefaults(defineProps<{ presetId?: string; refreshKey?: number; disabled?: boolean }>(), { presetId: '', refreshKey: 0, disabled: false })
const emit = defineEmits<{ (event: 'bound', uid: string): void }>()
const { auth, entries, loading, error, filter, query, limit, filtered, visible, load, readMedia } = useNfcLibrary()
const selected = ref<LibraryEntry | null>(null), media = ref<UploadedMedia | null>(null)
const reading = ref(false), binding = ref(false), selectionError = ref(''), bindingError = ref(''), copiedLink = ref('')
let serial = 0, audio: UniApp.InnerAudioContext | null = null
const audioPlaying = ref(false), confirming = ref(false)
const filters: Array<{ key: LibraryKind | 'all'; label: string }> = [
  { key: 'all', label: '全部' }, { key: 'share', label: '画匣子' }, { key: 'group', label: '合集' },
  { key: 'video', label: '视频' }, { key: 'audio', label: '音频' }, { key: 'file', label: '文件' },
]
function absolute(url?: string) { return url?.startsWith('/uploads/') ? STATIC_BASE + url : /^https?:\/\//i.test(url || '') ? url || '' : '' }
const masonry = computed<MasonryItem[]>(() => visible.value.map(item => ({ id: item.id, title: item.title,
  cover_url: absolute(item.cover), subtitle: item.created_at.slice(0, 10), badge: uiText(item.share_type === 'album' ? '相册' : KIND_LABELS[item.kind]),
  badge_tone: item.kind === 'video' ? 'video' : 'muted', hide_menu: true })))
const mediaUrl = computed(() => absolute(media.value?.url))
function setFilter(event: { currentTarget?: { dataset?: { filter?: LibraryKind | 'all' } } }) {
  if (event.currentTarget?.dataset?.filter) filter.value = event.currentTarget.dataset.filter
}
function gotoLogin() { uni.navigateTo({ url: '/pages/auth/login' }) }
function stopAudio() { try { audio?.destroy() } catch { /* already stopped */ } audio = null; audioPlaying.value = false }
function close() { if (binding.value) return; ++serial; selected.value = null; media.value = null; copiedLink.value = ''; bindingError.value = ''; stopAudio() }
async function pick(card: MasonryItem) {
  if (props.disabled || binding.value) return
  const item = entries.value.find(entry => entry.id === card.id)
  if (!item) return
  close(); selected.value = item; reading.value = false; selectionError.value = ''
  if (item.kind === 'share' || item.kind === 'group') return
  const version = ++serial
  reading.value = true
  try { const value = await readMedia(item); if (version === serial) media.value = value }
  catch (err) { if (version === serial) selectionError.value = nfcError(err) }
  finally { if (version === serial) reading.value = false }
}
function retrySelection() { if (selected.value) void pick({ id: selected.value.id, title: selected.value.title }) }
function targetUrl() {
  const item = selected.value
  if (!item) return ''
  if (media.value) return mediaUrl.value
  const page = item.kind === 'group' ? 'group/index' : item.share_type === 'album' ? 'album/index' : 'share/play'
  return `/#/pages/${page}?id=${encodeURIComponent(item.sourceId)}`
}
function openContent() {
  const item = selected.value
  if (!item || reading.value) return
  const url = targetUrl()
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer'); return
  // #endif
  // #ifndef H5
  if (!media.value) { uni.navigateTo({ url: url.slice(2) }); return }
  if (media.value?.type === 'file') openRemoteDocument(url, selected.value?.title || '文件', () => void copyLink())
  // #endif
}
function toggleAudio() {
  if (!mediaUrl.value) return
  if (!audio) {
    audio = uni.createInnerAudioContext(); audio.src = mediaUrl.value
    audio.onPlay(() => { audioPlaying.value = true }); audio.onPause(() => { audioPlaying.value = false })
    audio.onEnded(() => { audioPlaying.value = false })
    audio.onError(() => { audioPlaying.value = false; selectionError.value = '音频暂时无法播放，请打开或复制原链接' })
  }
  if (audioPlaying.value) audio.pause(); else audio.play()
}
function copyLink() {
  const target = targetUrl()
  let url = target
  // #ifdef H5
  if (target.startsWith('/')) url = location.origin + target
  // #endif
  if (!url) return
  copiedLink.value = url
  uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '链接已复制', icon: 'success' }), fail: () => uni.showToast({ title: '请长按下方链接复制', icon: 'none' }) })
}
async function confirmBind() {
  if (!props.presetId || !selected.value || reading.value || binding.value || confirming.value || props.disabled) return
  if (!auth.isLoggedIn) return
  if (!media.value && selected.value.kind !== 'share' && selected.value.kind !== 'group') return
  const uid = props.presetId, item = selected.value, chosenMedia = media.value, token = auth.token
  confirming.value = true
  const confirmed = await new Promise<boolean>(resolve => uni.showModal({ title: '确认绑定已有内容',
    content: `将「${item.title}」绑定到 UID 末四位 ${uid.slice(-4)} 的卡片？不会重新上传。`,
    confirmText: '确认绑定', success: result => resolve(!!result.confirm), fail: () => resolve(false) }))
  confirming.value = false
  if (!confirmed || uid !== props.presetId || item !== selected.value || token !== auth.token) return
  binding.value = true; bindingError.value = ''
  try {
    if (chosenMedia) await bindPresetToNfcUrl(uid, absolute(chosenMedia.url), chosenMedia.type)
    else await bindPresetToShare(uid, item.sourceId)
    logger.info('[nfc-library] bound', { uidTail: uid.slice(-4), sourceId: item.sourceId, type: item.kind })
    if (readPending<string>(STORAGE_KEYS.PENDING_PRESET_ID) === uid) clearPending(STORAGE_KEYS.PENDING_PRESET_ID)
    uni.showToast({ title: '绑定成功', icon: 'success' }); binding.value = false; close(); emit('bound', uid)
  } catch (err) { bindingError.value = nfcError(err, '绑定失败，请稍后重试') }
  finally { binding.value = false }
}
watch(() => props.refreshKey, () => void load())
watch(() => props.presetId, () => close())
watch(() => auth.token, () => close())
onMounted(() => void load())
onShow(() => void load())
onUnmounted(() => { ++serial; stopAudio() })
</script>

<template>
  <view class="nfc-library">
    <view class="library-heading"><view><text class="library-title">{{ uiText("已上传内容") }}</text><text class="library-sub">{{ presetId ? uiText("选择已有内容，预览后绑定到当前卡片") : uiText("先上传并保存，之后碰一碰卡片即可选择绑定") }}</text></view><view class="library-refresh" role="button" :aria-disabled="loading || disabled" @click="!loading && !disabled && load()"><SvgIcon name="refresh" size="28rpx" color="#6B5F52" /><text>{{ loading ? uiText("读取中") : uiText("刷新") }}</text></view></view>
    <view v-if="!auth.isLoggedIn" class="library-state"><text>{{ uiText("登录后查看已上传的文件、音视频和画匣子") }}</text><view class="library-btn" role="button" @click="gotoLogin"><text>{{ uiText("登录") }}</text></view></view>
    <template v-else>
      <view class="library-filters"><view v-for="tab in filters" :key="tab.key" class="library-filter" :class="{ active: filter === tab.key }" role="button" :aria-pressed="filter === tab.key" :data-filter="tab.key" @click="setFilter"><text>{{ uiText(tab.label) }}</text></view></view>
      <input v-model="query" class="library-search" :placeholder='uiText("按名称查找已上传内容")' :aria-label='uiText("搜索已上传内容")' />
      <view v-if="error" class="library-error"><text>{{ uiText(error) }}</text><view role="button" @click="load()"><text>{{ uiText("重试") }}</text></view></view>
      <view v-if="loading && !entries.length" class="library-state"><text>{{ uiText("正在读取已上传内容…") }}</text></view>
      <MasonryFeed v-else :items="masonry" empty_hint="还没有匹配的内容，可以先在上方上传" @pick="pick" />
      <view v-if="visible.length < filtered.length" class="library-more" role="button" @click="limit += 30"><text>{{ uiText("加载更多（") }}{{ visible.length }}/{{ filtered.length }}）</text></view>
    </template>
    <view v-if="selected" class="library-overlay" @click.self="close">
      <view class="library-dialog" role="dialog" :aria-label="selected.kind === 'file' ? uiText('文件信息') : uiText('内容预览')" aria-modal="true">
        <view class="library-dialog-header"><view><text class="library-title">{{ selected.title }}</text><text class="library-sub">{{ uiText(KIND_LABELS[selected.kind]) }}{{ presetId ? uiText(" · 当前卡片 …") + presetId.slice(-4) : '' }}</text></view><view role="button" :aria-label='uiText("关闭内容预览")' @click="close"><SvgIcon name="close" size="32rpx" color="#6B5F52" /></view></view>
        <scroll-view scroll-y class="library-preview">
          <text v-if="reading" class="library-state">{{ uiText("正在读取所选内容…") }}</text>
          <view v-else-if="selectionError" class="library-error"><text>{{ uiText(selectionError) }}</text><view v-if="!media && selected.kind !== 'share' && selected.kind !== 'group'" role="button" @click="retrySelection"><text>{{ uiText("重新读取") }}</text></view></view>
          <template v-if="media && !reading">
            <video v-if="media.type === 'video'" class="library-video" :src="mediaUrl" :poster="absolute(media.thumbnail)" controls :autoplay="false" />
            <view v-else-if="media.type === 'audio'" class="library-audio" role="button" @click="toggleAudio"><SvgIcon :name="audioPlaying ? 'pause' : 'play'" size="40rpx" color="#3D2E1F" /><text>{{ audioPlaying ? uiText("暂停音频") : uiText("试听音频") }}</text></view>
            <template v-else>
              <view class="library-file"><SvgIcon name="folder" size="48rpx" color="#A89A8A" /><text>{{ selected.title }}</text><text class="library-sub">{{ uiText("可打开或下载原文件") }}</text></view>
            </template>
          </template>
          <view v-else-if="!reading && !selectionError" class="library-file"><text>{{ selected.title }}</text><text class="library-sub">{{ uiText("可先打开原") }}{{ uiText(KIND_LABELS[selected.kind]) }}{{ uiText("查看，再确认绑定。") }}</text></view>
          <view v-if="bindingError" class="library-error"><text>{{ uiText(bindingError) }}</text></view>
          <textarea v-if="copiedLink" class="library-link" :value="copiedLink" readonly auto-height :aria-label='uiText("可复制的内容链接")' />
        </scroll-view>
        <view class="library-dialog-footer"><view class="library-btn library-btn--ghost" role="button" :aria-disabled="reading || !!selectionError" @click="!reading && !selectionError && openContent()"><text>{{ uiText("打开内容") }}</text></view><view class="library-btn library-btn--ghost" role="button" :aria-disabled="reading || !!selectionError" @click="!reading && !selectionError && copyLink()"><text>{{ uiText("复制链接") }}</text></view><view v-if="presetId" class="library-btn" :class="{ disabled: reading || binding || !!selectionError }" role="button" @click="!selectionError && confirmBind()"><text>{{ binding ? uiText("正在绑定…") : uiText("绑定到这张卡") }}</text></view></view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use '@/styles/tokens.scss' as t;
.nfc-library { border-top: 2rpx solid t.$color-border; padding-top: t.$spacing-5; margin-top: t.$spacing-3; display: flex; flex-direction: column; gap: t.$spacing-3; }
.library-heading, .library-dialog-header { display: flex; justify-content: space-between; align-items: center; gap: t.$spacing-3; }
.library-heading > view:first-child, .library-dialog-header > view:first-child { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8rpx; }
.library-title { display: block; font-size: t.$font-lg; font-weight: t.$weight-bold; color: t.$color-text; overflow-wrap: anywhere; }
.library-sub { display: block; font-size: t.$font-xs; color: t.$color-text-soft; line-height: 1.6; }
.library-refresh { display: flex; align-items: center; gap: 8rpx; font-size: t.$font-xs; color: t.$color-text-soft; padding: 12rpx; flex-shrink: 0; }
.library-filters { display: flex; flex-wrap: wrap; gap: 12rpx; }
.library-filter { padding: 10rpx 22rpx; border-radius: t.$radius-pill; color: t.$color-text-soft; background: t.$color-surface; font-size: t.$font-xs; border: 2rpx solid t.$color-border; }
.library-filter.active { background: t.$color-accent; color: t.$color-text-invert; }
.library-search { height: 80rpx; min-height: 80rpx; box-sizing: border-box; padding: 0 t.$spacing-3; background: t.$color-surface; border: 2rpx solid t.$color-border; border-radius: t.$radius-md; font-size: t.$font-sm; color: t.$color-text; }
.library-state { display: flex; flex-direction: column; align-items: center; gap: t.$spacing-3; padding: t.$spacing-5 0; text-align: center; font-size: t.$font-sm; color: t.$color-text-soft; }
.library-error { display: flex; gap: 16rpx; align-items: center; padding: 18rpx; background: #fbefeb; color: t.$color-danger; font-size: t.$font-xs; border-radius: t.$radius-md; }
.library-error > view { flex-shrink: 0; text-decoration: underline; }
.library-more { text-align: center; padding: 24rpx; font-size: t.$font-sm; color: t.$color-text-soft; }
.library-btn { padding: 18rpx 28rpx; background: t.$color-accent; color: t.$color-text-invert; font-size: t.$font-sm; border-radius: t.$radius-pill; text-align: center; }
.library-btn--ghost { background: t.$color-surface; color: t.$color-text; border: 2rpx solid t.$color-border; }
.disabled, [aria-disabled='true'] { opacity: .45; }
.library-overlay { position: fixed; inset: 0; z-index: 110; background: rgba(44,34,24,.45); display: flex; align-items: center; justify-content: center; padding: t.$spacing-4; }
.library-dialog { width: 100%; max-width: var(--doc-inner-width, 100%); max-height: 88vh; background: t.$color-bg; border-radius: t.$radius-lg; display: flex; flex-direction: column; overflow: hidden; box-shadow: t.$shadow-pop; }
.library-dialog-header { padding: t.$spacing-4; border-bottom: 2rpx solid t.$color-border; }
.library-preview { flex: 1; min-height: 0; max-height: 60vh; }
.library-file { display: flex; flex-direction: column; align-items: center; gap: 16rpx; padding: t.$spacing-5 t.$spacing-3; font-size: t.$font-sm; color: t.$color-text; overflow-wrap: anywhere; }
.library-video { width: 100%; height: 380rpx; }
.library-audio { display: flex; align-items: center; justify-content: center; gap: 20rpx; padding: 64rpx; font-size: t.$font-sm; }
.library-link { display: block; margin: 0 t.$spacing-3 t.$spacing-3; min-height: 100rpx; font-size: t.$font-xs; color: t.$color-text-soft; }
.library-dialog-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12rpx; padding: t.$spacing-3; border-top: 2rpx solid t.$color-border; }
</style>
