<script setup lang="ts">
import SvgIcon from "@/components/SvgIcon.vue";
import { t as uiText } from "@/i18n";
/**
 * Food 模板 — 参考：annualreport/src/components/templates/FoodCard.vue
 * 视觉：米色纸质底 + 居中布局 + 楷书 + 红印章
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
  <view class="card food-card">
    <TemplateImage :items="items" />
    <view class="text-section">
      <view class="paper-texture" />
      <view class="content">
        <view class="icon"><SvgIcon name="bowl" size="72rpx" color="#8b4513" /></view>
        <text class="title">{{ h1 }}</text>
        <view class="divider" />
        <text v-if="body" class="body">{{ body }}</text>
      </view>
      <view class="seal"><text>{{ uiText("味") }}</text></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.card { width: 100%; min-height: 100vh; display: flex; flex-direction: column; background: #f5f1e8; }

.text-section {
  position: relative;
  background: linear-gradient(135deg, #fff8f0 0%, #f5f1e8 100%);
  display: flex;
  flex-direction: column;
}
.paper-texture {
  position: absolute; inset: 0;
  // 网页端用 repeating-linear-gradient 模拟纸纹；小程序里同样支持
  background-image: repeating-linear-gradient(
    0deg, transparent, transparent 4rpx,
    rgba(139, 69, 19, 0.03) 4rpx, rgba(139, 69, 19, 0.03) 8rpx
  );
  opacity: 0.5;
  pointer-events: none;
}

.content {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 48rpx 36rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.icon { font-size: 72rpx; margin-bottom: 24rpx; }
.title {
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 48rpx; color: #8b4513; line-height: 1.4;
  letter-spacing: 6rpx; margin-bottom: 24rpx;
}
.divider {
  width: 100rpx; height: 4rpx;
  background: linear-gradient(to right, transparent, #d4a574, transparent);
  margin: 16rpx 0 24rpx;
}
.subtitle {
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 32rpx; color: #a0826d; line-height: 1.8; letter-spacing: 4rpx;
}
.body {
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 28rpx; color: #b8997f; line-height: 1.8;
  letter-spacing: 2rpx; margin-top: 24rpx; white-space: pre-wrap;
}
.seal {
  position: relative; z-index: 2;
  align-self: flex-end;
  margin: 16rpx 36rpx 36rpx;
  width: 72rpx; height: 72rpx;
  background: #c13939; color: #fff8f0;
  font-family: "STKaiti", "KaiTi", serif;
  font-size: 42rpx;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6rpx;
  box-shadow: 0 8rpx 24rpx rgba(193, 57, 57, 0.3);
}
</style>
