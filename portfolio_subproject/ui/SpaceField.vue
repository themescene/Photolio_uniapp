<script setup lang="ts">
defineProps<{ label: string; hint?: string }>()
</script>
<template><component :is="'label'" class="ps-field"><span class="ps-field__label">{{ label }}</span><slot /><small v-if="hint">{{ hint }}</small></component></template>
<style scoped>
.ps-field { display: grid; align-content: start; gap: 7px; min-width: 0; width: 100%; }
.ps-field__label { font-size: 13px; line-height: 20px; font-weight: 550; color: var(--space-ink); }
.ps-field small { font-size: 12px; color: var(--space-muted); }
</style>
