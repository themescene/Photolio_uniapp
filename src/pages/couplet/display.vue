<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 春联展示页 —— 参考 annualreport/src/views/CoupletDisplayView.vue
 *
 * 数据源：share_id 的 ShareDetail，正文文本里按规则解析：
 *   上联：xxx
 *   下联：xxx
 *   横批：xxx
 * 图片：episode.images[0] / [1] 两张作为轮播底图。
 *
 * 范围：只做展示（read-only）。创建流程（CoupletGameView 966 行）不迁移 —— 用户可以在
 * 网页端生成后再绑定到 NFC，本端只负责展示。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { fetchShare } from "@/api/share";
import { ApiError } from "@/api/request";
import { STATIC_BASE } from "@/config/env";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";
import type { ShareDetail } from "@/types";

const shareId = ref("");
const loading = ref(true);
const errorMsg = ref("");
const share = ref<ShareDetail | null>(null);

const currentIdx = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

onLoad((opt) => {
  shareId.value = (opt?.id as string) || "";
});

onMounted(async () => {
  if (!shareId.value) {
    errorMsg.value = "缺少 id 参数";
    loading.value = false;
    return;
  }
  try {
    share.value = await fetchShare(shareId.value);
    startAutoplay();
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "加载失败";
    logger.warn("[couplet] load failed", e);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => stopAutoplay());

const bodyText = computed(() =>
  (share.value?.report?.episodes?.[0]?.copywriting?.body as string | undefined) || ""
);

const topCouplet = computed(() => match(/上联：([^\n]+)/));
const bottomCouplet = computed(() => match(/下联：([^\n]+)/));
const horizontal = computed(() => match(/横批：([^\n]+)/));
const reportTitle = computed(() => share.value?.report?.report_title || "春联");

function match(re: RegExp): string {
  const m = bodyText.value.match(re);
  return m?.[1]?.trim() || "";
}

const images = computed(() => {
  const arr = (share.value?.report?.episodes?.[0]?.images || []) as Array<{ image_url?: string }>;
  return arr.slice(0, 2).map((it) => resolveImg(it?.image_url || "")).filter(Boolean);
});

function resolveImg(url: string): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}

function startAutoplay() {
  stopAutoplay();
  if (images.value.length < 2) return;
  timer = setInterval(() => {
    currentIdx.value = (currentIdx.value + 1) % images.value.length;
  }, 3000);
}
function stopAutoplay() {
  if (timer) { clearInterval(timer); timer = null; }
}

function onPrev() {
  if (images.value.length < 2) return;
  currentIdx.value = (currentIdx.value - 1 + images.value.length) % images.value.length;
  startAutoplay();
}
function onNext() {
  if (images.value.length < 2) return;
  currentIdx.value = (currentIdx.value + 1) % images.value.length;
  startAutoplay();
}

function onBack() { uni.navigateBack(); }
</script>

<template>
  <view class="page">
    <view v-if="loading" class="state"><text>{{ uiText("正在打开春联…") }}</text></view>

    <view v-else-if="errorMsg" class="state state-err">
      <text class="state-title">{{ uiText("加载失败") }}</text>
      <text>{{ uiText(errorMsg) }}</text>
    </view>

    <view v-else class="couplet-root">
      <view class="topbar">
        <view class="back-btn" @click="onBack">
          <SvgIcon name="chevron-left" size="36rpx" color="#FFD700" />
        </view>
        <text class="topbar-title">{{ reportTitle }}</text>
        <view class="topbar-placeholder" />
      </view>

      <!-- 横批 -->
      <view v-if="horizontal" class="horizontal-wrap">
        <view class="horizontal-paper"><text>{{ horizontal }}</text></view>
      </view>

      <!-- 主体：左下联 / 中间照片 / 右上联（中国传统从右起读：右上联+左下联） -->
      <view class="body">
        <view v-if="bottomCouplet" class="side left-side">
          <view class="couplet-paper"><text class="vertical">{{ bottomCouplet }}</text></view>
        </view>

        <view class="photo-stage">
          <view v-if="images.length === 0" class="photo-empty">
            <text>{{ uiText("暂无照片") }}</text>
          </view>
          <image
            v-for="(url, i) in images" :key="i"
            v-show="i === currentIdx"
            class="photo"
            :src="url"
            mode="aspectFill"
          />
          <view v-if="images.length > 1" class="arrow arrow-left" @click="onPrev">
            <SvgIcon name="chevron-left" size="36rpx" color="#FFD700" />
          </view>
          <view v-if="images.length > 1" class="arrow arrow-right" @click="onNext">
            <SvgIcon name="chevron-right" size="36rpx" color="#FFD700" />
          </view>
          <view v-if="images.length > 1" class="dots">
            <view
              v-for="(_, i) in images" :key="i"
              class="dot" :class="{ active: i === currentIdx }"
            />
          </view>
        </view>

        <view v-if="topCouplet" class="side right-side">
          <view class="couplet-paper"><text class="vertical">{{ topCouplet }}</text></view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: #2a0d0d;
  background-image: radial-gradient(circle at 30% 20%, #5a1b1b 0%, #2a0d0d 70%);
  display: flex;
  flex-direction: column;
}

.state {
  padding: t.$spacing-6 t.$spacing-4;
  display: flex; flex-direction: column;
  align-items: center; gap: t.$spacing-2;
  color: #FFD700;
  font-size: t.$font-sm;
  text-align: center;
  &.state-err .state-title {
    color: #FFD700; font-size: t.$font-lg; font-weight: t.$weight-bold;
  }
}

.couplet-root {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: t.$spacing-3 t.$spacing-4;
  background: rgba(0,0,0,0.2);
}
.topbar-title {
  color: #FFD700; font-size: t.$font-md; font-weight: t.$weight-bold;
  max-width: 60vw;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.topbar-placeholder { width: 64rpx; }
.back-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: rgba(255,215,0,0.12);
  display: flex; align-items: center; justify-content: center;
}

// ---- 横批 ----
.horizontal-wrap {
  display: flex; justify-content: center;
  padding: t.$spacing-4;
}
.horizontal-paper {
  background: linear-gradient(180deg, #C41E3A 0%, #AA381E 100%);
  color: #FFD700;
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 16rpx;
  padding: 24rpx 48rpx;
  border-radius: 16rpx;
  border: 4rpx solid #FFD700;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.4);
  text-align: center;
}

// ---- 主体 ----
.body {
  flex: 1;
  display: flex;
  gap: t.$spacing-3;
  padding: 0 t.$spacing-4 t.$spacing-5;
  align-items: stretch;
  min-height: 600rpx;
}

.side {
  flex: 0 0 120rpx;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.couplet-paper {
  background: linear-gradient(180deg, #C41E3A 0%, #AA381E 100%);
  border: 4rpx solid #FFD700;
  border-radius: 12rpx;
  padding: 24rpx 12rpx;
  width: 80rpx;
  min-height: 480rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.4);
}
.vertical {
  color: #FFD700;
  font-size: 40rpx;
  font-weight: 700;
  // 小程序 ≥ 基础库 2.x 支持 writing-mode
  writing-mode: vertical-rl;
  letter-spacing: 12rpx;
  line-height: 1.6;
}

// ---- 照片轮播 ----
.photo-stage {
  flex: 1;
  position: relative;
  background: rgba(0,0,0,0.35);
  border: 4rpx solid rgba(255,215,0,0.5);
  border-radius: 20rpx;
  overflow: hidden;
  min-height: 480rpx;
}
.photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.photo-empty {
  display: flex; align-items: center; justify-content: center;
  height: 100%;
  color: rgba(255,215,0,0.5);
  font-size: t.$font-sm;
}
.arrow {
  position: absolute; top: 50%;
  transform: translateY(-50%);
  width: 72rpx; height: 72rpx;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
  border: 2rpx solid rgba(255,215,0,0.6);
  display: flex; align-items: center; justify-content: center;
}
.arrow-left { left: 16rpx; }
.arrow-right { right: 16rpx; }
.dots {
  position: absolute; bottom: 24rpx; left: 0; right: 0;
  display: flex; justify-content: center; gap: 12rpx;
}
.dot {
  width: 16rpx; height: 16rpx;
  border-radius: 50%;
  background: rgba(255,215,0,0.4);
}
.dot.active { background: #FFD700; }
</style>
