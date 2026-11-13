<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 画匣子集合卡 —— 严格移植自 [annualreport/src/components/GroupFolderCard.vue]
 *
 * 网页端的「群组」其实是「画匣子集合 / 文件夹」：横条 7rem 高 + 背景图渐变蒙版 +
 * 左侧文件夹图标 + 标题；右侧操作栏：成员数 / 分享 / 删除。
 *
 * 与 ShareGrid（单个画匣子卡）共享几乎所有样式：高度 7rem、border-radius 20px、
 * 渐变蒙版三档、操作栏胶囊按钮。差别在内容区有文件夹图标 + 标题前缀。
 */
import { computed } from "vue";
import { STATIC_BASE } from "@/config/env";
import SvgIcon from "@/components/SvgIcon.vue";
import type { GroupInfo } from "@/types";

const props = defineProps<{ group: GroupInfo }>();

// 后端 GroupInfo.member_count 是「集合里 share 条数」——一人写 3 章会返回 3，
// 导致"1 人 3 章"被角标显示成"3 人"。但后端另外提供 is_solo（distinct user 数 ≤ 1）。
// 修：is_solo 时角标固定 1；非 solo 时才用 member_count 兜底。对齐用户直觉「章数 ≠ 人数」。
const displayedMemberCount = computed(() => {
  if (props.group.is_solo) return 1;
  return props.group.member_count || 1;
});

// 展示名兜底：backend `group_name` 在原始画匣子既无 report_title 也无 h1 时会回落成
// group_id（形如 "zHRGlyhA…" 的短 hash），用户投诉是「参数外露 / 乱码」。这里检测到
// group_name === group_id 视为「未命名」，展示统一文案「画匣子合集」。
const displayedGroupName = computed(() => {
  const name = props.group.group_name || '';
  if (!name || name === props.group.group_id) return '合集';
  return name;
});

const emit = defineEmits<{
  (e: "pick", g: GroupInfo): void;
  (e: "share", g: GroupInfo): void;
  (e: "delete", g: GroupInfo): void;
  (e: "members", g: GroupInfo): void;
  (e: "longpress", g: GroupInfo): void;
}>();

// 2026-07-19：长按弹三点菜单（重命名/分享/删除），对齐 ShareGrid 手势契约。
// _justLongPressed 400ms 防抖：长按 → longpress event → 400ms 内忽略 tap，避免误触打开合集
let _justLongPressed = false;
let _lpTimer: ReturnType<typeof setTimeout> | null = null;
function _onLongPress(g: GroupInfo) {
  _justLongPressed = true;
  if (_lpTimer) clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => { _justLongPressed = false; }, 400);
  emit("longpress", g);
}
function _onTap(g: GroupInfo) {
  if (_justLongPressed) return;
  emit("pick", g);
}

function resolveCover(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}
</script>

<template>
  <view class="folder-card-wrapper">
    <view
      class="folder-card"
      hover-class="card-hover"
      :hover-stay-time="80"
      @click="_onTap(group)"
      @longpress="_onLongPress(group)"
    >
      <view v-if="group.cover_url" class="card-bg-image">
        <image :src="resolveCover(group.cover_url)" mode="aspectFill" class="bg-img" />
      </view>
      <view v-else class="card-bg-fallback" />

      <view class="card-gradient-mask" />

      <view class="card-content">
        <view class="card-text-group">
          <view class="folder-icon">
            <SvgIcon name="folder" size="36rpx" color="#F7F3EE" />
          </view>
          <text class="card-title">{{ displayedGroupName }}</text>
        </view>
      </view>
    </view>

    <view class="card-actions">
      <view class="action-btn" @click.stop="$emit('members', group)">
        <text>{{ displayedMemberCount }}{{ uiText("人") }}</text>
      </view>
      <!-- 微信原生分享：父页面 onShareAppMessage 通过 dataset.groupId 识别分支 -->
      <button
        class="action-btn share-btn-native"
        open-type="share"
        :data-group-id="group.group_id"
        :data-group-name="displayedGroupName"
        :data-group-cover="group.cover_url || ''"
        @click.stop="$emit('share', group)"
      ><text>{{ uiText("分享") }}</text></button>
      <view class="action-btn danger" @click.stop="$emit('delete', group)">
        <text>{{ uiText("删除") }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.folder-card-wrapper {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
}

.folder-card {
  position: relative;
  width: 100%;
  height: 224rpx;             // 7rem，与 ShareGrid 卡片同高
  border-radius: 40rpx;       // 20px
  overflow: hidden;
  box-shadow: t.$shadow-card;
}
.card-hover { opacity: 0.85; }

.card-bg-image { position: absolute; inset: 0; z-index: 1; }
.bg-img { width: 100%; height: 100%; }
.card-bg-fallback {
  position: absolute; inset: 0; z-index: 1;
  background: t.$color-surface-2;
}

.card-gradient-mask {
  position: absolute; inset: 0;
  z-index: 2;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.45) 50%,
    transparent 100%
  );
}

.card-content {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 48rpx;
  color: #F7F3EE;
}
.card-text-group {
  display: flex;
  align-items: center;
  gap: t.$spacing-3;
  max-width: 70%;
}
.folder-icon {
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.card-title {
  font-size: 36rpx;           // 1.125rem
  font-weight: t.$weight-bold;
  color: #F7F3EE;
  text-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.30);
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  display: -webkit-box;
}

.card-actions {
  display: flex;
  gap: t.$spacing-2;
  justify-content: flex-end;
}
.action-btn {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text-soft;
  font-size: t.$font-xs;
}
.action-btn.share-btn-native {
  // 全局 button reset 已去除默认 ::after 边线 + min-width；这里只补 hairline
  // 与同行的 .action-btn 视觉对齐（参考 ShareGrid 的同名类）
  background: t.$color-surface;
  color: t.$color-text-soft;
  border: 2rpx solid t.$color-border;
  font-size: t.$font-xs;
  padding: 8rpx 24rpx;
  line-height: normal;
}
.action-btn.danger {
  color: t.$color-danger;
  border-color: t.$color-danger;
  background: transparent;
}
</style>
