<script setup lang="ts">
import SvgIcon from "@/components/SvgIcon.vue";
/**
 * Valentine 模板 — 参考：annualreport/src/components/templates/ValentineCard.vue
 * 视觉：粉色渐变 + 浮动爱心动画 + 心形分隔线 + 居中浪漫风
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
  <view class="card valentine-card">
    <TemplateImage :items="items">
      <template #overlay>
        <view class="floating-hearts">
          <view class="heart h1"><SvgIcon name="heart" size="36rpx" color="#ec4899" /></view>
          <view class="heart h2"><SvgIcon name="heart" size="36rpx" color="#ec4899" /></view>
          <view class="heart h3"><SvgIcon name="heart" size="36rpx" color="#ec4899" /></view>
        </view>
      </template>
    </TemplateImage>
    <view class="text-section">
      <view class="content">
        <view class="love-icon"><SvgIcon name="heart" size="72rpx" color="#ec4899" /></view>
        <text class="title">{{ h1 }}</text>
        <view class="heart-divider">
          <view class="line" />
          <view class="heart-center"><SvgIcon name="heart" size="32rpx" color="#ec4899" /></view>
          <view class="line" />
        </view>
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="card-footer">
        <text class="brand">— with love —</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #fff0f3; }

.floating-hearts {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
}
.heart {
  position: absolute;
  color: rgba(236, 72, 153, 0.55);
  animation: floatUp 4s ease-in-out infinite;
}
.h1 { font-size: 36rpx; bottom: 10%; left: 15%; }
.h2 { font-size: 28rpx; bottom: 5%; right: 20%; animation-delay: 1.5s; }
.h3 { font-size: 44rpx; bottom: 8%; left: 55%; animation-delay: 3s; }
@keyframes floatUp {
  0% { transform: translateY(0) scale(1); opacity: 0.6; }
  50% { transform: translateY(-60rpx) scale(1.1); opacity: 0.9; }
  100% { transform: translateY(-120rpx) scale(0.8); opacity: 0; }
}

.text-section {
  position: relative;
  background: linear-gradient(160deg, #fff0f3 0%, #fce7f3 50%, #fbcfe8 100%);
  display: flex;
  flex-direction: column;
}

.content {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 56rpx 36rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.love-icon {
  font-size: 76rpx;
  margin-bottom: 24rpx;
  animation: pulse-heart 2s ease-in-out infinite;
}
@keyframes pulse-heart {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.title {
  font-family: "STKaiti", serif;
  font-size: 44rpx; font-weight: 700; color: #be185d;
  line-height: 1.5; letter-spacing: 4rpx; margin-bottom: 24rpx;
}

.heart-divider {
  display: flex; align-items: center; gap: 16rpx;
  margin: 24rpx 0;
}
.heart-divider .line {
  width: 72rpx; height: 2rpx;
  background: linear-gradient(to right, transparent, #ec4899, transparent);
}
.heart-center { color: #ec4899; font-size: 26rpx; }

.subtitle {
  font-family: "STKaiti", serif;
  font-size: 32rpx; color: #9d174d; line-height: 1.8; letter-spacing: 2rpx;
}
.body {
  font-family: "STKaiti", serif;
  font-size: 28rpx; color: #be5a83; line-height: 1.9;
  letter-spacing: 1rpx; margin-top: 16rpx; white-space: pre-wrap;
}

.card-footer { padding: 20rpx 36rpx 32rpx; text-align: center; }
.brand { font-size: 24rpx; color: #d97ba8; letter-spacing: 4rpx; }
</style>
