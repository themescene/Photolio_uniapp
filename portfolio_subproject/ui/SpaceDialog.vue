<script setup lang="ts">
import { usePreviewText } from "@/i18n"
import { onMounted, onUnmounted, ref } from 'vue'
import SpaceButton from './SpaceButton.vue'
const uiText = usePreviewText()
const props = defineProps<{ title: string; wide?: boolean; reader?: boolean; busy?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement | null>(null)
let previousFocus: Element | null = null
let previousOverflow = ''
function key(event: KeyboardEvent) {
  const dialogs = document.querySelectorAll('.ps-dialog[aria-modal="true"]')
  if (dialogs.item(dialogs.length - 1) !== panel.value) return
  if (event.key === 'Escape') { event.preventDefault(); if (!props.busy) emit('close'); return }
  if (event.key !== 'Tab' || !panel.value) return
  const controls = [...panel.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')].filter(node => node.getClientRects().length)
  const first = controls[0], last = controls[controls.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => {
  previousFocus = document.activeElement; previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'; panel.value?.focus()
  window.addEventListener('keydown', key)
})
onUnmounted(() => {
  document.body.style.overflow = previousOverflow
  window.removeEventListener('keydown', key)
  if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
})
</script>
<template>
  <div class="ps-dialog-mask" @click.self="!busy && emit('close')">
    <section ref="panel" class="ps-dialog" :class="{ 'ps-dialog--wide': wide, 'ps-dialog--reader': reader }" tabindex="-1" role="dialog" aria-modal="true" :aria-label="title">
      <header class="ps-dialog__header"><h2>{{ title }}</h2><SpaceButton :disabled="busy" variant="quiet" :aria-label='uiText("关闭对话框")' @click="emit('close')">{{ uiText("关闭") }}</SpaceButton></header>
      <div class="ps-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="ps-dialog__footer"><slot name="footer" /></footer>
    </section>
  </div>
</template>
<style scoped>
.ps-dialog-mask { position: fixed; inset: 0; z-index: 140; display: grid; place-items: center; padding: 24px; background: #18201970; }
.ps-dialog { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(500px, 100%); max-height: min(840px, 92dvh); border: 1px solid var(--space-border); border-radius: 12px; background: var(--space-bg); box-shadow: 0 20px 80px #0002; outline: none; }
.ps-dialog--wide { width: min(1080px, 100%); height: min(780px, 90dvh); }
.ps-dialog--reader { width: min(1000px, 100%); }
.ps-dialog__header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 22px; border-bottom: 1px solid var(--space-border); }
.ps-dialog__header h2 { margin: 0; font-size: 21px; line-height: 1.4; }
.ps-dialog__body { padding: 22px; min-height: 0; overflow: auto; }
.ps-dialog__footer { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--space-border); background: var(--space-card); border-radius: 0 0 12px 12px; }
@media (max-width: 640px) { .ps-dialog-mask { padding: 8px; } .ps-dialog--wide { height: 95dvh; max-height: 95dvh; } .ps-dialog__body { padding: 14px; } .ps-dialog__header, .ps-dialog__footer { padding: 12px 14px; } }
</style>
