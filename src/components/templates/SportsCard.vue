<script setup lang="ts">
/**
 * Sports 模板 — 参考：annualreport/src/components/templates/SportsCard.vue
 * 视觉：奶白底 + 红色左边竖条 + 巨大球衣号水印 + 红色统计条
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
</script>

<template>
  <view class="card sports-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <text class="bg-number">01</text>
      <view class="content">
        <view class="header">
          <text class="label">SPORT</text>
          <text class="slash">/</text>
          <text class="sub">RECORD</text>
        </view>
        <text class="title">{{ h1 }}</text>
        <view class="rule" />
        <text v-if="body" class="body">{{ body }}</text>
        <view class="stat-bars">
          <view class="bar b1" />
          <view class="bar b2" />
          <view class="bar b3" />
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #f7f7f7; }

.text-section {
  position: relative;
  background: #f7f7f7;
  border-left: 8rpx solid #bf3931;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bg-number {
  position: absolute;
  right: -10rpx; bottom: -20rpx;
  font-size: 360rpx; font-weight: 900;
  color: rgba(0,0,0,0.04);
  line-height: 1;
  letter-spacing: -10rpx;
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 2;
  padding: 50rpx 36rpx 30rpx 50rpx;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 28rpx;
}
.label { font-size: 22rpx; font-weight: 800; letter-spacing: 8rpx; color: #bf3931; }
.slash { color: #ccc; font-size: 24rpx; }
.sub { font-size: 22rpx; font-weight: 600; letter-spacing: 5rpx; color: #aaa; }

.title {
  font-size: 50rpx; font-weight: 800; color: #1a1a1a;
  line-height: 1.2; font-style: italic;
  margin-bottom: 24rpx;
}
.rule {
  height: 4rpx;
  background: linear-gradient(to right, #bf3931, #e8c8c6, transparent);
  margin-bottom: 24rpx;
}
.subtitle { font-size: 30rpx; color: #374151; line-height: 1.75; margin-bottom: 12rpx; }
.body { font-size: 28rpx; color: #6b7280; line-height: 1.8; white-space: pre-wrap; }

.stat-bars { display: flex; flex-direction: column; gap: 10rpx; margin-top: 32rpx; }
.bar {
  height: 6rpx; border-radius: 4rpx;
  background: linear-gradient(to right, #bf3931, #e8c0be);
}
.b1 { width: 78%; }
.b2 { width: 52%; opacity: 0.55; }
.b3 { width: 64%; opacity: 0.3; }
</style>
