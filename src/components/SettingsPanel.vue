<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 创作设置面板 —— 移植自 annualreport/src/views/UploadView.vue:1925-2010
 *
 * 2026-07-13 用户改版：
 *   - 「作者署名」 + 「使用原图」 + 「自动播放音频」 折叠进「更多设置」展开栏
 *   - 「模板」压缩为单行横向滚动 + 末尾渐变蒙版 + 「更多模板」（点开展全部）
 *   - 「保存到」按 mode 重做默认：
 *       memory 默认 personal；group（追加章节）默认 both；album 默认 both
 */
import { ref, computed, onMounted, watch } from "vue";
import { fetchMyGroups } from "@/api/group";
import { logger } from "@/utils/logger";
import type { GroupInfo, TemplateType } from "@/types";
import SvgIcon from "@/components/SvgIcon.vue";

type CreationMode = "memory" | "group" | "album";

interface Props {
  autoPlayAudio: boolean;
  groupId: string | null;
  personalPinned: boolean;
  originalQuality: boolean;
  authorDisplayName: string;
  preferredTemplate: TemplateType | "";
  open: boolean;
  /** 创作模式 —— 决定「保存到」的默认档 + 是否显示模板选择器 */
  mode?: CreationMode;
}
const props = withDefaults(defineProps<Props>(), { mode: "memory" });

const emit = defineEmits<{
  (e: "update:autoPlayAudio", v: boolean): void;
  (e: "update:groupId", v: string | null): void;
  (e: "update:personalPinned", v: boolean): void;
  (e: "update:originalQuality", v: boolean): void;
  (e: "update:authorDisplayName", v: string): void;
  (e: "update:preferredTemplate", v: TemplateType | ""): void;
  (e: "update:open", v: boolean): void;
}>();

// 与 share/edit.vue 的 TEMPLATES 保持一致
const TEMPLATES: { id: TemplateType | ""; label: string }[] = [
  { id: "",              label: "自动" },
  { id: "wooden_box",    label: "木匣" },
  { id: "food",          label: "美食" },
  { id: "work",          label: "工作" },
  { id: "sports",        label: "运动" },
  { id: "entertainment", label: "娱乐" },
  { id: "hobby",         label: "爱好" },
  { id: "reflection",    label: "随笔" },
  { id: "pixel_surf",    label: "像素" },
  { id: "valentine",     label: "情书" },
  { id: "travel_vlog",   label: "旅行" },
];
// 单行折叠展示：前 5 个 + 末尾「更多」；相册模式不显示模板
const TEMPLATE_COLLAPSED_COUNT = 5;
const templatesExpanded = ref(false);
const visibleTemplates = computed(() =>
  templatesExpanded.value ? TEMPLATES : TEMPLATES.slice(0, TEMPLATE_COLLAPSED_COUNT),
);

// 「更多设置」展开栏：2026-07-13 用户反馈「选项界面已经足够简洁了」→ 默认展开
const advancedOpen = ref(true);

const groups = ref<GroupInfo[]>([]);
const loading = ref(false);

type FolderMode = "personal" | "group" | "both";
const folderMode = computed<FolderMode>(() => {
  if (!props.groupId) return "personal";
  return props.personalPinned ? "both" : "group";
});

// 按 mode 计算「保存到」默认值——首次面板打开、未主动选过时套用
// memory 默认 personal；group（有 pendingGroupId 或用户选了 group 模式）默认 both；album 默认 both
const defaultFolderMode = computed<FolderMode>(() => {
  if (props.mode === "album") return "both";
  if (props.mode === "group") return "both";
  return "personal";
});

function setMode(mode: FolderMode) {
  if (mode === "personal") {
    emit("update:groupId", null);
    emit("update:personalPinned", false);
  } else if (mode === "group") {
    if (!props.groupId && groups.value[0]) emit("update:groupId", groups.value[0].group_id);
    emit("update:personalPinned", false);
  } else {
    if (!props.groupId && groups.value[0]) emit("update:groupId", groups.value[0].group_id);
    emit("update:personalPinned", true);
  }
}

async function loadGroups() {
  loading.value = true;
  try {
    const r = await fetchMyGroups();
    groups.value = r.groups || [];
    // 面板打开后如果没有主动选择过，按 mode 套默认档
    if (props.open) applyDefaultFolder();
  } catch (e) {
    logger.warn("[settings-panel] fetch groups failed", e);
  } finally {
    loading.value = false;
  }
}

function applyDefaultFolder() {
  const cur = folderMode.value;
  const def = defaultFolderMode.value;
  if (cur !== def) {
    // 只在「首次打开 + 无用户手选」时切换；已选状态尊重用户
    if (cur === "personal" && def !== "personal" && groups.value.length > 0) {
      setMode(def);
    }
  }
}

onMounted(loadGroups);

// mode 变化时（比如用户在 UPLOAD 步骤切了 A→C）重新套默认档
watch(() => props.mode, () => {
  if (!props.open) return;
  applyDefaultFolder();
});

function close() { emit("update:open", false); }
function onGroupPicked(e: { detail: { value: number } }) {
  const idx = e.detail.value;
  emit("update:groupId", groups.value[idx]?.group_id || null);
}

function toggleAdvanced() { advancedOpen.value = !advancedOpen.value; }
function expandTemplates() { templatesExpanded.value = true; }
</script>

<template>
  <view v-if="open" class="overlay" @click="close">
    <view class="panel" @click.stop>
      <view class="panel-header">
        <text class="panel-title">{{ uiText("创作设置") }}</text>
        <view class="close-btn" @click="close"><text>×</text></view>
      </view>

      <!-- 模板选择：相册模式下隐藏；其余模式下压缩为一行 + 「更多模板」 -->
      <view v-if="mode !== 'album'" class="row block">
        <view class="row-head">
          <text class="row-label">{{ uiText("模板") }}</text>
          <text class="row-sub">{{ uiText("选「自动」由系统按图片内容挑") }}</text>
        </view>
        <view class="tpl-strip-wrap">
          <scroll-view scroll-x class="tpl-strip" :scroll-with-animation="true">
            <view class="tpl-strip-inner">
              <view
                v-for="tpl in visibleTemplates" :key="tpl.id || 'auto'"
                class="pill"
                :class="{ active: preferredTemplate === tpl.id }"
                @click="emit('update:preferredTemplate', tpl.id)"
              ><text>{{ uiText(tpl.label) }}</text></view>
              <view
                v-if="!templatesExpanded && TEMPLATES.length > TEMPLATE_COLLAPSED_COUNT"
                class="pill pill-more"
                @click="expandTemplates"
              >
                <text>{{ uiText("更多模板") }}</text>
                <SvgIcon name="chevron-right" size="20rpx" color="#3D2E1F" />
              </view>
            </view>
          </scroll-view>
          <!-- 右侧渐变蒙版：暗示还能横向滑；点开「更多」后隐藏 -->
          <view
            v-if="!templatesExpanded && TEMPLATES.length > TEMPLATE_COLLAPSED_COUNT"
            class="tpl-fade"
          />
        </view>
      </view>

      <view v-if="mode !== 'album'" class="divider" />

      <!-- 保存到：三档 pill；相册模式默认「两边都放」；memory 默认「仅我的」 -->
      <view class="row block">
        <text class="row-label">{{ uiText("保存到") }}</text>
        <view class="folder-pills">
          <view
            class="pill"
            :class="{ active: folderMode === 'personal' }"
            @click="setMode('personal')"
          >
            <text>{{ uiText("仅我的画匣子") }}</text>
          </view>
          <view
            v-if="groups.length > 0"
            class="pill"
            :class="{ active: folderMode === 'group' }"
            @click="setMode('group')"
          >
            <text>{{ uiText("仅合集") }}</text>
          </view>
          <view
            v-if="groups.length > 0"
            class="pill"
            :class="{ active: folderMode === 'both' }"
            @click="setMode('both')"
          >
            <text>{{ uiText("两边都放") }}</text>
          </view>
        </view>

        <view v-if="folderMode !== 'personal' && groups.length > 0" class="group-select-wrap">
          <picker
            mode="selector"
            :range="groups"
            range-key="group_name"
            @change="onGroupPicked"
          >
            <view class="group-select">
              <text class="group-name">
                {{ groups.find(g => g.group_id === groupId)?.group_name || uiText("选择合集") }}
              </text>
              <text class="caret">▾</text>
            </view>
          </picker>
        </view>
        <view v-else-if="folderMode !== 'personal' && !loading && groups.length === 0" class="no-groups">
          <text>{{ uiText("你还没有合集，新建画匣子时无法选择") }}</text>
        </view>
      </view>

      <view class="divider" />

      <!-- 「更多设置」展开栏：作者署名 + 使用原图 + 自动播放音频 -->
      <view class="row block">
        <view class="advanced-head" @click="toggleAdvanced">
          <text class="row-label">{{ uiText("更多设置") }}</text>
          <text class="advanced-hint">{{ uiText("署名、原图、自动播放") }}</text>
          <view class="advanced-chevron" :class="{ open: advancedOpen }">
            <SvgIcon name="chevron-right" size="28rpx" color="#3D2E1F" />
          </view>
        </view>

        <view v-if="advancedOpen" class="advanced-body">
          <view class="row block">
            <text class="row-label">{{ uiText("作者署名") }}</text>
            <text class="row-sub">{{ uiText("留空将用你的昵称显示") }}</text>
            <input
              class="input"
              :value="authorDisplayName"
              maxlength="30"
              :placeholder='uiText("比如：奶奶的小棉袄")'
              @input="(e: any) => emit('update:authorDisplayName', e?.detail?.value ?? '')"
            />
          </view>

          <view class="row toggle-row">
            <view class="label-stack">
              <text class="row-label">{{ uiText("使用原图") }}</text>
              <text class="row-sub">{{ uiText("关闭后系统会压缩以省流量；本月余量在「我的」里查看") }}</text>
            </view>
            <view
              class="toggle-track"
              :class="{ on: originalQuality }"
              @click="emit('update:originalQuality', !originalQuality)"
            >
              <view class="toggle-thumb" />
            </view>
          </view>

          <view class="row toggle-row">
            <text class="row-label">{{ uiText("自动播放音频") }}</text>
            <view
              class="toggle-track"
              :class="{ on: autoPlayAudio }"
              @click="emit('update:autoPlayAudio', !autoPlayAudio)"
            >
              <view class="toggle-thumb" />
            </view>
          </view>
        </view>
      </view>

      <view class="actions">
        <button class="btn btn-primary" @click="close"><text>{{ uiText("完成") }}</text></button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 100;
  display: flex; align-items: flex-end;
}
.panel {
  width: 100%;
  background: t.$color-bg;
  border-top-left-radius: 32rpx;
  border-top-right-radius: 32rpx;
  padding: t.$spacing-4 t.$spacing-4 calc(env(safe-area-inset-bottom) + #{t.$spacing-4});
  display: flex; flex-direction: column;
  gap: t.$spacing-4;
  max-height: 92vh;
  overflow-y: auto;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
}
.panel-title { font-size: t.$font-lg; font-weight: t.$weight-bold; color: t.$color-text; }
.close-btn {
  width: 56rpx; height: 56rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
  font-size: 40rpx; color: t.$color-text-soft;
}

.row { display: flex; flex-direction: column; gap: t.$spacing-2; }
.row.block { gap: t.$spacing-3; }
.row-head { display: flex; flex-direction: column; gap: 4rpx; }
.toggle-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: t.$spacing-3;
}
.row-label { font-size: t.$font-md; color: t.$color-text; }
.label-stack { display: flex; flex-direction: column; gap: 4rpx; flex: 1; padding-right: t.$spacing-3; }
.row-sub { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.4; }

.toggle-track {
  width: 88rpx; height: 48rpx; border-radius: 999rpx;
  background: t.$color-surface-2;
  position: relative;
  transition: background 0.2s;
  flex: 0 0 auto;
}
.toggle-track.on { background: t.$color-accent; }
.toggle-thumb {
  position: absolute; top: 4rpx; left: 4rpx;
  width: 40rpx; height: 40rpx; border-radius: 50%;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.2);
  transition: transform 0.2s;
}
.toggle-track.on .toggle-thumb { transform: translateX(40rpx); }

.divider { height: 2rpx; background: t.$color-border; }

.folder-pills { display: flex; gap: t.$spacing-2; flex-wrap: wrap; }
.input {
  height: 80rpx;
  padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  font-size: t.$font-md;
  color: t.$color-text;
}
.pill {
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  white-space: nowrap;
}
.pill.active {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}
.pill.pill-more {
  border-style: dashed;
  color: t.$color-text;
}

// 模板单行横向滚动
.tpl-strip-wrap {
  position: relative;
  width: 100%;
}
.tpl-strip {
  width: 100%;
  white-space: nowrap;
}
.tpl-strip-inner {
  display: inline-flex;
  gap: t.$spacing-2;
  padding-right: 60rpx;   // 让最后一个 pill 不被 fade 挡住
}
.tpl-fade {
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 80rpx;
  pointer-events: none;
  background: linear-gradient(to left, t.$color-bg 0%, rgba(253, 251, 248, 0) 100%);
}

.group-select-wrap {
  margin-top: t.$spacing-2;
}
.group-select {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18rpx 24rpx;
  border: 2rpx solid t.$color-border;
  border-radius: 16rpx;
  background: t.$color-surface;
}
.group-name { font-size: t.$font-md; color: t.$color-text; }
.caret { color: t.$color-text-mute; font-size: 26rpx; }
.no-groups {
  font-size: t.$font-sm;
  color: t.$color-text-mute;
}

// 更多设置 展开头
.advanced-head {
  display: flex; align-items: center; gap: t.$spacing-2;
  padding: t.$spacing-2 0;
}
.advanced-hint {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  flex: 1;
}
.advanced-chevron {
  transition: transform 0.2s;
}
.advanced-chevron.open {
  transform: rotate(90deg);
}
.advanced-body {
  display: flex; flex-direction: column;
  gap: t.$spacing-4;
  padding: t.$spacing-3 0 0;
  border-top: 2rpx solid t.$color-border;
}

.actions { display: flex; gap: t.$spacing-3; }
.btn {
  flex: 1;
  height: 88rpx; line-height: 88rpx;
  border-radius: 999rpx;
  font-size: t.$font-md;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
</style>
