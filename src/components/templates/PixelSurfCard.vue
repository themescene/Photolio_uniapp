<script setup lang="ts">
/**
 * PixelSurf 模板 — 参考：annualreport/src/components/templates/PixelSurfCard.vue
 * 视觉：白底 + 蓝色左竖条 + 话题标签 + 底部品牌栏（论坛风）
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
  <view class="card pixel-surf-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <view class="content">
        <view class="topic-bar">
          <text class="topic-tag">DISCUSS</text>
          <text class="topic-sep">·</text>
          <text class="topic-year">{{ year }}</text>
        </view>
        <text class="title">{{ h1 }}</text>
        <view class="divider" />
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="card-footer">
        <text class="brand">Photolio Forum</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #f2f3f5; }

.text-section {
  background: #ffffff;
  border-left: 8rpx solid #4361ee;
  display: flex;
  flex-direction: column;
}

.content { padding: 48rpx 36rpx 28rpx; display: flex; flex-direction: column; }

.topic-bar { display: flex; align-items: center; gap: 14rpx; margin-bottom: 24rpx; }
.topic-tag {
  font-size: 22rpx; font-weight: 600; letter-spacing: 2rpx;
  color: #4361ee; background: #eef0fd;
  padding: 6rpx 16rpx; border-radius: 8rpx;
}
.topic-sep { color: #d1d5db; font-size: 26rpx; }
.topic-year { color: #9ca3af; font-size: 26rpx; }

.title {
  font-size: 42rpx; font-weight: 700; color: #1d2129;
  line-height: 1.4; margin-bottom: 24rpx; letter-spacing: -1rpx;
}
.divider { height: 2rpx; background: #e8eaed; margin-bottom: 24rpx; }

.subtitle { font-size: 32rpx; color: #374151; line-height: 1.7; margin-bottom: 16rpx; }
.body { font-size: 28rpx; color: #6b7280; line-height: 1.8; white-space: pre-wrap; }

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 36rpx;
  border-top: 1px solid #e8eaed;
  background: #fafafa;
}
.brand { font-size: 24rpx; color: #9ca3af; letter-spacing: 2rpx; }
</style>
