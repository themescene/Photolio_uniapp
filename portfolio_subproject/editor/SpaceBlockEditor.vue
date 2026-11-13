<script setup lang="ts">
import { t as uiText } from "@/i18n";
import { ref } from 'vue'
import SpaceButton from '../ui/SpaceButton.vue'
import SpaceField from '../ui/SpaceField.vue'
import SpaceInput from '../ui/SpaceInput.vue'
import SpaceTextarea from '../ui/SpaceTextarea.vue'
import SpaceBlockView from '../SpaceBlock.vue'
import { contentTypeLabel } from '../content/contentRepository'
import { IMAGE_FITS } from '../types'
import type { SpaceBlock } from '../types'
defineProps<{ block: SpaceBlock; index: number; count: number; grid: boolean; busy: boolean }>()
const emit = defineEmits<{ patch: [value: Partial<SpaceBlock>]; move: [delta: number]; remove: []; choose: []; cover: [] }>()
const previewOpen = ref(false)
</script>
<template>
  <article class="block-editor"><fieldset class="block-editor__fieldset" :disabled="busy">
    <header class="block-editor__header"><div><span class="block-editor__number">{{ index + 1 }}</span><strong>{{ block.title || (block.kind === 'empty' ? uiText("空内容位") : block.kind === 'text' ? uiText("文字") : uiText("内容")) }}</strong><small>{{ block.kind === 'reference' ? contentTypeLabel(block.resolved?.type || 'share') : block.kind === 'url' ? uiText("媒体链接") : '' }}</small></div><div class="block-editor__actions"><SpaceButton variant="quiet" :disabled="index === 0" @click="emit('move', -1)">{{ uiText("前移") }}</SpaceButton><SpaceButton variant="quiet" :disabled="index === count - 1" @click="emit('move', 1)">{{ uiText("后移") }}</SpaceButton><SpaceButton variant="danger" @click="emit('remove')">{{ uiText("移除") }}</SpaceButton></div></header>
    <div class="block-editor__body">
      <div class="block-editor__fields">
        <SpaceField :label='uiText("内容标题")'><SpaceInput :model-value="block.title" :placeholder='uiText("为这块内容命名")' @update:model-value="emit('patch', { title: $event })" /></SpaceField>
        <SpaceField v-if="grid" :label='uiText("占用宽度")'><select class="ps-select" :value="block.span" @change="emit('patch', { span: Number(($event.target as HTMLSelectElement).value) })"><option :value="1">{{ uiText("一格") }}</option><option :value="2">{{ uiText("两格") }}</option></select></SpaceField>
        <SpaceField v-if="block.kind !== 'text' && block.kind !== 'empty'" :label='uiText("展示方式")'><select class="ps-select" :value="block.display" @change="emit('patch', { display: ($event.target as HTMLSelectElement).value as 'embed' | 'link' })"><option value="embed">{{ uiText("直接展示") }}</option><option value="link">{{ uiText("点击打开") }}</option></select></SpaceField>
      </div>
      <SpaceField v-if="block.kind === 'text'" :label='uiText("文字内容")'><SpaceTextarea :model-value="block.text" :placeholder='uiText("输入原文，不会自动改写")' @update:model-value="emit('patch', { text: $event })" /></SpaceField>
      <div v-else-if="block.kind === 'url'" class="block-editor__fields">
        <SpaceField :label='uiText("公开媒体链接")'><SpaceInput :model-value="block.url" type="url" :maxlength="2048" placeholder="https://…" @update:model-value="emit('patch', { url: $event })" /></SpaceField>
        <SpaceField :label='uiText("内容类型")'><select class="ps-select" :value="block.media_type" @change="emit('patch', { media_type: ($event.target as HTMLSelectElement).value })"><option value="gif">GIF</option><option value="image">{{ uiText("图片") }}</option><option value="video">{{ uiText("视频") }}</option><option value="audio">{{ uiText("音频") }}</option><option value="file">{{ uiText("文档或文件") }}</option></select></SpaceField>
      </div>
      <div v-else-if="block.kind === 'empty'" class="block-editor__empty"><p>{{ uiText("为这个位置添加内容") }}</p><div class="block-editor__actions"><SpaceButton variant="primary" @click="emit('choose')">{{ uiText("选择已有内容") }}</SpaceButton><SpaceButton @click="emit('patch', { kind: 'text', text: '' })">{{ uiText("填入文字") }}</SpaceButton><SpaceButton @click="emit('patch', { kind: 'url', url: '', media_type: 'image' })">{{ uiText("填入媒体链接") }}</SpaceButton></div></div>
      <div v-if="block.kind === 'reference'" class="block-editor__reference"><span>{{ uiText("已引用：") }}{{ block.resolved?.title || block.title }}</span><div class="block-editor__actions"><SpaceButton variant="quiet" @click="previewOpen = !previewOpen">{{ previewOpen ? uiText("收起预览") : uiText("预览") }}</SpaceButton><SpaceButton @click="emit('choose')">{{ uiText("更换内容") }}</SpaceButton></div></div>
      <div class="block-editor__fields"><SpaceField :label='uiText("背景缩略图链接")'><SpaceInput :model-value="block.cover_url" :maxlength="2048" :placeholder='uiText("可填写公开图片链接，或从已有图片选择")' @update:model-value="emit('patch', { cover_url: $event, cover_ref: undefined })" /></SpaceField><SpaceField :label='uiText("图片显示策略")'><select class="ps-select" :value="block.image_fit || (block.resolved?.type === 'file' || block.media_type === 'file' ? 'top' : 'cover')" @change="emit('patch', { image_fit: ($event.target as HTMLSelectElement).value as typeof block.image_fit })"><option v-for="fit in IMAGE_FITS" :key="fit.value" :value="fit.value">{{ uiText(fit.label) }}</option></select></SpaceField></div>
      <div class="block-editor__actions"><SpaceButton @click="emit('cover')">{{ uiText("选择缩略图") }}</SpaceButton><SpaceButton v-if="block.cover_url || block.cover_ref" @click="emit('patch', { cover_url: '', cover_ref: undefined })">{{ uiText("移除缩略图") }}</SpaceButton><SpaceField :label='uiText("自动播放视频和 GIF")'><component :is="'input'" type="checkbox" :checked="block.autoplay !== false" @change="emit('patch', { autoplay: ($event.target as HTMLInputElement).checked })" /></SpaceField></div>
      <div v-if="previewOpen && block.kind === 'reference'" class="block-editor__preview"><SpaceBlockView new-tab :block="block" /></div>
    </div>
  </fieldset></article>
</template>
<style scoped>
.block-editor__fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.block-editor { border: 1px solid var(--space-border); border-radius: 10px; background: var(--space-card); overflow: hidden; }
.block-editor__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e7e9e3; background: #fafbf8; }
.block-editor__header > div { display: flex; align-items: center; gap: 10px; min-width: 0; }
.block-editor__header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; font-size: 14px; }
.block-editor__header small { font-size: 12px; color: var(--space-muted); }
.block-editor__number { display: grid; place-items: center; width: 24px; height: 24px; background: #e9ece4; border-radius: 5px; font-size: 12px; flex-shrink: 0; }
.block-editor__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.block-editor__body { display: grid; gap: 16px; padding: 16px; }
.block-editor__fields { display: grid; grid-template-columns: minmax(160px, 1fr) repeat(2, minmax(120px, 150px)); align-items: start; gap: 12px; }
.block-editor__reference { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--space-muted); }
.block-editor__preview { max-width: 440px; max-height: 340px; overflow: auto; }
.block-editor__empty { padding: 12px; border: 1px dashed var(--space-border); border-radius: 7px; }
.block-editor__empty p { font-size: 13px; color: var(--space-muted); margin-top: 0; }
@media(max-width: 1000px) { .block-editor__fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .block-editor__fields > :first-child { grid-column: 1 / -1; } }
@media(max-width: 640px) { .block-editor__header { align-items: start; flex-direction: column; } .block-editor__header strong { max-width: 180px; } }
</style>
