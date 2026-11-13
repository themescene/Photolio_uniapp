<script setup lang="ts">
/**
 * Entertainment 模板 — 参考：annualreport/src/components/templates/EntertainmentCard.vue
 * 视觉：白底 + 金色边竖条、宝石装饰、菱形分隔线、底部胶卷
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
  <view class="card entertainment-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <view class="content">
        <view class="header">
          <text class="label">ENTERTAINMENT</text>
          <text class="year">{{ year }}</text>
        </view>
        <view class="gem-row">
          <view class="gem outline" />
          <view class="gem filled" />
          <view class="gem outline" />
        </view>
        <text class="title">{{ h1 }}</text>
        <view class="divider">
          <view class="div-line" />
          <text class="div-gem">◆</text>
          <view class="div-line right" />
        </view>
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="film-strip">
        <view v-for="i in 12" :key="i" class="film-cell" :class="'fc-' + i" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #ffffff; }

.text-section {
  background: #ffffff;
  border-left: 6rpx solid #c4973d;
  display: flex;
  flex-direction: column;
}

.content { padding: 48rpx 36rpx 28rpx 50rpx; display: flex; flex-direction: column; }

.header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 30rpx;
}
.label { font-size: 22rpx; font-weight: 700; letter-spacing: 8rpx; color: #c4973d; }
.year { font-size: 24rpx; color: #c0b49a; letter-spacing: 2rpx; }

.gem-row { display: flex; gap: 14rpx; align-items: center; margin-bottom: 28rpx; }
.gem { width: 18rpx; height: 18rpx; transform: rotate(45deg); }
.gem.outline { border: 3rpx solid #d4c5a9; }
.gem.filled { background: #c4973d; border: 3rpx solid #c4973d; }

.title {
  font-size: 44rpx; font-weight: 700; color: #1a1a1a;
  line-height: 1.3; font-style: italic;
  margin-bottom: 28rpx;
}

.divider { display: flex; align-items: center; gap: 12rpx; margin-bottom: 24rpx; }
.div-line { flex: 1; height: 2rpx; background: linear-gradient(to right, #e0cda8, transparent); }
.div-line.right { background: linear-gradient(to left, #e0cda8, transparent); }
.div-gem { font-size: 18rpx; color: #c4973d; }

.subtitle { font-size: 30rpx; color: #374151; line-height: 1.75; margin-bottom: 12rpx; }
.body { font-size: 28rpx; color: #6b7280; line-height: 1.8; white-space: pre-wrap; }

.film-strip {
  display: flex;
  gap: 6rpx;
  padding: 20rpx 36rpx 24rpx 50rpx;
  border-top: 1px solid #f5f0e8;
}
.film-cell { flex: 1; height: 14rpx; border-radius: 2rpx; background: #f0e8d8; }
// 模拟 nth-child 模式：偶数 / 三的倍数
.fc-2, .fc-4, .fc-8, .fc-10 { background: #e8d5b0; }
.fc-3, .fc-9 { background: #f5f0e8; }
</style>
