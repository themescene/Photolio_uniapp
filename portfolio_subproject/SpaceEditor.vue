<script setup lang="ts">
import { t as uiText } from "@/i18n";
import { computed, ref, watch } from 'vue'
import { logger } from '@/utils/logger'
import ContentPicker from './ContentPicker.vue'
import SpaceButton from './ui/SpaceButton.vue'
import SpaceField from './ui/SpaceField.vue'
import SpaceInput from './ui/SpaceInput.vue'
import SpaceBlockEditor from './editor/SpaceBlockEditor.vue'
import { addSection, commitCover, commitReference, makeBlock, moveItem } from './editor/draftOperations'
import { askConfirm, readableError } from './ui/feedback'
import { LAYOUTS } from './types'
import type { PersonalSpace, SpaceBlock, ContentItem } from './types'
const props = defineProps<{ draft: PersonalSpace; busy: boolean; initialSectionId?: string }>()
const emit = defineEmits<{ save: [sectionId: string]; cancel: []; reload: [] }>()
const activeId = ref(props.initialSectionId || props.draft.sections[0]?.id || '')
const active = computed(() => props.draft.sections.find(section => section.id === activeId.value) || props.draft.sections[0])
const picker = ref<{ sectionId: string; blockId?: string; role?: 'cover' } | null>(null)
const localError = ref('')
watch(() => props.draft.sections.map(section => section.id).join(','), () => {
  if (!props.draft.sections.some(section => section.id === activeId.value)) activeId.value = props.draft.sections[0]?.id || ''
})
function addProject() { if (props.draft.sections.length < 30) activeId.value = addSection(props.draft).id }
async function removeProject(index: number) {
  if (props.draft.sections.length > 1 && await askConfirm('移除这个栏目及其布局？原画匣子和媒体不会删除。')) props.draft.sections.splice(index, 1)
}
async function removeBlock(index: number) {
  if (await askConfirm('从当前栏目移除这块内容？原内容不会删除。')) active.value.blocks.splice(index, 1)
}
function pick(blockId?: string, role?: 'cover') {
  picker.value = { sectionId: active.value.id, blockId, role }
  logger.info('[picker-trace] open', JSON.stringify(picker.value))
}
function select(item: ContentItem) {
  if (!picker.value) return
  try {
    const section = props.draft.sections.find(value => value.id === picker.value?.sectionId)
    const before = section?.blocks.length
    if (picker.value.role === 'cover' && picker.value.blockId) { commitCover(props.draft, picker.value.sectionId, picker.value.blockId, item); picker.value = null; return }
    const block = commitReference(props.draft, picker.value.sectionId, picker.value.blockId, item)
    logger.info('[picker-trace] draft:confirmed', JSON.stringify({ sectionId: picker.value.sectionId, blockId: block.id, before, after: section?.blocks.length }))
    picker.value = null; localError.value = ''
  } catch (err) { localError.value = readableError(err) }
}
function patch(index: number, value: Partial<SpaceBlock>) { Object.assign(active.value.blocks[index], value) }
</script>

<template>
  <section class="space-editor" :aria-label='uiText("编辑个人空间")'>
    <header class="editor-toolbar">
      <div><strong>{{ uiText("编辑个人空间") }}</strong><span>{{ uiText("配置栏目和内容，保存后公开展示") }}</span></div>
      <div class="editor-actions"><SpaceButton :disabled="busy" @click="emit('cancel')">{{ uiText("取消编辑") }}</SpaceButton><SpaceButton variant="primary" :disabled="busy" @click="emit('save', active.id)">{{ busy ? uiText("正在保存…") : uiText("保存空间") }}</SpaceButton></div>
    </header>
    <div class="editor-shell">
      <aside class="editor-rail" :aria-label='uiText("编辑栏目列表")'>
        <SpaceField :label='uiText("空间名称")'><SpaceInput v-model="draft.title" :placeholder='uiText("输入空间名称")' :disabled="busy" /></SpaceField>
        <div class="editor-rail__heading"><strong>{{ uiText("栏目") }}</strong><span>{{ draft.sections.length }} / 30</span></div>
        <div class="editor-projects"><SpaceButton v-for="(section, index) in draft.sections" :key="section.id" class="editor-project" :aria-current="active.id === section.id ? 'page' : undefined" :disabled="busy" @click="activeId = section.id"><span>{{ index + 1 }}</span><strong>{{ section.title || uiText("未命名栏目") }}</strong><small>{{ section.blocks.length }}</small></SpaceButton></div>
        <SpaceButton :disabled="busy || draft.sections.length >= 30" @click="addProject">{{ uiText("添加栏目") }}</SpaceButton>
        <div class="editor-rail__bottom"><p>{{ uiText("布局只保存引用，不会修改原画匣子。") }}</p><SpaceButton variant="quiet" :disabled="busy" @click="emit('reload')">{{ uiText("重新加载已保存版本") }}</SpaceButton></div>
      </aside>
      <main v-if="active" class="editor-canvas">
        <p v-if="localError" class="space-message space-message--error" role="alert">{{ uiText(localError) }}</p>
        <section class="editor-settings" :aria-label='uiText("当前栏目设置")'>
          <div class="editor-panel-title"><div><small>{{ uiText("当前栏目") }}</small><h2>{{ active.title || uiText("未命名栏目") }}</h2></div><div class="editor-actions"><SpaceButton :disabled="busy || draft.sections[0].id === active.id" @click="moveItem(draft.sections, draft.sections.indexOf(active), -1)">{{ uiText("上移") }}</SpaceButton><SpaceButton :disabled="busy || draft.sections[draft.sections.length - 1].id === active.id" @click="moveItem(draft.sections, draft.sections.indexOf(active), 1)">{{ uiText("下移") }}</SpaceButton><SpaceButton variant="danger" :disabled="busy || draft.sections.length === 1" @click="removeProject(draft.sections.indexOf(active))">{{ uiText("移除栏目") }}</SpaceButton></div></div>
          <div class="editor-settings__fields"><SpaceField :label='uiText("栏目名称")'><SpaceInput v-model="active.title" :maxlength="60" :placeholder='uiText("输入项目或栏目名称")' :disabled="busy" /></SpaceField><SpaceField :label='uiText("内容布局")'><select v-model="active.layout" class="ps-select" :disabled="busy"><option v-for="layout in LAYOUTS" :key="layout.value" :value="layout.value">{{ uiText(layout.label) }}</option></select></SpaceField></div>
        </section>
        <div class="editor-size-options"><SpaceField :label='uiText("固定格子大小")'><component :is="'input'" type="checkbox" :checked="active.fixed_size === true" @change="active.fixed_size = ($event.target as HTMLInputElement).checked" /></SpaceField><SpaceField v-if="active.fixed_size" :label='uiText("格子比例")'><select class="ps-select" :value="active.aspect_ratio || '4:3'" @change="active.aspect_ratio = ($event.target as HTMLSelectElement).value as '1:1' | '4:3' | '16:9'"><option value="1:1">1:1</option><option value="4:3">4:3</option><option value="16:9">16:9</option></select></SpaceField></div>
        <div class="editor-content-heading"><h3>{{ uiText("内容") }} <span>{{ active.blocks.length }}</span></h3><div class="editor-actions"><SpaceButton variant="primary" :disabled="busy || active.blocks.length >= 100" @click="pick()">{{ uiText("选择已有内容") }}</SpaceButton><SpaceButton :disabled="busy || active.blocks.length >= 100" @click="active.blocks.push(makeBlock('text'))">{{ uiText("添加文字") }}</SpaceButton><SpaceButton :disabled="busy || active.blocks.length >= 100" @click="active.blocks.push(makeBlock('url'))">{{ uiText("媒体或文件链接") }}</SpaceButton></div></div>
        <div v-if="!active.blocks.length" class="editor-empty"><strong>{{ uiText("从一块内容开始") }}</strong><p>{{ uiText("选择已有画匣子、填写文字，或添加媒体链接。") }}</p><SpaceButton variant="primary" :disabled="busy" @click="pick()">{{ uiText("选择已有内容") }}</SpaceButton></div>
        <div class="editor-blocks"><SpaceBlockEditor v-for="(block, index) in active.blocks" :key="block.id" :block="block" :busy="busy" :index="index" :count="active.blocks.length" :grid="active.layout === 'grid'" @patch="patch(index, $event)" @move="moveItem(active.blocks, index, $event)" @remove="removeBlock(index)" @choose="pick(block.id)" @cover="pick(block.id, 'cover')" /></div>
      </main>
    </div>
    <Transition name="space-fade">
      <ContentPicker v-if="picker" :accept="picker.role === 'cover' ? 'image' : undefined" @select="select" @close="picker = null" />
    </Transition>
  </section>
</template>

<style scoped>
.space-editor { min-height: 100dvh; }
.editor-toolbar { position: sticky; top: 0; z-index: 30; display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 76px; padding: 16px 24px; border-bottom: 1px solid var(--space-border); background: var(--space-card); }
.editor-toolbar > div:first-child { display: grid; gap: 3px; }.editor-toolbar strong { font-size: 18px; }.editor-toolbar span { font-size: 12px; color: var(--space-muted); }
.editor-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.editor-shell { display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: calc(100dvh - 76px); }
.editor-rail { display: flex; flex-direction: column; gap: 18px; min-width: 0; padding: 24px 18px; border-right: 1px solid var(--space-border); background: #f0f2ec; }
.editor-rail__heading { display: flex; justify-content: space-between; font-size: 13px; }.editor-rail__heading span { color: var(--space-muted); }
.editor-projects { display: grid; gap: 7px; }.editor-project { width: 100%; justify-content: start; white-space: normal; text-align: left; }.editor-project[aria-current='page'] { background: #e3f2df; border-color: #92b78a; }.editor-project span { width: 20px; font-size: 12px; color: var(--space-muted); }.editor-project strong { flex: 1; overflow-wrap: anywhere; font-weight: 500; }.editor-project small { color: var(--space-muted); }
.editor-rail__bottom { margin-top: auto; display: grid; gap: 8px; }.editor-rail__bottom p { color: var(--space-muted); font-size: 12px; line-height: 1.6; margin: 0; }
.editor-canvas { padding: 26px 32px 80px; min-width: 0; max-width: 1160px; width: 100%; margin: 0 auto; }
.editor-settings { padding: 22px; border: 1px solid var(--space-border); background: var(--space-card); border-radius: 10px; }
.editor-panel-title { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; align-items: center; }.editor-panel-title small { color: var(--space-muted); font-size: 12px; }.editor-panel-title h2 { margin: 4px 0 0; font-size: 21px; overflow-wrap: anywhere; }
.editor-settings__fields { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: 16px; }.editor-size-options { display: flex; align-items: center; gap: 24px; padding: 18px 0; }
.editor-content-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin: 28px 0 16px; }.editor-content-heading h3 { margin: 0; font-size: 16px; }.editor-content-heading h3 span { margin-left: 6px; color: var(--space-muted); font-size: 13px; font-weight: 400; }
.editor-empty { padding: 56px 20px; text-align: center; border: 1px dashed #bec7b7; border-radius: 10px; background: #fafbf8; }.editor-empty strong { font-size: 17px; }.editor-empty p { color: var(--space-muted); font-size: 13px; }.editor-blocks { display: grid; gap: 16px; }
@media(max-width: 1000px) { .editor-shell { grid-template-columns: 220px minmax(0, 1fr); }.editor-canvas { padding: 20px; }.editor-panel-title { align-items: start; flex-direction: column; }.editor-settings__fields { grid-template-columns: 1fr; } }
@media(max-width: 640px) { .editor-toolbar { padding: 12px; flex-wrap: wrap; }.editor-shell { grid-template-columns: 1fr; }.editor-rail { border-right: 0; border-bottom: 1px solid var(--space-border); gap: 12px; padding: 16px; }.editor-projects { display: flex; overflow-x: auto; }.editor-project { min-width: 130px; width: auto; }.editor-rail__bottom { display: none; }.editor-canvas { padding: 16px 12px 50px; }.editor-settings { padding: 16px; } }
</style>
