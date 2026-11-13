<script setup lang="ts">
import { displayContentTitle } from "@/features/nfc/content";
import { t as uiText } from "@/i18n";
/**
 * 画匣子网格 —— 直接移植自 [annualreport/src/components/CollectionCard.vue]
 * + 卡片下方操作栏（share / delete / unlike）移植自 UploadView.vue:1626-1630 的 .card-actions-bar
 *
 * actions 模式：
 *   - "personal"：分享 + 删除
 *   - "liked"   ：取消喜欢
 *   - "none"    ：不显示操作（默认）
 *
 * 事件：
 *   - pick(item)    点卡片打开
 *   - share(item)   点分享
 *   - delete(item)  点删除（外层应弹 confirm）
 *   - unlike(item)  点取消喜欢
 */
import { STATIC_BASE } from "@/config/env";
import type { ShareListItem } from "@/types";

withDefaults(defineProps<{
  shares: ShareListItem[];
  actions?: "none" | "personal" | "liked";
}>(), { actions: "none" });

const emit = defineEmits<{
  (e: "pick", item: ShareListItem): void;
  (e: "share", item: ShareListItem): void;
  (e: "delete", item: ShareListItem): void;
  (e: "unlike", item: ShareListItem): void;
  (e: "longpress", item: ShareListItem): void;
}>();

// mp-weixin 长按会同时触发 tap → click，导致
// 「弹长按菜单 + 立即又跳去详情页」双重反应（用户实测：长按后弹俩重命名提示）
// 用一个窗口性 flag 拦住 click，300ms 内不 fire pick
let _justLongPressed = false;
let _lpTimer: ReturnType<typeof setTimeout> | null = null;
function _onLongPress(item: ShareListItem) {
  _justLongPressed = true;
  if (_lpTimer) clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => { _justLongPressed = false; }, 400);
  emit("longpress", item);
}
function _onTap(item: ShareListItem) {
  if (_justLongPressed) return;
  emit("pick", item);
}

function resolveCover(url?: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}
</script>

<template>
  <view class="list">
    <view
      v-for="item in shares"
      :key="item.share_id"
      class="card-wrapper"
    >
      <view
        class="card"
        hover-class="card-hover"
        :hover-stay-time="80"
        @click="_onTap(item)"
        @longpress="_onLongPress(item)"
      >
        <view v-if="item.cover_image" class="card-bg-image">
          <image :src="resolveCover(item.cover_image)" mode="aspectFill" class="bg-img" />
        </view>
        <view v-else class="card-bg-fallback" />

        <view class="card-gradient-mask" />

        <view class="card-content">
          <view class="card-text-group">
            <text class="card-title">{{ displayContentTitle(item.report_title || uiText("未命名")) }}</text>
            <text v-if="item.created_at" class="card-subtitle">{{ item.created_at.slice(0, 10) }}</text>
          </view>
        </view>
      </view>

      <view v-if="actions === 'personal'" class="card-actions">
        <!-- 微信原生分享按钮：点了直接弹好友/朋友圈面板，分享内容由父页面 onShareAppMessage 提供 -->
        <button
          class="action-btn share-btn-native"
          open-type="share"
          :data-share-id="item.share_id"
          :data-share-title="item.report_title"
          :data-share-cover="item.cover_image || ''"
          @click.stop="$emit('share', item)"
        ><text>{{ uiText("分享") }}</text></button>
        <view class="action-btn danger" @click.stop="$emit('delete', item)"><text>{{ uiText("删除") }}</text></view>
      </view>
      <view v-else-if="actions === 'liked'" class="card-actions">
        <view class="action-btn danger" @click.stop="$emit('unlike', item)"><text>{{ uiText("取消喜欢") }}</text></view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.list {
  // 不再自带左右 padding —— 由上层 container 控制左右内边距，
  // 与 .new-btn / .tab-bar 等同级元素严格左右对齐（网页端做法）
  display: flex;
  flex-direction: column;
  gap: t.$spacing-4;          // 1.25rem 给每个 card-wrapper 间距
  padding: 0;
}

.card-wrapper {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
}

.card {
  position: relative;
  width: 100%;
  height: 224rpx;             // 7rem
  border-radius: 40rpx;       // 20px
  overflow: hidden;
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.10);
  // 网页端 hover opacity 0.85；小程序对应用 hover-class + active 视觉
}
.card-hover {
  opacity: 0.85;
}

// ── 背景层（z-index 1）────
.card-bg-image {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.bg-img {
  width: 100%;
  height: 100%;
}
.card-bg-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #e8e8e8;
}

// ── 渐变蒙版（z-index 2）严格对齐网页端 ────
.card-gradient-mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.45) 50%,
    transparent 100%
  );
}

// ── 内容（z-index 3）────
.card-content {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 48rpx;           // 1.5rem
  color: #ffffff;
}

.card-text-group {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;                  // 0.25rem
  max-width: 70%;             // 网页端规则，防止文字撑爆
}

.card-title {
  font-size: 36rpx;           // 1.125rem
  font-weight: t.$weight-bold;
  line-height: 1.4;
  text-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.30);
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.card-subtitle {
  font-size: 28rpx;           // 0.875rem
  font-weight: t.$weight-regular;
  opacity: 0.9;
  text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.20);
  color: #ffffff;
}

// ── 卡片下方操作栏 ────
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
  // 全局 button reset 已去除默认样式，这里只补 hairline 让形状一致
  background: t.$color-bg;
  color: t.$color-text;
  border: 2rpx solid t.$color-border;
  line-height: normal;
}
.action-btn.danger {
  color: t.$color-danger;
  border-color: t.$color-danger;
  background: transparent;
}
</style>
