<script setup lang="ts">
/**
 * Reflection 模板 — 参考：annualreport/src/components/templates/ReflectionCard.vue
 * 视觉：极简灰白渐变 + 居中宋体 + 大引号 + 末尾破折号
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
  <view class="card reflection-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <view class="content">
        <text class="quote-mark">"</text>
        <text class="title">{{ h1 }}</text>
        <view class="breath" />
        <text v-if="body" class="body">{{ body }}</text>
        <text class="signature">—</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #f8f9fa; }

.text-section {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  display: flex;
  flex-direction: column;
}

.content {
  text-align: center;
  padding: 60rpx 36rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.quote-mark {
  font-family: Georgia, serif;
  font-size: 128rpx;
  color: rgba(139, 92, 246, 0.18);
  line-height: 0.5;
  margin-bottom: 40rpx;
}

.title {
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 42rpx; font-weight: 300; color: #374151;
  line-height: 1.8; letter-spacing: 6rpx;
}
.breath { height: 40rpx; }

.subtitle {
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 30rpx; color: #6b7280;
  line-height: 2; letter-spacing: 5rpx; font-weight: 300;
}
.body {
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 28rpx; color: #4b5563;
  line-height: 2; letter-spacing: 4rpx;
  margin-top: 24rpx; font-weight: 300; white-space: pre-wrap;
}
.signature {
  font-family: "STKaiti", serif;
  font-size: 48rpx; color: #9ca3af;
  margin-top: 40rpx;
}
</style>
