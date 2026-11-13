<script setup lang="ts">
/**
 * Work 模板 — 参考：annualreport/src/components/templates/WorkCard.vue
 * 视觉：浅灰背景 + 深蓝顶边、徽标 [W] + WORK 字样、底部装饰小格子
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
  <view class="card work-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <view class="header">
        <view class="badge">
          <text class="badge-icon">W</text>
          <text class="badge-label">WORK</text>
        </view>
        <text class="year">{{ year }}</text>
      </view>
      <view class="content">
        <text class="title">{{ h1 }}</text>
        <view class="rule" />
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="grid-deco">
        <view v-for="i in 6" :key="i" class="grid-cell" :class="'gc-' + i" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #fafafa; }

.text-section {
  background: #fafafa;
  border-top: 8rpx solid #1e3a5f;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 30rpx 40rpx 22rpx;
  border-bottom: 1px solid #eaeaea;
}
.badge { display: flex; align-items: center; gap: 14rpx; }
.badge-icon {
  width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center;
  background: #1e3a5f; color: #fff;
  font-size: 22rpx; font-weight: 800;
}
.badge-label {
  font-size: 22rpx; font-weight: 700; color: #1e3a5f;
  letter-spacing: 6rpx;
}
.year {
  font-size: 60rpx; font-weight: 800;
  color: rgba(0,0,0,0.06); line-height: 1;
}

.content { padding: 36rpx 40rpx 28rpx; display: flex; flex-direction: column; }
.title {
  font-size: 44rpx; font-weight: 700; color: #1a1a1a;
  line-height: 1.3; letter-spacing: -1rpx; margin-bottom: 24rpx;
}
.rule {
  width: 72rpx; height: 6rpx; background: #1e3a5f; margin-bottom: 28rpx;
}
.subtitle { font-size: 30rpx; color: #374151; line-height: 1.75; margin-bottom: 12rpx; }
.body { font-size: 28rpx; color: #6b7280; line-height: 1.8; white-space: pre-wrap; }

.grid-deco {
  display: flex; gap: 10rpx;
  padding: 22rpx 40rpx 32rpx;
  border-top: 1px solid #eaeaea;
}
.grid-cell {
  width: 20rpx; height: 20rpx;
  border: 1px solid #d8d8d8; border-radius: 4rpx;
}
.gc-1, .gc-4 { background: #1e3a5f; border-color: #1e3a5f; }
.gc-2 { background: #4a6fa5; border-color: #4a6fa5; }
</style>
