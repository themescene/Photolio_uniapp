<script setup lang="ts">
withDefaults(defineProps<{
  actions: { target: string; title: string; eyebrow?: string; arrow: string }[]
  variant?: 'next' | 'compact'
}>(), { variant: 'next' })
const emit = defineEmits<{ navigate: [target: string] }>()
</script>

<template>
  <footer class="folio-page-actions" :class="'folio-page-actions--' + variant">
    <component :is="'button'" v-for="action in actions" :key="action.target" type="button"
      class="folio-page-actions__button" @click="emit('navigate', action.target)">
      <span v-if="action.eyebrow" class="folio-page-actions__eyebrow">{{ action.eyebrow }}</span>
      <strong class="folio-page-actions__title">{{ action.title }}</strong>
      <span class="folio-page-actions__arrow" aria-hidden="true">{{ action.arrow }}</span>
    </component>
  </footer>
</template>

<style scoped>
.folio-page-actions { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); border-top:1px solid var(--line); background:var(--tone,var(--lab-paper,var(--paper))); color:inherit; }
.folio-page-actions .folio-page-actions__button[type="button"] { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:clamp(12px,3vw,38px); min-width:0; width:100%; padding:clamp(12px,2.5dvh,24px) var(--folio-actions-inline,clamp(12px,2vw,26px)); font:inherit; background:transparent; color:inherit; border:0; border-radius:0; text-align:left; }
.folio-page-actions__eyebrow { font:600 11px/1.35 'Courier New',monospace; text-transform:uppercase; }
.folio-page-actions__title { min-width:0; font-size:clamp(19px,3vw,42px); line-height:1; letter-spacing:-.06em; }
.folio-page-actions__arrow { font-size:28px; line-height:1; justify-self:end; }
.folio-page-actions--compact { height:var(--folio-actions-height,80px); }
.folio-page-actions--compact .folio-page-actions__button[type="button"] { grid-template-columns:minmax(0,1fr) auto; gap:12px; padding:12px var(--gutter); }
.folio-page-actions--compact .folio-page-actions__button + .folio-page-actions__button { border-left:1px solid var(--line); }
.folio-page-actions--compact .folio-page-actions__title { font-size:clamp(13px,1.5vw,18px); font-weight:500; line-height:1.3; letter-spacing:0; }
.folio-page-actions--compact .folio-page-actions__arrow { font-size:20px; }
@media (max-width:600px) { .folio-page-actions--compact .folio-page-actions__button[type="button"] { padding-inline:14px; } }
</style>
