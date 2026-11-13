<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

// Animate a single exact replica of the cover with one uniform scale.
const emit = defineEmits<{ arrive: []; complete: [] }>()
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%+/='
const overlay = ref<HTMLElement | null>(null)
const title = ref<HTMLElement | null>(null)
let frame = 0
let stopped = false
let target: HTMLElement | null = null
let replica: HTMLElement | null = null
let replicaLines: HTMLElement[] = []
let originalWords: string[] = []
const animations: Animation[] = []
function finish() {
  if (stopped) return
  stopped = true
  cancelAnimationFrame(frame)
  animations.forEach(animation => animation.cancel())
  emit('arrive')
  emit('complete')
}
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') finish()
}
function copyType(source: HTMLElement, destination: HTMLElement) {
  const style = getComputedStyle(source)
  for (const property of ['display', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-kerning', 'font-feature-settings', 'letter-spacing', 'line-height', 'text-transform', 'margin', 'padding', 'width', 'height', 'box-sizing', 'overflow']) {
    destination.style.setProperty(property, style.getPropertyValue(property))
  }
  destination.style.animation = 'none'
  destination.style.transform = 'none'
  destination.style.visibility = 'visible'
}
async function travel() {
  if (stopped || !replica || !target || !title.value || !overlay.value) return finish()
  replicaLines.forEach((line, index) => { line.textContent = originalWords[index] })
  const to = target.getBoundingClientRect()
  const scale = Math.min(innerWidth * .78 / to.width, innerHeight * .48 / to.height)
  const x = (innerWidth - to.width * scale) / 2
  const y = (innerHeight - to.height * scale) / 2
  const destination = 'translate(' + to.left + 'px,' + to.top + 'px) scale(1)'
  // Cancelling the finished animation must leave the replica at its destination.
  title.value.style.transform = destination
  emit('arrive')
  animations.push(title.value.animate([
    { transform: 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')' },
    { transform: destination },
  ], { duration: 1100, easing: 'cubic-bezier(.25,.6,.2,1)', fill: 'forwards' }))
  overlay.value.style.backgroundColor = '#f0eee600'
  animations.push(overlay.value.animate([{ backgroundColor: '#f0eee6' }, { backgroundColor: '#f0eee600' }], {
    duration: 1100, easing: 'ease-in-out', fill: 'forwards',
  }))
  await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)))
  finish()
}
onMounted(async () => {
  window.addEventListener('keydown', key)
  window.addEventListener('resize', finish)
  await nextTick()
  target = document.querySelector<HTMLElement>('.folio-cover-type h1')
  if (!target || !title.value) return finish()
  replica = target.cloneNode(true) as HTMLElement
  copyType(target, replica)
  const sourceChildren = Array.from(target.querySelectorAll<HTMLElement>('*'))
  replica.querySelectorAll<HTMLElement>('*').forEach((element, index) => copyType(sourceChildren[index], element))
  title.value.append(replica)
  replicaLines = Array.from(replica.querySelectorAll<HTMLElement>('strong'))
  originalWords = replicaLines.map(line => line.textContent || '')
  const bounds = target.getBoundingClientRect()
  const scale = Math.min(innerWidth * .78 / bounds.width, innerHeight * .48 / bounds.height)
  title.value.style.transform = 'translate(' + ((innerWidth - bounds.width * scale) / 2) + 'px,' + ((innerHeight - bounds.height * scale) / 2) + 'px) scale(' + scale + ')'
  const start = performance.now()
  let last = -1
  function tick(now: number) {
    if (stopped) return
    const elapsed = now - start
    const beat = Math.floor(elapsed / 70)
    if (beat !== last) {
      last = beat
      replicaLines.forEach((line, index) => {
        line.textContent = Array.from(originalWords[index], (letter, position) => elapsed > 200 + position * 55
          ? letter : letters[Math.floor(Math.random() * letters.length)]).join('')
      })
    }
    if (elapsed >= 950) void travel()
    else frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
})
onUnmounted(() => {
  stopped = true
  cancelAnimationFrame(frame)
  animations.forEach(animation => animation.cancel())
  window.removeEventListener('keydown', key)
  window.removeEventListener('resize', finish)
})
</script>

<template>
  <Teleport to="body">
    <div ref="overlay" class="folio-intro" aria-label="Work Collection" role="status">
      <div ref="title" class="folio-intro__title" aria-hidden="true"></div>
    </div>
  </Teleport>
</template>

<style scoped>
.folio-intro { position:fixed; inset:0; z-index:2000; background:#f0eee6; color:#171914; pointer-events:none; }
.folio-intro__title { position:absolute; left:0; top:0; transform-origin:0 0; }
</style>
