<script setup lang="ts">
import { t as uiText } from "@/i18n";
import { ref } from 'vue'
import SpaceDialog from './ui/SpaceDialog.vue'
import SpaceButton from './ui/SpaceButton.vue'
import SpaceInput from './ui/SpaceInput.vue'
import SpaceBlockView from './SpaceBlock.vue'
import { STATIC_BASE } from '@/config/env'
import { useContentPicker } from './content/useContentPicker'
import { contentKey, contentTypeLabel } from './content/contentRepository'
import type { ContentItem } from './types'
const props = defineProps<{ accept?: 'image' }>()
const failedCovers = ref(new Set<string>())
const emit = defineEmits<{ select: [item: ContentItem]; close: [] }>()
const { category, query, sourceId, sourceTitle, items, selected, loading, error, total, preview, load, switchCategory, choose, back, confirmSelection } = useContentPicker()
function confirm() { const item = confirmSelection(); if (item) emit('select', item) }
function cover(value?: string) { return value?.startsWith('/uploads/') ? STATIC_BASE + value : /^https?:\/\//i.test(value || '') ? value : '' }
</script>
<template>
  <SpaceDialog :title='uiText("选择已有内容")' wide @close="emit('close')">
    <div class="picker">
      <p class="picker-intro">{{ uiText("引用已有内容，不会重新上传或改动原画匣子。选中后可预览，再确认添加。") }}</p>
      <div class="picker-tabs" role="group" :aria-label='uiText("内容来源")'>
        <SpaceButton :aria-pressed="category === 'share'" @click="switchCategory('share')">{{ uiText("画匣子与相册") }}</SpaceButton>
        <SpaceButton :aria-pressed="category === 'group'" @click="switchCategory('group')">{{ uiText("合集") }}</SpaceButton>
        <SpaceButton :aria-pressed="category === 'preset'" @click="switchCategory('preset')">{{ uiText("文件") }}</SpaceButton>
      </div>
      <component :is="'form'" class="picker-search" @submit.prevent="load()">
        <template v-if="sourceId"><SpaceButton @click="back">{{ uiText("返回列表") }}</SpaceButton><strong>{{ sourceTitle }}</strong></template>
        <template v-else><SpaceInput v-model="query" :placeholder='uiText("按标题搜索")' :aria-label='uiText("按标题搜索")' /><SpaceButton type="submit" :disabled="loading">{{ uiText("搜索") }}</SpaceButton></template>
        <SpaceButton :disabled="loading" @click="load(false, true)">{{ uiText("刷新") }}</SpaceButton>
      </component>
      <div class="picker-workspace">
        <section class="picker-results" :aria-label='uiText("可选内容")' :aria-busy="loading">
          <p v-if="loading" class="picker-status" role="status">{{ uiText("正在读取") }}{{ sourceId ? uiText("画匣子中的内容") : uiText("内容列表") }}…</p>
          <div v-else-if="error" class="picker-status" role="alert">{{ uiText(error) }} <SpaceButton @click="load(false, true)">{{ uiText("重试") }}</SpaceButton></div>
          <p v-else-if="!items.length" class="picker-status">{{ uiText("暂时没有匹配的内容") }}</p>
          <div v-else class="picker-grid">
            <SpaceButton v-for="item in items" :key="contentKey(item)" class="picker-item" :class="{ 'picker-item--selected': selected && contentKey(selected) === contentKey(item) }" :disabled="loading || item.public === false || item.archived || (props.accept === 'image' && !item.expandable && !['image', 'gif'].includes(item.type))" :aria-pressed="!item.expandable ? !!selected && contentKey(selected) === contentKey(item) : undefined" @click="choose(item)">
              <img v-if="cover(item.cover) && !failedCovers.has(contentKey(item))" @error="failedCovers.add(contentKey(item))" :src="cover(item.cover)" alt="" loading="lazy" />
              <span class="picker-item__title">{{ item.title }}</span><span class="picker-item__type">{{ item.public === false ? uiText("源内容尚未公开") : item.archived ? uiText("媒体已归档") : uiText(contentTypeLabel(item.type)) + (item.expandable ? uiText(" · 展开选择") : '') }}</span>
            </SpaceButton>
          </div>
          <SpaceButton v-if="items.length < total && !loading" class="picker-more" @click="load(true)">{{ uiText('加载更多（') }}{{ items.length }}/{{ total }}）</SpaceButton>
        </section>
        <aside class="picker-preview" :aria-label='uiText("所选内容预览")'><h3>{{ uiText("内容预览") }}</h3><SpaceBlockView new-tab v-if="preview" :key="selected ? contentKey(selected) : ''" :block="preview" /><p v-else>{{ uiText("选择左侧内容，在这里预览。") }}<br />{{ uiText("展开画匣子后，可选择整份或其中的图片、文字、音视频。") }}</p></aside>
      </div>
      <p class="picker-upload"><a href="/#/pages/upload/index" target="_blank" rel="noopener noreferrer">{{ uiText("前往画匣子上传") }}</a><span>{{ uiText("在新标签页上传，当前草稿保留。完成后点击“刷新”。") }}</span></p>
    </div>
    <template #footer><span class="picker-selection">{{ selected ? uiText("已选择：") + selected.title : uiText("尚未选择内容") }}</span><SpaceButton @click="emit('close')">{{ uiText("取消") }}</SpaceButton><SpaceButton variant="primary" :disabled="!selected || loading" @click="confirm">{{ uiText("确认添加") }}</SpaceButton></template>
  </SpaceDialog>
</template>
<style scoped>
.picker { height: 100%; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.picker-intro { margin: 0; color: var(--space-muted); font-size: 13px; }
.picker-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.picker-tabs [aria-pressed='true'] { background: #e2f3e4; border-color: #387448; color: #193f23; }
.picker-search { display: flex; gap: 8px; align-items: center; }
.picker-search .ps-input { flex: 1; min-width: 0; } .picker-search strong { flex: 1; overflow-wrap: anywhere; }
.picker-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 290px; flex: 1; min-height: 180px; gap: 18px; overflow: hidden; }
.picker-results { overflow: auto; padding: 2px; min-width: 0; }
.picker-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.picker-item.ps-button { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; width: 100%; min-height: 108px; text-align: left; padding: 12px; white-space: normal; gap: 8px; }
.picker-item img { width: 100%; height: 100px; object-fit: cover; border-radius: 4px; }
.picker-item__title { font-weight: 550; overflow-wrap: anywhere; } .picker-item__type { font-size: 12px; color: #62625e; }
.picker-item--selected.ps-button { border: 2px solid #387448; padding: 11px; background: #edf7ee; }
.picker-preview { min-width: 0; overflow: auto; background: #eceee9; border-radius: 8px; padding: 14px; }
.picker-preview h3 { margin: 0 0 12px; font-size: 14px; } .picker-preview p, .picker-status { color: var(--space-muted); font-size: 13px; line-height: 1.8; }
.picker-upload { margin: 0; padding-top: 12px; border-top: 1px solid var(--space-border); font-size: 12px; color: var(--space-muted); display: flex; gap: 10px; flex-wrap: wrap; } .picker-upload a { color: #275e35; }
.picker-selection { flex: 1; min-width: 120px; font-size: 13px; overflow-wrap: anywhere; } .picker-more { margin-top: 12px; }
@media (max-width: 640px) { .picker-workspace { grid-template-columns: minmax(0, 1fr); overflow: auto; } .picker-results { overflow: visible; } .picker-preview { min-height: 110px; overflow: visible; } .picker-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .picker-item img { height: 75px; } }
</style>
