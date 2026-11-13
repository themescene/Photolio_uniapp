<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/i18n'
import H5AnimatedImage from '@/components/H5AnimatedImage.vue'
import H5ImagePreview from '@/components/H5ImagePreview.vue'
import type { SpaceBlock } from './types'
import SpaceButton from './ui/SpaceButton.vue'
import SpaceDialog from './ui/SpaceDialog.vue'
import DocumentPreview from './reading/DocumentPreview.vue'
import { documentKind } from './reading/documents'
import { blockContent, contentUrl } from './reading/content'

const props = defineProps<{ block: SpaceBlock; newTab?: boolean; fixed?: boolean; images?: string[] }>()
const item = computed(() => blockContent(props.block))
const source = computed(() => contentUrl(item.value?.url))
const target = computed(() => contentUrl(item.value?.href || item.value?.url))
const cover = computed(() => contentUrl(props.block.cover_url || item.value?.cover))
const fit = computed(() => props.block.image_fit || (item.value?.type === 'file' ? 'top' : 'cover'))
const title = computed(() => props.block.title || item.value?.title || t('文件'))
const format = computed(() => item.value?.type === 'file' ? documentKind(source.value, item.value.title) : undefined)
const isImage = computed(() => item.value?.type === 'image' || item.value?.type === 'gif')
const gallery = computed(() => props.images?.includes(source.value) ? props.images : [source.value])
const documentOpen = ref(false)
const imageOpen = ref(false)
const mediaState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const attempt = ref(0)
watch([source, () => item.value?.type], () => {
  mediaState.value = 'idle'
  attempt.value = 0
  documentOpen.value = false
  imageOpen.value = false
})
function retryMedia() {
  mediaState.value = 'idle'
  attempt.value++
}
function settleIdleVideo(event: Event) {
  const video = event.currentTarget as HTMLVideoElement
  if (video.paused && !video.readyState && mediaState.value === 'loading') mediaState.value = 'idle'
}
</script>

<template>
  <article :data-media-autoplay="block.autoplay !== false" class="space-block" :class="{ 'space-block--wide': block.span === 2, 'space-block--fixed': fixed }">
    <p v-if="block.kind === 'empty'" class="space-block__empty">{{ t('空内容位') }}</p>
    <p v-else-if="item?.type === 'unavailable'" class="space-block__empty" role="status">{{ t(item.title) }}</p>
    <template v-else-if="block.display === 'link' || ['share', 'group'].includes(item?.type || '')">
      <a v-if="target" :href="target" :target="newTab ? '_blank' : undefined" :rel="newTab ? 'noopener noreferrer' : undefined" class="space-block__link">
        <H5AnimatedImage v-if="cover" :src="cover" :fit="fit" :autoplay="block.autoplay !== false" class="space-block__cover" cropped />
        <span>{{ title }}</span><small>{{ newTab ? t('新标签页打开原内容') : t('打开原内容') }}</small>
      </a>
      <p v-else class="space-block__empty">{{ t('内容暂时无法打开') }}</p>
    </template>
    <template v-else>
      <H5AnimatedImage v-if="cover && !isImage && !['video', 'file'].includes(item?.type || '')"
        :src="cover" :fit="fit" :autoplay="block.autoplay !== false" class="space-block__cover" cropped />
      <h2 v-if="block.title || item?.type === 'file'">{{ title }}</h2>
      <div v-if="item?.type === 'text'" class="space-block__text">{{ item.text }}</div>
      <template v-else-if="isImage && source">
        <div class="space-block__image">
          <H5AnimatedImage :key="attempt" :src="source" :alt="title" :animation="item?.type === 'gif' ? true : undefined"
            :fit="fit" :autoplay="block.autoplay !== false" :cropped="fixed"
            @loaded="mediaState = 'ready'" @failed="mediaState = 'error'" />
          <p v-if="mediaState === 'idle'" class="space-block__media-status" role="status">{{ t('正在加载预览…') }}</p>
        </div>
        <div class="space-block__actions">
          <SpaceButton v-if="mediaState === 'error'" @click="retryMedia">{{ t('重试') }}</SpaceButton>
          <SpaceButton v-else @click="imageOpen = true">{{ t('查看大图') }}</SpaceButton>
          <a v-if="mediaState === 'error'" :href="source" target="_blank" rel="noopener noreferrer">{{ t('打开原链接') }}</a>
        </div>
      </template>
      <template v-else-if="item?.type === 'video' && source">
        <div v-if="mediaState !== 'error' || cover" class="space-block__video-frame">
          <!-- 与网页端 PlayView 的媒体槽一致，视频和封面共用同一块位置。 -->
          <component :is="'video'" v-if="mediaState !== 'error'" :key="source + attempt" class="space-block__video"
            :src="source" :poster="cover || undefined" :aria-label="title" controls playsinline :preload="attempt ? 'metadata' : 'none'"
            @loadstart="mediaState = 'loading'" @waiting="mediaState = 'loading'" @canplay="mediaState = 'ready'"
            @playing="mediaState = 'ready'" @suspend="settleIdleVideo" @error="mediaState = 'error'" />
          <H5AnimatedImage v-else-if="cover" :src="cover" fit="contain" cropped :autoplay="false" />
          <p v-if="mediaState === 'loading'" class="space-block__media-status" role="status">{{ t('正在加载视频…') }}</p>
        </div>
        <div v-if="mediaState === 'error'" class="space-block__actions">
          <span role="status">{{ t('视频暂时无法播放') }}</span>
          <SpaceButton @click="retryMedia">{{ t('重试') }}</SpaceButton>
          <a :href="source" target="_blank" rel="noopener noreferrer">{{ t('打开原链接') }}</a>
        </div>
      </template>
      <component :is="'audio'" v-else-if="item?.type === 'audio' && mediaState !== 'error'" class="space-block__audio"
        :src="source" controls preload="none" @error="mediaState = 'error'" />
      <template v-else-if="item?.type === 'file' && target">
        <div v-if="cover || format" class="space-block__cover" :class="{ 'space-block__cover--document': !cover }">
          <H5AnimatedImage v-if="cover" :src="cover" :fit="fit" :autoplay="block.autoplay !== false" cropped />
          <DocumentPreview v-else-if="format" :src="source" :kind="format" :title="title" cover />
        </div>
        <div class="space-block__actions">
          <SpaceButton v-if="format" @click="documentOpen = true">{{ t('预览文档') }}</SpaceButton>
          <a :href="target" target="_blank" rel="noopener noreferrer">{{ t('打开或下载原件') }}</a>
        </div>
      </template>
      <template v-else-if="mediaState === 'error'">
        <p class="space-block__empty">{{ t('内容未能加载，请打开原链接查看。') }}</p>
        <a v-if="target" :href="target" target="_blank" rel="noopener noreferrer">{{ t('打开原链接') }}</a>
      </template>
    </template>
  </article>
  <Teleport v-if="format" to=".personal-site">
    <Transition name="space-fade">
    <SpaceDialog v-if="documentOpen" :title="title" reader @close="documentOpen = false">
      <DocumentPreview :src="source" :kind="format" :title="title" @escape="documentOpen = false" />
      <template #footer><a class="space-block__original" :href="target" target="_blank" rel="noopener noreferrer">{{ t('打开或下载原件') }}</a></template>
    </SpaceDialog>
    </Transition>
  </Teleport>
  <Teleport v-if="imageOpen" to="body">
    <H5ImagePreview :visible="imageOpen" :urls="gallery" :initial-idx="gallery.indexOf(source)" @close="imageOpen = false" />
  </Teleport>
</template>

<style scoped>
.space-block { min-width: 0; background: var(--space-card); border: 1px solid var(--space-border); border-radius: var(--space-radius); overflow: hidden; break-inside: avoid; }
.space-block h2 { font-size: 20px; padding: 12px 16px; margin: 0; overflow-wrap: anywhere; }
.space-block__video-frame { position: relative; background: var(--space-ink); aspect-ratio: 16 / 9; }
.space-block__video { display: block; width: 100%; height: 100%; object-fit: contain; }
.space-block__media-status { position: absolute; inset: 8px 8px auto auto; margin: 0; padding: 4px 8px; background: var(--space-card); color: var(--space-ink); pointer-events: none; border-radius: var(--space-radius); }
.space-block__audio { display: block; width: calc(100% - 32px); margin: 16px; }
.space-block a { color: inherit; }
.space-block > a { display: block; padding: 16px 20px; }
.space-block__link { text-decoration: none; }
.space-block__link span, .space-block__link small { display: block; padding: 14px 16px; }
.space-block__link small { color: var(--space-muted); padding-top: 0; }
.space-block__text { white-space: pre-wrap; overflow-wrap: anywhere; padding: 20px; max-height: 65vh; overflow-y: auto; line-height: 1.75; }
.space-block__empty { padding: 20px; color: var(--space-muted); }
.space-block__cover { aspect-ratio: 4 / 3; overflow: hidden; }
.space-block__cover--document { height: clamp(140px, 24vw, 220px); aspect-ratio: auto; }
.space-block__cover--document:has([data-preview-state="error"]) { height: auto; }
.space-block__original { color: var(--space-ink); text-underline-offset: 3px; }
.space-block__image { position: relative; min-height: 80px; overflow: hidden; }
.space-block__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 12px; font-size: 13px; }
.space-block--fixed { aspect-ratio: var(--block-ratio, 4 / 3); display: flex; flex-direction: column; }
.space-block--fixed :is(.space-block__image, .space-block__video-frame, .space-block__cover) { min-height: 0; flex: 1; height: 0; aspect-ratio: auto; }
.space-block--fixed .space-block__link { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.space-block--fixed .space-block__text { flex: 1; min-height: 0; }
</style>
