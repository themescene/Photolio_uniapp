<script setup lang="ts">
/**
 * H5 全屏大图预览（2026-09-16 新增，替代 uni.previewImage）。
 *
 * 为什么不用 uni.previewImage：
 *   uni-h5 的 previewImage 组件把整个 urls 数组批量渲染成 `<img>` → 浏览器一次性
 *   并发 fetch → 撞 HTTP/2 单连接并发流上限（Chrome ~100 / nginx 1.18 默认 128）
 *   → ERR_HTTP2_PROTOCOL_ERROR。窗口化只能治标（总有边界左右箭头灰），
 *   无法根除。**唯一根治**：DOM 里一次只 render 当前图 + 前后各 1 张（做丝滑切换）。
 *
 * 契约：只用于 H5，mp-weixin 继续 uni.previewImage（微信原生，不撞 h2 上限）。
 *
 * Props:
 *   - visible: 是否展示
 *   - urls: 全量图片 URL 数组（可几百张，只 render 当前的，不 load 别的）
 *   - initialIdx: 打开时定位到哪张
 *
 * Emits:
 *   - close: 关闭时触发
 *
 * 交互：
 *   - 点空白背景关闭
 *   - 左/右箭头翻页（在两端时不显示对应箭头）
 *   - 触屏 swipe 翻页
 *   - Esc 关闭 / 左右键翻页（桌面浏览器）
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import SvgIcon from "./SvgIcon.vue";
import H5AnimatedImage from "./H5AnimatedImage.vue";
import { usePreviewText } from "@/i18n"

const t = usePreviewText()
const props = defineProps<{
  visible: boolean;
  urls: string[];
  initialIdx: number;
}>();
const emit = defineEmits<{ close: [] }>();

const currentIdx = ref(0);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const attempt = ref(0);
const closeButton = ref<HTMLButtonElement | null>(null);
watch(() => [props.visible, props.urls[currentIdx.value], attempt.value], () => { state.value = 'loading'; }, { flush: 'sync' });
watch(() => props.visible, (visible, _, cleanup) => {
  if (!visible || typeof document === 'undefined') return;
  const previousFocus = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  void nextTick(() => { if (props.visible) closeButton.value?.focus(); });
  cleanup(() => {
    document.body.style.overflow = previousOverflow;
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  });
}, { immediate: true });
watch(
  () => [props.visible, props.initialIdx] as const,
  ([v, idx]) => {
    if (v) currentIdx.value = Math.max(0, Math.min(idx, props.urls.length - 1));
  },
  { immediate: true },
);

const total = computed(() => props.urls.length);
const canPrev = computed(() => currentIdx.value > 0);
const canNext = computed(() => currentIdx.value < total.value - 1);

function prev() { if (canPrev.value) currentIdx.value--; }
function next() { if (canNext.value) currentIdx.value++; }
function close() { emit("close"); }

// 触屏 swipe
let _touchStartX = 0;
function onTouchStart(e: TouchEvent) { _touchStartX = e.touches[0]?.clientX || 0; }
function onTouchEnd(e: TouchEvent) {
  const dx = (e.changedTouches[0]?.clientX || 0) - _touchStartX;
  if (Math.abs(dx) > 40) (dx > 0 ? prev() : next());
}

// 桌面浏览器：Esc 关闭、左右方向键翻页
function onKey(e: KeyboardEvent) {
  if (!props.visible) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
  else if (e.key === "Tab") {
    const controls = closeButton.value?.closest('.h5-preview')?.querySelectorAll<HTMLElement>('button, a[href]');
    const first = controls?.[0], last = controls?.[controls.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }
}
onMounted(() => {
  window.addEventListener("keydown", onKey, true);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey, true);
});
</script>

<template>
  <view
    v-if="visible"
    class="h5-preview"
    role="dialog"
    aria-modal="true"
    :aria-label="t('图片预览')"
    @click.self="close"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <!-- 关键：只 render 当前图。urls 里其它 URL 不进 DOM → 不 fetch → 不撞 h2 上限。
         切换时 currentIdx 变 → src 变 → 浏览器只下载新的那张。 -->
    <H5AnimatedImage v-if="/\.gif(?:[?#]|$)/i.test(urls[currentIdx] || '')" :key="'gif-' + attempt" :src="urls[currentIdx]" cropped fit="contain" class="h5-preview-img" @loaded="state = 'ready'" @failed="state = 'error'" @click.stop />
    <image v-else
      :key="attempt"
      class="h5-preview-img"
      :src="urls[currentIdx] || ''"
      mode="aspectFit"
      @load="state = 'ready'"
      @error="state = 'error'"
      @click.stop
    />

    <!-- 顶部关闭 + 计数（只在 total > 1 时显示计数） -->
    <view class="h5-preview-topbar">
      <component :is="'button'" ref="closeButton" type="button" class="h5-preview-close" :aria-label="t('关闭')" @click.stop="close">
        <SvgIcon name="close" size="36rpx" color="#F7F3EE" />
      </component>
      <view v-if="total > 1" class="h5-preview-counter">
        <text>{{ currentIdx + 1 }} / {{ total }}</text>
      </view>
    </view>

    <div v-if="state !== 'ready'" class="h5-preview-status" role="status">
      {{ state === 'loading' ? t('正在加载预览…') : t('图片暂时无法显示') }}
      <component :is="'button'" v-if="state === 'error'" type="button" @click.stop="attempt++">{{ t('重试') }}</component>
      <a v-if="state === 'error'" :href="urls[currentIdx]" target="_blank" rel="noopener noreferrer">{{ t('打开原链接') }}</a>
    </div>
    <!-- 左右箭头 —— 到边界时不显示（不是灰）避免用户点半天没反应 -->
    <component :is="'button'" v-if="canPrev" type="button" class="h5-preview-nav prev" :aria-label="t('上一张')" @click.stop="prev">
      <SvgIcon name="chevron-left" size="48rpx" color="#F7F3EE" />
    </component>
    <component :is="'button'" v-if="canNext" type="button" class="h5-preview-nav next" :aria-label="t('下一张')" @click.stop="next">
      <SvgIcon name="chevron-right" size="48rpx" color="#F7F3EE" />
    </component>
  </view>
</template>

<style lang="scss" scoped>
.h5-preview {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.94);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.h5-preview-img {
  width: 100%;
  height: 100%;
  display: block;
}
.h5-preview-status { position: absolute; display: grid; gap: 8px; justify-items: center; color: white; }
.h5-preview-status a { color: inherit; }
.h5-preview-close { margin: 0; padding: 0; border: 0; }
.h5-preview-topbar {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 16rpx);
  left: 16rpx;
  right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  z-index: 2;
  & > * { pointer-events: auto; }
}
.h5-preview-close {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.h5-preview-counter {
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.12);
  color: #F7F3EE;
  font-size: 24rpx;
  backdrop-filter: blur(10px);
}
.h5-preview-nav {
  padding: 0;
  margin: 0;
  border: 0;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.10);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
  z-index: 2;
  &:hover { background: rgba(255, 255, 255, 0.22); }
  &:active { transform: translateY(-50%) scale(0.94); }
}
.h5-preview-nav.prev { left: max(clamp(12px, 2vw, 24px), env(safe-area-inset-left)); }
.h5-preview-nav.next { right: max(clamp(12px, 2vw, 24px), env(safe-area-inset-right)); }
</style>
