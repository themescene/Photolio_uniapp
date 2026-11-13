<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { usePreviewText } from "@/i18n"
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import SpaceButton from '../ui/SpaceButton.vue'
import { DOCX_FRAME, readDocx, type DocumentKind } from './documents'

const t = usePreviewText()
const props = defineProps<{ src: string; kind: DocumentKind; title: string; cover?: boolean }>()
const emit = defineEmits<{ escape: [] }>()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const frame = ref<HTMLIFrameElement | null>(null)
const visible = ref(!props.cover)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const attempt = ref(0)
const page = ref(1)
const zoom = ref(1)
const frameHeight = ref(360)
const document = shallowRef<PDFDocumentProxy>()
let observer: IntersectionObserver | undefined
let resize: ResizeObserver | undefined
let render: RenderTask | undefined
let documentFrameRun = 0
const width = ref(0)

onMounted(() => {
  if (root.value && props.cover && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        visible.value = true
        observer?.disconnect()
      }
    })
    observer.observe(root.value)
  } else visible.value = true
  if (root.value && typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(([entry]) => { width.value = Math.floor(entry.contentRect.width) })
    resize.observe(root.value)
  } else width.value = root.value?.clientWidth || 320
})
onUnmounted(() => { observer?.disconnect(); resize?.disconnect() })

watch([visible, () => props.src, () => props.kind, attempt], async ([show, src, kind], _, cleanup) => {
  document.value = undefined
  page.value = 1
  state.value = 'loading'
  if (!show || kind !== 'pdf') return
  let disposed = false
  let task: PDFDocumentLoadingTask | undefined
  cleanup(() => {
    disposed = true
    render?.cancel()
    if (task) void task.destroy().catch(() => {})
  })
  try {
    const { openPdf } = await import('@/features/personal/pdfEngine')
    if (disposed) return
    task = openPdf(src)
    const result = await task.promise
    if (!disposed) document.value = result
  } catch {
    if (!disposed) state.value = 'error'
  }
}, { immediate: true })

watch([document, page, zoom, width, canvas], async ([pdf, number, magnification, available, surface], _, cleanup) => {
  if (!pdf || !surface || !available) return
  let disposed = false
  let task: RenderTask | undefined
  cleanup(() => { disposed = true; task?.cancel() })
  state.value = 'loading'
  try {
    const pdfPage = await pdf.getPage(number)
    if (disposed) return
    const base = pdfPage.getViewport({ scale: 1 })
    const cssWidth = Math.min(available, props.cover ? 240 : 920) * (props.cover ? 1 : magnification)
    const scale = cssWidth / base.width
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(base.width, base.height) / scale)
    const viewport = pdfPage.getViewport({ scale: scale * pixelRatio })
    surface.width = Math.ceil(viewport.width)
    surface.height = Math.ceil(viewport.height)
    surface.style.width = `${cssWidth}px`
    surface.style.height = `${base.height * scale}px`
    task = pdfPage.render({ canvas: surface, viewport })
    render = task
    await task.promise
    if (!disposed) {
      state.value = 'ready'
      if (props.cover) {
        document.value = undefined
        void pdf.destroy().catch(() => {})
      }
    }
  } catch {
    if (!disposed) state.value = 'error'
  }
}, { flush: 'post' })

watch(frame, (element, _, cleanup) => {
  const run = ++documentFrameRun
  if (!element) return
  const controller = new AbortController()
  const source = props.src
  cleanup(() => { controller.abort(); element.removeEventListener('load', load) })
  function load() {
    void (async () => {
      const target = element?.contentDocument
      const content = target?.getElementById('docx-content')
      const styles = target?.getElementById('docx-styles')
      if (!target || !content || !styles) return
      element?.removeEventListener('load', load)
      try {
        const [bytes, { renderAsync }] = await Promise.all([
          readDocx(source, controller.signal),
          import('@/features/personal/docxEngine'),
        ])
        if (controller.signal.aborted) return
        target.addEventListener('click', event => event.preventDefault())
        target.addEventListener('keydown', event => { if (event.key === 'Escape') emit('escape') })
        // The renderer clears its containers. Keep the frame policy and base styles outside them.
        await renderAsync(bytes, content, styles, {
          ignoreWidth: true, ignoreHeight: true, ignoreLastRenderedPageBreak: false,
          renderAltChunks: false, renderChanges: false, useBase64URL: true,
        })
        if (controller.signal.aborted || run !== documentFrameRun) return
        if (!target.querySelector('section.docx')) throw new Error('Empty DOCX preview')
        if (props.cover) target.querySelectorAll('section.docx').forEach((section, index) => { if (index > 0) section.remove() })
        state.value = 'ready'
        await nextTick()
        if (!controller.signal.aborted && !props.cover) {
          frameHeight.value = Math.min(680, Math.ceil(content.getBoundingClientRect().height) + 1)
        }
      } catch {
        if (!controller.signal.aborted) state.value = 'error'
      }
    })()
  }
  element.addEventListener('load', load)
  element.srcdoc = DOCX_FRAME
}, { flush: 'post' })
</script>

<template>
  <div ref="root" class="document-preview" :class="{ 'document-preview--cover': cover }" :data-preview-state="state" :aria-busy="visible && state === 'loading'">
    <div v-if="!cover && kind === 'pdf' && document" class="document-preview__controls">
      <SpaceButton :disabled="page <= 1" @click="page--">{{ t('上一页') }}</SpaceButton>
      <span aria-live="polite">{{ page }} / {{ document.numPages }}</span>
      <SpaceButton :disabled="page >= document.numPages" @click="page++">{{ t('下一页') }}</SpaceButton>
      <SpaceButton :disabled="zoom <= 1" @click="zoom -= 0.25">{{ t('缩小') }}</SpaceButton>
      <SpaceButton :disabled="zoom >= 2" @click="zoom += 0.25">{{ t('放大') }}</SpaceButton>
    </div>
    <p v-if="visible && state === 'loading'" class="document-preview__status" role="status">{{ t('正在加载预览…') }}</p>
    <div v-if="visible && state === 'error'" class="document-preview__status" role="status">
      {{ t('暂时无法预览此文件') }}
      <SpaceButton v-if="!cover" @click="attempt++">{{ t('重试') }}</SpaceButton>
    </div>
    <div v-if="visible && kind === 'pdf'" v-show="state === 'ready'" class="document-preview__surface">
      <component :is="'canvas'" ref="canvas" role="img" :aria-label="`${title} · ${page}`" />
    </div>
    <iframe v-if="visible && kind === 'docx'" v-show="state === 'ready'" :key="src + attempt" ref="frame"
      :title="title" :style="{ height: cover ? '100%' : frameHeight + 'px' }"
      sandbox="allow-same-origin" :tabindex="cover ? -1 : 0" />
  </div>
</template>

<style scoped>
.document-preview { min-width: 0; background: var(--space-bg); }
.document-preview__controls { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; padding: 8px; }
.document-preview__status { display: grid; place-items: center; gap: 8px; margin: 0; padding: 20px 8px; color: var(--space-muted); text-align: center; }
.document-preview__surface { overflow: auto; text-align: center; }
.document-preview__surface canvas { display: inline-block; vertical-align: top; background: var(--space-card); }
.document-preview iframe { display: block; width: 100%; border: 0; background: var(--space-card); }
.document-preview--cover { position: relative; height: 100%; overflow: hidden; pointer-events: none; }
.document-preview--cover .document-preview__surface { display: grid; height: 100%; place-items: center; overflow: hidden; padding: 12px; }
.document-preview--cover canvas { width: 100% !important; height: 100% !important; min-height: 0; object-fit: contain; background: transparent; }
</style>
