<script setup lang="ts">
withDefaults(defineProps<{ modelValue?: string; placeholder?: string; maxlength?: number; rows?: number }>(), { modelValue: '', maxlength: 20000, rows: 6 })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
function input(event: Event) { emit('update:modelValue', (event.target as HTMLTextAreaElement).value) }
</script>
<template><component :is="'textarea'" class="ps-textarea" :value="modelValue" :placeholder="placeholder" :maxlength="maxlength" :rows="rows" @input="input" /></template>
<style scoped>
.ps-textarea { display: block; box-sizing: border-box; width: 100%; min-width: 0; min-height: 144px; padding: 12px; border: 1px solid var(--space-border); border-radius: 7px; background: var(--space-card); color: var(--space-ink); font: inherit; line-height: 1.7; resize: vertical; }
.ps-textarea:focus { outline: 2px solid #73ac7b; outline-offset: 1px; }
</style>
