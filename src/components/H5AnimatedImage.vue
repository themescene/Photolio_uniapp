<script setup lang="ts">
import { usePreviewText } from "@/i18n"
// GIF暂停使用canvas首帧；不导出像素，跨域图片也不会因canvas污染阻断显示。
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { usePlaybackStore } from '@/stores/playback'
const uiText = usePreviewText()
const props = withDefaults(defineProps<{ src: string; alt?: string; autoplay?: boolean; animation?: boolean; fit?: string; cropped?: boolean }>(), { alt: '', autoplay: true, fit: 'cover' })
const root = ref<HTMLElement | null>(null), canvas = ref<HTMLCanvasElement | null>(null), visible = ref(true), manual = ref(false), failed = ref(false)
const preferences = usePlaybackStore()
const emit = defineEmits<{ loaded: []; failed: [] }>()
function reportFailure() { failed.value = true; emit('failed') }
const animated = computed(() => props.animation ?? /\.gif(?:[?#]|$)/i.test(props.src))
const playing = computed(() => !animated.value || visible.value && (manual.value || props.autoplay && preferences.autoplay))
let observer: IntersectionObserver | null = null, generation = 0
async function frame() {
  const run = ++generation
  await nextTick()
  if (!animated.value || playing.value || !canvas.value) return
  const image = new Image()
  image.onload = () => {
    if (run !== generation || !canvas.value) { image.src = ''; return }
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.value.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.value.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.value.getContext('2d')?.drawImage(image, 0, 0, canvas.value.width, canvas.value.height)
    emit('loaded')
    image.src = ''
  }
  image.onerror = () => { if (run === generation) reportFailure() }
  image.src = props.src
}
watch(() => props.src, () => { manual.value = false; failed.value = false; void frame() })
watch(playing, () => void frame())
watch(() => props.autoplay && preferences.autoplay, () => { manual.value = false })
onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined' && root.value) { observer = new IntersectionObserver(entries => { visible.value = !!entries[0]?.isIntersecting }, { threshold: .1 }); observer.observe(root.value) }
  void frame()
})
onUnmounted(() => { ++generation; observer?.disconnect() })
</script>
<template>
  <div ref="root" class="animated-image" :class="['animated-image--' + fit, { 'animated-image--cropped': cropped }]" :style="fit === 'repeat' && playing ? { backgroundImage: `url(${JSON.stringify(src)})`, backgroundRepeat: 'repeat', backgroundSize: '160px auto' } : undefined">
    <span v-if="failed" class="animated-fallback">{{ uiText("图片暂时无法显示") }}</span>
    <img v-else-if="playing" :src="src" :alt="alt" loading="lazy" @load="emit('loaded')" @error="reportFailure" />
    <component :is="'canvas'" v-else ref="canvas" :aria-label="alt || uiText('GIF静止预览')" role="img" />
    <component :is="'button'" v-if="animated && !playing && !failed" type="button" class="gif-control" @click.stop="manual = true">{{ uiText("播放 GIF") }}</component>
    <component :is="'button'" v-if="animated && manual && playing" type="button" class="gif-control" @click.stop="manual = false">{{ uiText("暂停 GIF") }}</component>
  </div>
</template>
<style scoped>
.animated-image { position: relative; display: block; width: 100%; min-width: 0; overflow: hidden; }
.animated-image img,.animated-image canvas { display: block; width: 100%; height: auto; object-fit: cover; }
.animated-image--contain img,.animated-image--contain canvas { object-fit: contain; }
.animated-image--fill img,.animated-image--fill canvas { object-fit: fill; }
.animated-image--top img,.animated-image--top canvas { object-position: top; }
.animated-image--cropped { height: 100%; }.animated-image--cropped img,.animated-image--cropped canvas { height: 100%; }
.animated-image--cropped.animated-image--top img,.animated-image--cropped.animated-image--top canvas { position: absolute; inset: 0 auto auto 0; width: 100%; height: auto !important; }
.animated-image--repeat img { visibility: hidden; }
.animated-image--border { padding: 12px; background: #f7f3ee; }.animated-image--border img,.animated-image--border canvas { object-fit: contain; }
.animated-fallback { display: grid; place-items: center; min-height: 120px; padding: 20px; font-size: 13px; color: #6b5f52; background: #efe7dc; }
.gif-control { position: absolute; right: 10px; bottom: 10px; padding: 6px 10px; border: 0; border-radius: 5px; background: #111c; color: white; font-size: 12px; cursor: pointer; }
</style>
