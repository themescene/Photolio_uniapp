<script setup lang="ts">
import SvgIcon from "@/components/SvgIcon.vue";
/**
 * TravelVlog 模板 — 参考：annualreport/src/components/templates/TravelVlogCard.vue
 * 视觉：16:10 大画幅 + 上下胶片穿孔 + 位置徽章 + 路线虚线分隔
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
const dateLabel = new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
</script>

<template>
  <view class="card travel-card">
    <TemplateImage :items="items" aspect-ratio="16 / 10">
      <template #overlay>
        <view class="film-strip top">
          <view v-for="i in 8" :key="'t' + i" class="perforation" />
        </view>
        <view class="film-strip bottom">
          <view v-for="i in 8" :key="'b' + i" class="perforation" />
        </view>
        <view class="location-badge">
          <SvgIcon class="loc-icon" name="pin" size="22rpx" color="#ffffff" />
          <text class="loc-text">Photolio</text>
        </view>
      </template>
    </TemplateImage>

    <view class="text-section">
      <view class="content">
        <view class="vlog-header">
          <text class="vlog-tag">VLOG</text>
          <text class="vlog-date">{{ dateLabel }}</text>
        </view>
        <text class="title">{{ h1 }}</text>
        <view class="route-line">
          <view class="dot start" />
          <view class="line" />
          <view class="dot end" />
        </view>
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="card-footer">
        <text class="brand">Photolio · Travel</text>
        <SvgIcon class="stamp" name="plane" size="40rpx" color="#64748b" />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #f8fafb; }

.film-strip {
  position: absolute; left: 0; right: 0; height: 28rpx;
  display: flex; justify-content: space-around; align-items: center;
  background: rgba(0,0,0,0.7);
  z-index: 3;
}
.film-strip.top { top: 0; }
.film-strip.bottom { bottom: 0; }
.perforation {
  width: 16rpx; height: 10rpx; background: #222;
  border-radius: 2rpx; border: 1px solid #444;
}

.location-badge {
  position: absolute; bottom: 60rpx; left: 24rpx;
  display: flex; align-items: center; gap: 8rpx;
  background: rgba(0,0,0,0.55);
  color: #fff; font-size: 24rpx;
  padding: 6rpx 16rpx; border-radius: 999rpx;
  z-index: 5;
}
.loc-icon { font-size: 22rpx; }
.loc-text { font-size: 22rpx; }

.text-section {
  position: relative;
  background: linear-gradient(180deg, #ffffff 0%, #f0f7f4 100%);
  display: flex;
  flex-direction: column;
  border-left: 8rpx solid #10b981;
}

.content { padding: 40rpx 36rpx 24rpx; display: flex; flex-direction: column; }

.vlog-header { display: flex; align-items: center; gap: 18rpx; margin-bottom: 24rpx; }
.vlog-tag {
  font-size: 22rpx; font-weight: 800; letter-spacing: 4rpx;
  color: #fff;
  background: linear-gradient(135deg, #10b981, #059669);
  padding: 6rpx 16rpx; border-radius: 6rpx;
}
.vlog-date { font-size: 26rpx; color: #6b7280; font-weight: 500; }

.title {
  font-size: 44rpx; font-weight: 800; color: #1a1a1a;
  line-height: 1.4; margin-bottom: 16rpx; letter-spacing: -1rpx;
}

.route-line { display: flex; align-items: center; margin: 20rpx 12rpx; }
.dot { width: 16rpx; height: 16rpx; border-radius: 50%; flex-shrink: 0; }
.dot.start { background: #10b981; }
.dot.end { background: #f59e0b; }
.route-line .line {
  flex: 1; height: 4rpx;
  background: repeating-linear-gradient(90deg, #d1d5db 0, #d1d5db 12rpx, transparent 12rpx, transparent 20rpx);
}

.subtitle { font-size: 32rpx; color: #374151; line-height: 1.8; margin-bottom: 12rpx; }
.body { font-size: 28rpx; color: #6b7280; line-height: 1.9; white-space: pre-wrap; }

.card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16rpx 36rpx 32rpx;
}
.brand { font-size: 24rpx; color: #9ca3af; letter-spacing: 2rpx; }
.stamp { font-size: 40rpx; opacity: 0.35; }
</style>
