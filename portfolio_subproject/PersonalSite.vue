<script setup lang="ts">
import { computed } from 'vue'
import LanguageSwitcher from "@/components/LanguageSwitcher.vue";
import { t as uiText } from "@/i18n";
import SpaceBlockView from './SpaceBlock.vue'
import SpaceEditor from './SpaceEditor.vue'
import SpaceButton from './ui/SpaceButton.vue'
import SpaceDialog from './ui/SpaceDialog.vue'
import SpaceInput from './ui/SpaceInput.vue'
import SpaceField from './ui/SpaceField.vue'
import { usePersonalSpace, askConfirm } from './usePersonalSpace'
import { blockImage } from './reading/content'
import './personal-site.css'
// 依据 context.md 第9节：共享渲染器，空间/栏目由地址加载，模板不携带别人的内容。
const site = usePersonalSpace()
const { space, mine, loading, busy, error, notice, editing, draft, menuOpen, activeSection, createOpen, createTitle, linkFallback } = site
const images = computed(() => (activeSection.value?.blocks || []).map(blockImage).filter(Boolean))
async function home(event: MouseEvent) {
  if (!editing.value) return
  event.preventDefault()
  if (await askConfirm('离开将放弃尚未保存的更改，继续吗？')) location.hash = '/'
}
async function reloadDraft() { if (await askConfirm('放弃当前编辑，重新读取已保存的版本？')) { editing.value = false; draft.value = null; void site.load() } }
</script>

<template>
  <div class="personal-site" :class="{ 'personal-site--editing': editing }">
    <header v-if="!editing" class="space-mobile-header"><SpaceButton type="button" :aria-expanded="menuOpen" aria-controls="space-navigation" @click="menuOpen = !menuOpen">{{ space?.title || uiText("个人空间") }}<span>{{ menuOpen ? uiText("收起栏目") : uiText("展开栏目") }}</span></SpaceButton></header>
    <aside v-if="!editing" id="space-navigation" class="space-sidebar" :class="{ 'space-sidebar--open': menuOpen }">
      <div class="space-brand">{{ space?.title || uiText("个人空间") }}</div>
      <LanguageSwitcher /><nav :aria-label='uiText("个人空间栏目")'><SpaceButton v-for="section in space?.sections || []" :key="section.id" type="button" :aria-current="activeSection?.id === section.id ? 'page' : undefined" :disabled="editing" @click="site.chooseSection(section.id)">{{ section.title }}</SpaceButton></nav>
      <div class="space-sidebar__actions"><SpaceButton v-if="space?.can_edit && !editing" type="button" @click="site.edit">{{ uiText("编辑空间") }}</SpaceButton><SpaceButton v-if="space?.space_id" type="button" @click="site.copyLink">{{ uiText("复制空间链接") }}</SpaceButton><SpaceButton type="button" class="space-accent" :disabled="busy || editing" @click="site.beginCreate">{{ site.auth.isLoggedIn ? (space?.space_id ? uiText("使用此布局创建空间") : uiText("使用模板创建空间")) : uiText("登录并创建自己的空间") }}</SpaceButton></div>
      <nav v-if="mine.length" :aria-label='uiText("我的空间")'><p>{{ uiText("我的空间") }}</p><SpaceButton v-for="item in mine" :key="item.space_id" type="button" :disabled="editing" @click="site.openSpace(item.space_id)">{{ item.title }}</SpaceButton></nav>
      <a class="space-home" href="/#/" @click="home">{{ uiText("返回画匣子") }}</a>
    </aside>
    <Transition name="space-fade">
      <SpaceButton v-if="menuOpen && !editing" class="space-menu-mask" :aria-label='uiText("关闭栏目菜单")' @click="menuOpen = false" />
    </Transition>
    <Transition name="space-fade">
    <SpaceDialog v-if="createOpen" :title='uiText("创建自己的个人空间")' :busy="busy" @close="createOpen = false">
      <component :is="'form'" id="create-space-form" class="space-create-form" @submit.prevent="site.create">
        <SpaceField :label='uiText("空间名称")'><SpaceInput v-model="createTitle" :disabled="busy" :maxlength="100" autofocus required /></SpaceField>
        <p>{{ uiText("空间默认公开。仅复制布局，原作者的内容不会复制到你的空间。") }}</p><p v-if="error" role="alert">{{ uiText(error) }}</p>
      </component>
      <template #footer><SpaceButton :disabled="busy" @click="createOpen = false">{{ uiText("取消") }}</SpaceButton><SpaceButton type="submit" form="create-space-form" variant="primary" :disabled="busy || !createTitle.trim()">{{ busy ? uiText("正在创建…") : uiText("创建空间") }}</SpaceButton></template>
    </SpaceDialog>
    </Transition>
    <main class="space-main">
      <p v-if="loading" role="status">{{ uiText("正在打开个人空间…") }}</p>
      <div v-if="error" class="space-message space-message--error" role="alert">{{ uiText(error) }} <SpaceButton v-if="!editing" type="button" @click="site.load()">{{ uiText("重试") }}</SpaceButton></div>
      <p v-if="notice" class="space-message" role="status">{{ uiText(notice) }}</p><SpaceInput v-if="linkFallback" :model-value="linkFallback" readonly :aria-label='uiText("空间链接")' class="space-link-fallback" />
      <template v-if="space && !loading">
        <SpaceEditor v-if="editing && draft" :draft="draft" :busy="busy" :initial-section-id="activeSection?.id" @save="site.save" @cancel="site.cancel" @reload="reloadDraft" />
        <Transition v-else name="space-section">
          <div :key="activeSection?.id || space.space_id">
            <header class="space-page-title">
              <p v-if="space.is_template">{{ uiText("个人空间 · 模板预览") }}</p>
              <h1>{{ activeSection?.title || space.title }}</h1>
              <p v-if="space.is_template">{{ uiText("从这个布局开始，加入自己的画匣子内容。") }}</p>
            </header>
            <div v-if="activeSection?.blocks.length" class="space-content"
              :class="['space-content--' + activeSection.layout, { 'space-content--fixed': activeSection.fixed_size }]"
              :style="activeSection.fixed_size ? { '--block-ratio': (activeSection.aspect_ratio || '4:3').replace(':', ' / ') } : undefined">
              <SpaceBlockView v-for="block in activeSection.blocks" :key="block.id" :block="block" :fixed="activeSection.fixed_size" :images="images" />
            </div>
            <div v-else class="space-empty">
              <p>{{ space.is_template ? uiText("charles的作品集") : uiText("这个栏目还没有内容") }}</p>
              <SpaceButton v-if="space.can_edit" type="button" @click="site.edit">{{ uiText("添加内容") }}</SpaceButton>
            </div>
          </div>
        </Transition>
      </template>
    </main>
  </div>
</template>

