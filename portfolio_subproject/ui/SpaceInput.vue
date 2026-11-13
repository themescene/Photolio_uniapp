<script setup lang="ts">
withDefaults(defineProps<{ modelValue?: string; type?: string; placeholder?: string; maxlength?: number; disabled?: boolean; readonly?: boolean; autofocus?: boolean }>(), { modelValue: '', type: 'text', maxlength: 100 })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
function input(event: Event) { emit('update:modelValue', (event.target as HTMLInputElement).value) }
</script>
<template><component :is="'input'" class="ps-input" :value="modelValue" :type="type" :placeholder="placeholder" :maxlength="maxlength" :disabled="disabled" :readonly="readonly" :autofocus="autofocus" @input="input" /></template>
<style scoped>
.ps-input { display: block; box-sizing: border-box; width: 100%; min-width: 0; height: 44px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--space-border); border-radius: 7px; background: var(--space-card); color: var(--space-ink); font: inherit; line-height: 22px; }
.ps-input:focus { outline: 2px solid #73ac7b; outline-offset: 1px; }
.ps-input:disabled { background: var(--space-bg); color: var(--space-muted); }
</style>
