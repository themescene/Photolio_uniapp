<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
const geometry = { width: 1000, height: 540, cardWidth: 300, cardHeight: 480, step: 340 }
function wrap(value: number, count: number) { return count ? ((value % count) + count) % count : 0 }
const props = defineProps<{ images: { url: string; title: string }[] }>()
const images = computed(() => props.images.slice(0, 10))
const rotation = ref(Math.floor(Math.random() * Math.max(1, images.value.length)))
const displayedRotation = ref(rotation.value)
const dragging = ref(false)
const face = ref<HTMLElement | null>(null)
const caption = ref<HTMLElement | null>(null)
const fit = ref(0)
let resize: ResizeObserver | undefined
let frame = 0
let pointer: number | undefined
let capture: HTMLElement | undefined
let initial = 0
let startX = 0, moved = false
const index = computed(() => wrap(Math.round(rotation.value), images.value.length))
const reduceMotion = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined
onMounted(() => {
  if (!face.value || !caption.value) return
  const measure = () => {
    if (!face.value || !caption.value) return
    const { width, height } = face.value.getBoundingClientRect()
    fit.value = Math.max(0, Math.min(width / geometry.width, (height - caption.value.getBoundingClientRect().height - 12) / geometry.height))
  }
  measure()
  resize = new ResizeObserver(measure)
  resize.observe(face.value)
  resize.observe(caption.value)
})
// One animation, one pose per original image. Dragging interrupts at the current pose.
watch([rotation, dragging], () => {
  cancelAnimationFrame(frame)
  if (dragging.value || reduceMotion?.matches) {
    displayedRotation.value = rotation.value
    return
  }
  const from = displayedRotation.value, target = rotation.value, start = performance.now()
  function animate(now: number) {
    const t = Math.min(1, (now - start) / 560)
    displayedRotation.value = from + (target - from) * (1 - Math.pow(1 - t, 4))
    if (t < 1) frame = requestAnimationFrame(animate)
  }
  frame = requestAnimationFrame(animate)
}, { flush: 'sync' })
onUnmounted(() => { cancelAnimationFrame(frame); resize?.disconnect() })
function cardStyle(i: number) {
  const count = images.value.length
  const distance = wrap(i - displayedRotation.value + count / 2, count) - count / 2
  return {
    left: `${geometry.width / 2 + distance * geometry.step}px`, top: `${geometry.height / 2}px`,
    width: `${geometry.cardWidth}px`, height: `${geometry.cardHeight}px`,
    transform: 'translate(-50%,-50%)',
    visibility: Math.abs(distance) > 2 ? 'hidden' as const : 'visible' as const,
  }
}
function down(event: PointerEvent) {
  if (pointer !== undefined || !event.isPrimary || event.button !== 0) return
  pointer = event.pointerId
  capture = event.currentTarget as HTMLElement
  startX = event.clientX
  rotation.value = displayedRotation.value
  initial = displayedRotation.value
  moved = false
  dragging.value = true
  capture.setPointerCapture(event.pointerId)
}
function move(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  const dx = event.clientX - startX
  if (Math.abs(dx) > 5) moved = true
  if (moved && fit.value > 0) rotation.value = initial - dx / (geometry.step * fit.value)
}
function up(event: PointerEvent) {
  if (event.pointerId !== pointer) return
  pointer = undefined
  dragging.value = false
  rotation.value = Math.round(rotation.value) + (!moved && event.type === 'pointerup' ? 1 : 0)
  if (capture?.hasPointerCapture(event.pointerId)) capture.releasePointerCapture(event.pointerId)
  capture = undefined
}
</script>

<template>
  <div v-if="images.length" class="folio-wheel">
    <component :is="'button'" ref="face" type="button" class="folio-wheel__face" :class="{ 'folio-wheel__face--dragging': dragging }"
      aria-label="Image carousel. Click to advance, drag horizontally, or use the arrow keys."
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up"
      @click="event => { if (event.detail === 0) rotation++ }"
      @keydown.left.prevent="rotation--" @keydown.right.prevent="rotation++">
      <span class="folio-wheel__viewport" :style="{ height: geometry.height * fit + 'px' }" aria-hidden="true">
        <span class="folio-wheel__strip" :style="{ width: geometry.width + 'px', height: geometry.height + 'px', transform: `translate(-50%,-50%) scale(${fit})` }">
          <img v-for="(item, i) in images" :key="item.url" :src="item.url" alt="" draggable="false"
            :class="{ 'folio-wheel__card--active': i === index }" :style="cardStyle(i)" />
        </span>
      </span>
      <span ref="caption" class="folio-wheel__caption" aria-live="polite"><span>{{ images[index]?.title }}</span><span>{{ index + 1 }} / {{ images.length }}</span></span>
      <span class="folio-hover-hint" aria-hidden="true">Drag to browse · Click to advance</span>
    </component>
    <div class="folio-wheel__center"><slot /></div>
  </div>
</template>
