<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'default' | 'primary' | 'danger' | 'quiet'; disabled?: boolean; type?: 'button' | 'submit' }>(), { variant: 'default', type: 'button' })
</script>
<template><component :is="'button'" class="ps-button" :class="'ps-button--' + variant" :disabled="disabled" :type="type"><slot /></component></template>
<style scoped>
.ps-button { display: inline-flex; align-items: center; justify-content: var(--ps-button-justify, center); gap: 6px; box-sizing: border-box; width: var(--ps-button-width, auto); min-height: 38px; margin: 0; padding: var(--ps-button-padding, 8px 13px); border: var(--ps-button-border, 1px solid var(--space-border)); border-radius: 7px; background: var(--ps-button-bg, var(--space-card)); color: var(--ps-button-color, var(--space-ink)); font: inherit; font-size: 13px; line-height: 20px; white-space: var(--ps-button-wrap, nowrap); cursor: pointer; text-align: var(--ps-button-align, center); }
.ps-button:hover:not(:disabled) { border-color: #92988e; background: var(--ps-button-hover-bg, #edf1eb); }
.ps-button--primary { background: var(--space-accent); border-color: #aad9ad; font-weight: 600; }
.ps-button--danger { color: #a33327; }
.ps-button--quiet { background: transparent; }
.ps-button:disabled { background: #f0f1ed; border-color: #e2e4de; color: #8b9087; cursor: not-allowed; }
.ps-button:focus-visible { outline: 2px solid #73ac7b; outline-offset: 2px; }
</style>
