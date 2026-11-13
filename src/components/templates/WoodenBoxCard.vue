<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * Wooden Box 模板 —— 直接移植自 [annualreport/src/components/templates/WoodenBoxCard.vue]
 *
 * 严格对齐网页端结构（小程序限制下做必要简化）：
 *   .image-section  — aspect-ratio 8/7（portrait）
 *     .tray         — w/h 100%, 多层渐变木盘 + inset 阴影，padding 6%
 *       .photo-stack-wrap — w 78%, aspect 1/1，居中
 *         .polaroid — absolute inset 0，bg #fdfcf7，padding 14px 14px 36px（Polaroid 底部留白）
 *           .polaroid-photo — w/h 100%
 *             <image>       — mode=aspectFill
 *   .text-section
 *     .paper-card — bg #fdfbf6, radius 18px, 三段阴影
 *       .meta-line — meta-dot + subtitle
 *       .main-title (h1)
 *       .body-text (p)
 *
 * 简化：不做 3 张叠层 + TransitionGroup 翻页动画（小程序 absolute 多元素叠层 + Vue
 * Transition 组合容易出兼容问题），只保留 front 一张并保留网页端的 rotate(-1.5deg) 微旋。
 * 多图通过翻页箭头 + 左右滑动手势切换 currentIdx。
 */
import { ref, computed, getCurrentInstance } from "vue";
import { useEpisodeMedia } from "./useEpisodeMedia";
import { logger } from "@/utils/logger";
import { useVideoStallDetector } from "@/composables/useVideoStallDetector";
import type { ReportEpisode } from "@/types";

const props = defineProps<{
  episode: ReportEpisode;
}>();

const currentIdx = ref(0);
// animKey 被去掉：之前用它在 :key 上强制 remount image/video 是闪烁源（翻页整页闪 + 视频中断）

// 用与其它 Card 一致的 MediaItem 通道，支持视频项
const items = useEpisodeMedia(computed(() => props.episode));

const total = computed(() => items.value.length);
const cur = computed(() => items.value[currentIdx.value] || null);
const currentImage = computed(() => (cur.value?.type === "image" ? cur.value.url : (cur.value?.thumbnail || cur.value?.url || "")));
const isVideo = computed(() => cur.value?.type === "video");

// 稳定 id 供 uni.createVideoContext 触发全屏；同页多个 Card 通过随机后缀去重
const videoId = `woodenbox-video-${Math.random().toString(36).slice(2, 8)}`;
// component 内的 <video> 必须给 createVideoContext 传第二个参数 = 组件 instance，
// 否则只查 page 级 id，找不到 → 全屏不生效
const _instance = getCurrentInstance();
function enterFullscreen() {
  try {
    const proxy = (_instance as unknown as { proxy: unknown } | null)?.proxy;
    const ctx = uni.createVideoContext(videoId, proxy as never);
    ctx?.requestFullScreen({ direction: 0 });
  } catch (e) {
    logger.warn("[wooden-box] enterFullscreen failed", e);
  }
}

const h1 = computed(() => props.episode?.copywriting?.h1 || "");
const body = computed(() => props.episode?.copywriting?.body || "");

function prev() {
  if (total.value <= 1) return;
  currentIdx.value = (currentIdx.value - 1 + total.value) % total.value;
}
function next() {
  if (total.value <= 1) return;
  currentIdx.value = (currentIdx.value + 1) % total.value;
}
function onPreview() {
  if (!cur.value) return;
  // 视频项：让 <video> 自己处理点击（mp-weixin 自带 controls + 全屏按钮）
  if (cur.value.type === "video") return;
  // 图片项：只把图片 URL 传给 previewImage
  const urls = items.value.filter((it) => it.type === "image").map((it) => it.url);
  if (urls.length) {
    uni.previewImage({ urls, current: cur.value.url });
  }
}

// 视频在 polaroid 内嵌渲染时上报状态到 console（mp-weixin devtools 可查）
function onVideoMeta(e: Event) {
  const detail = (e as unknown as { detail?: { width?: number; height?: number; duration?: number } })?.detail;
  logger.info("[wooden-box] video metadata", { ...detail, url: cur.value?.url });
}
// 卡顿检测：@waiting 累计 5 次 → 建议下载提示
const stallDetector = useVideoStallDetector(() => cur.value?.url);
function onVideoWaiting() { stallDetector.onWaiting(); }
function onVideoError(e: Event) {
  const detail = (e as unknown as { detail?: { errMsg?: string } })?.detail;
  logger.warn("[wooden-box] video error", detail, cur.value?.url);
  stallDetector.onError(e);
}

let touchStartX = 0;
function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0]?.clientX || 0;
}
function onTouchEnd(e: TouchEvent) {
  const dx = (e.changedTouches[0]?.clientX || 0) - touchStartX;
  if (Math.abs(dx) > 40) {
    if (dx > 0) prev();
    else next();
  }
}
</script>

<template>
  <view class="card wooden-box-card portrait">
    <!-- 图片区：木盘 + Polaroid -->
    <view class="image-section" @click="onPreview">
      <view class="tray">
        <view class="photo-stack-wrap" @touchstart="onTouchStart" @touchend="onTouchEnd">
          <!-- 视频时 polaroid 去掉 rotate / 内边距 —— 不然 mp-weixin video 全屏时父级变换
               + overflow:hidden 会让退出全屏的 layout 回算异常（用户实测：全屏闪一下就缩回去）
               同时也避免视频被夹在 -1.5deg 旋转的相纸里看着歪 -->
          <view class="polaroid polaroid--front" :class="{ 'polaroid--video': isVideo }">
            <view class="polaroid-photo">
              <!-- 视频：用 thumbnail 作 poster，object-fit contain，对齐网页端 video-in-slot
                   不再加 :key="animKey" —— 之前那个 key 让翻页时整个 video remount，
                   表现为「翻页整页闪一下」+「视频中途切换播放被打断」 -->
              <video
                v-if="isVideo && cur"
                :id="videoId"
                class="polaroid-video"
                :src="cur.url"
                :poster="cur.thumbnail || ''"
                object-fit="contain"
                controls
                show-fullscreen-btn
                picture-in-picture-mode=""
                @loadedmetadata="onVideoMeta"
                @waiting="onVideoWaiting"
                @error="onVideoError"
                @click.stop
              />
              <!-- 右上角「全屏」按钮：video 是原生组件，普通 view 无法覆盖，走 cover-view -->
              <cover-view v-if="isVideo && cur" class="fs-btn" @click="enterFullscreen">
                <cover-view class="fs-btn-label">{{ uiText("全屏") }}</cover-view>
              </cover-view>
              <!-- 图片同理：去掉 :key 让 Vue 自然 patch src，不强制 remount，消除闪烁 -->
              <image
                v-else-if="currentImage"
                class="polaroid-img"
                :src="currentImage"
                mode="aspectFill"
              />
            </view>
            <view v-if="currentImage && !isVideo" class="gloss-sheen" />
          </view>
        </view>

        <view v-if="total > 1" class="counter"><text>{{ currentIdx + 1 }} / {{ total }}</text></view>
      </view>
    </view>

    <!-- 文字区：纸质卡片 -->
    <view class="text-section">
      <view class="paper-card">
        <view class="content">
          <text class="main-title">{{ h1 }}</text>
          <text v-if="body" class="body-text">{{ body }}</text>
        </view>
      </view>
      <view class="tray-knob" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.card {
  width: 100%;
  min-height: 100vh;
  font-family: "Source Han Sans CN", "Noto Sans SC", "PingFang SC",
    "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  background: #d9c2a0;
  color: #2c2620;
  display: flex;
  flex-direction: column;
}

// ===================== 图片区 =====================
.image-section {
  position: relative;
  width: 100%;
  // 网页端 aspect-ratio: 8 / 7（不是 1:1），关键，不能改
  aspect-ratio: 8 / 7;
  flex-shrink: 0;
  background: #d9c2a0;
  padding: 36rpx;             // 18px
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.tray {
  position: relative;
  width: 100%;
  height: 100%;
  background:
    repeating-linear-gradient(
      92deg,
      transparent 0,
      transparent 12rpx,
      rgba(110, 75, 35, 0.025) 12rpx,
      rgba(110, 75, 35, 0.025) 14rpx,
      transparent 14rpx,
      transparent 36rpx,
      rgba(110, 75, 35, 0.018) 36rpx,
      rgba(110, 75, 35, 0.018) 40rpx
    ),
    radial-gradient(ellipse 60% 14% at 30% 22%, rgba(150, 110, 60, 0.06), transparent 70%),
    radial-gradient(ellipse 50% 12% at 70% 65%, rgba(120, 80, 40, 0.05), transparent 70%),
    linear-gradient(165deg, #ecd6b2 0%, #d8b888 100%);
  border-radius: 56rpx;       // 28px
  box-shadow:
    inset 0 12rpx 28rpx rgba(60, 35, 12, 0.32),
    inset 0 -6rpx 16rpx rgba(255, 240, 215, 0.45),
    inset 8rpx 0 16rpx rgba(60, 35, 12, 0.18),
    inset -8rpx 0 16rpx rgba(60, 35, 12, 0.18);
  padding: 6%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

// ── 照片堆叠区（即使只有 1 张，也保留网页端 78% 比例）──
.photo-stack-wrap {
  position: relative;
  width: 78%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

// Polaroid 相纸
.polaroid {
  position: absolute;
  inset: 0;
  background: #fdfcf7;
  border-radius: 8rpx;
  padding: 28rpx 28rpx 72rpx;  // 14px 14px 36px（底留白形成 Polaroid 感）
  box-sizing: border-box;
  box-shadow:
    0 2rpx 2rpx rgba(60, 40, 20, 0.12),
    0 12rpx 28rpx rgba(60, 40, 20, 0.18),
    0 36rpx 76rpx rgba(60, 40, 20, 0.22);
  transform: rotate(-1.5deg);  // 网页端 polaroid--front 固定姿态
}
// 视频项：去掉旋转 + 边距，给 video 完整空间；防止全屏返回 layout 异常
.polaroid.polaroid--video {
  transform: none;
  padding: 0;
  background: #000;
}
.polaroid-photo {
  position: relative;
  width: 100%;
  height: 100%;
  background: #e8e8e6;
  overflow: hidden;
  border-radius: 2rpx;
}
.polaroid-img {
  width: 100%;
  height: 100%;
}
.polaroid-video {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
}

// 视频右上角「全屏」按钮：视频是原生组件，普通 view 会被吃掉，必须走 cover-view
.fs-btn {
  position: absolute;
  top: 14rpx;
  right: 14rpx;
  z-index: 20;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 999rpx;
  padding: 8rpx 22rpx;
  display: flex;
  align-items: center;
}
.fs-btn-label {
  color: #FFFFFF;
  font-size: 24rpx;
  line-height: 1.2;
}

// 覆膜斜向高光
.gloss-sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    118deg,
    rgba(255, 255, 255, 0.28) 0%,
    rgba(255, 255, 255, 0.10) 18%,
    rgba(255, 255, 255, 0.02) 35%,
    transparent 50%,
    transparent 70%,
    rgba(255, 255, 255, 0.06) 88%,
    rgba(255, 255, 255, 0.16) 100%
  );
  pointer-events: none;
  // mix-blend-mode 在 mp-weixin 支持有限，去掉以确保可见
  border-radius: 8rpx;
}

.counter {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  background: rgba(50, 35, 20, 0.45);
  color: #fff8e8;
  border-radius: 999rpx;
  padding: 4rpx 16rpx;
  font-size: 22rpx;
  z-index: 20;
}

// ===================== 文字区 =====================
.text-section {
  position: relative;
  background: #d9c2a0;
  padding: 36rpx;             // 18px
  display: flex;
  flex-direction: column;
  gap: 28rpx;                 // 14px
}

.paper-card {
  position: relative;
  background: #fdfbf6;
  border-radius: 36rpx;       // 18px
  padding: 48rpx 44rpx 52rpx; // 1.5rem 1.4rem 1.6rem
  box-shadow:
    0 2rpx 4rpx rgba(60, 40, 20, 0.08),
    0 20rpx 52rpx rgba(60, 40, 20, 0.16),
    0 56rpx 112rpx rgba(60, 40, 20, 0.10);
  display: flex;
  flex-direction: column;
}

.content {
  display: flex;
  flex-direction: column;
}

.meta-line {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
}
.meta-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #b8956a;
}
.meta-text {
  font-size: 25rpx;           // 0.78rem
  color: #8a7050;
  letter-spacing: 2rpx;
  font-weight: t.$weight-medium;
}

.main-title {
  font-size: 46rpx;           // 1.45rem
  font-weight: t.$weight-bold;
  color: #1f1a14;
  line-height: 1.45;
  margin-bottom: 24rpx;
}

.body-text {
  font-size: 30rpx;           // 0.92rem ≈ 14.7px
  color: #524638;
  line-height: 1.95;
  letter-spacing: 1rpx;
  white-space: pre-wrap;
}

// 木盘底部装饰按钮
.tray-knob {
  position: absolute;
  bottom: 28rpx;
  right: 36rpx;
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  background: linear-gradient(145deg, #f6ecdb 0%, #c9b48f 100%);
  box-shadow:
    0 2rpx 4rpx rgba(60, 40, 20, 0.25),
    inset 0 2rpx 2rpx rgba(255, 255, 255, 0.5);
}
</style>
