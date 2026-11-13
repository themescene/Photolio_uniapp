<script setup lang="ts">
/**
 * Hobby 模板 — 参考：annualreport/src/components/templates/HobbyCard.vue
 * 视觉：暖米色 + 粉棕色顶边、右上角 L 形点缀、点状分隔线
 */
import { computed } from "vue";
import TemplateImage from "./TemplateImage.vue";
import { useEpisodeMedia } from "./useEpisodeMedia";
import type { ReportEpisode } from "@/types";

const props = defineProps<{ episode: ReportEpisode }>();

// 改为 MediaItem[]（含 video）—— 对齐网页端 PlayView image slot 模式
// 之前只取 image_url 字符串导致视频被吞，模板里只显示空白
const items = useEpisodeMedia(computed(() => props.episode));
const h1 = computed(() => props.episode?.copywriting?.h1 || "");
const body = computed(() => props.episode?.copywriting?.body || "");
const year = new Date().getFullYear();
</script>

<template>
  <view class="card hobby-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <view class="corner-mark" />
      <view class="content">
        <view class="header">
          <text class="icon">◎</text>
          <text class="label">HOBBY</text>
          <text class="sep"> · </text>
          <text class="year">{{ year }}</text>
        </view>
        <text class="title">{{ h1 }}</text>
        <view class="dot-divider">
          <view class="dot sm" />
          <view class="dot lg" />
          <view class="dot sm" />
        </view>
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="footer" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #fdfcf9; }

.text-section {
  position: relative;
  background: #fdfcf9;
  border-top: 6rpx solid #c48f85;
  display: flex;
  flex-direction: column;
}

.corner-mark {
  position: absolute;
  top: 20rpx; right: 20rpx;
  width: 36rpx; height: 36rpx;
  border-top: 4rpx solid #e2c0bc;
  border-right: 4rpx solid #e2c0bc;
}

.content { padding: 44rpx 36rpx 28rpx; display: flex; flex-direction: column; }

.header { display: flex; align-items: center; gap: 8rpx; margin-bottom: 28rpx; }
.icon { font-size: 26rpx; color: #c48f85; }
.label { font-size: 22rpx; font-weight: 700; letter-spacing: 7rpx; color: #c48f85; }
.sep { color: #d4b8b4; font-size: 24rpx; }
.year { font-size: 24rpx; color: #c0aeaa; }

.title {
  font-size: 44rpx; font-weight: 700; color: #2a2a2a;
  line-height: 1.35; margin-bottom: 24rpx;
}

.dot-divider { display: flex; gap: 10rpx; align-items: center; margin-bottom: 24rpx; }
.dot { border-radius: 50%; background: #e2c0bc; }
.dot.sm { width: 10rpx; height: 10rpx; }
.dot.lg { width: 14rpx; height: 14rpx; background: #c48f85; }

.subtitle { font-size: 30rpx; color: #374151; line-height: 1.75; margin-bottom: 12rpx; }
.body { font-size: 28rpx; color: #6b7280; line-height: 1.8; white-space: pre-wrap; }

.footer {
  height: 60rpx;
  border-top: 1px solid #f0e8e6;
}
</style>
