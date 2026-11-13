<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 模板共享媒体区。**对齐网页端 PlayView.vue:611-700**：
 *   网页端的设计是「图片和视频共用同一个模板槽」，视频以 <template #image-overlay>
 *   覆盖在 image-section 上层渲染（参考 PlayView.vue `<FoodCard :imageUrl/:images>
 *   <template #image-overlay><video class="video-in-slot"/></template>`）
 *
 * 这里走对应的 mp-weixin 版本：把图和视频都装进 .tpl-image 这一个 4:3 容器，
 * 当前 item 是 image → <image>；是 video → <video>。视频如果是竖屏会左右留黑边
 * （和网页端表现一致——网页端 `.video-in-slot { object-fit: contain; }` 也是这样）
 *
 * 行为：
 *   - 4:3 容器宽高比（可被模板覆写）
 *   - 左右滑动切换图 / 视频混合列表
 *   - 图片点击触发 uni.previewImage（只传图，不混入视频 URL）
 *   - 视频点 controls / 全屏按钮（mp-weixin 自带 show-fullscreen-btn）
 *
 * **不再用 `images: string[]`** —— 改成 `items: MediaItem[]`。各 Card 把
 * episode.images 整体（含 media_type / thumbnail_url）映射进来。
 */
import { computed, ref, getCurrentInstance, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { logger } from '@/utils/logger'
import { useVideoStallDetector } from '@/composables/useVideoStallDetector'
// #ifdef H5
import H5AnimatedImage from '@/components/H5AnimatedImage.vue'
// #endif
import { usePlaybackStore } from '@/stores/playback'
import SvgIcon from '@/components/SvgIcon.vue'

export interface MediaItem {
  url: string
  type: 'image' | 'video'
  thumbnail?: string
  /** 2026-07-25 hotfix13：3 年后归档到冷存储 → 云端已删原文件；渲染灰色占位符 */
  archived?: boolean
}

const props = defineProps<{
  items: MediaItem[]
  /** 受控当前 index；不传则组件内部维护 */
  currentIndex?: number
  /** 容器宽高比；默认 4/3，可由模板覆写为 1/1 等 */
  aspectRatio?: string
  /** 圆角 rpx；默认 0 */
  radius?: string
}>()

const emit = defineEmits<{
  (e: 'update:currentIndex', idx: number): void
  (e: 'change', idx: number): void
}>()

// 每个实例分配一个稳定的 videoId，用于 uni.createVideoContext 触发全屏
// （模板可能被多个 Card 同时挂载，随机后缀去重）
const videoId = `tpl-video-${Math.random().toString(36).slice(2, 8)}`
// mp-weixin：Vue 3 组件里 uni.createVideoContext(id) 找不到组件作用域内的 video，
// 必须传第二个参数 = 组件 instance；否则只能查页面级 id，component 内的 video 拿不到
const instance = getCurrentInstance()

function enterFullscreen() {
  try {
    const proxy = (instance as unknown as { proxy: unknown } | null)?.proxy
    const ctx = uni.createVideoContext(videoId, proxy as never)
    ctx?.requestFullScreen({ direction: 0 })
  } catch (e) {
    logger.warn('[tpl-image] enterFullscreen failed', e)
  }
}

const playback = usePlaybackStore()
const viewportVisible = ref(true)

const internalIdx = ref(0)
const idx = computed({
  get: () => (props.currentIndex !== undefined ? props.currentIndex : internalIdx.value),
  set: (v: number) => {
    if (props.currentIndex !== undefined) {
      emit('update:currentIndex', v)
    } else {
      internalIdx.value = v
    }
    emit('change', v)
  },
})

const total = computed(() => props.items?.length || 0)
const cur = computed<MediaItem | null>(() => props.items?.[idx.value] || null)
const isVideo = computed(() => cur.value?.type === 'video')
// #ifdef MP-WEIXIN
viewportVisible.value = false
let viewportObserver: UniApp.IntersectionObserver | null = null
onMounted(() => {
  viewportObserver = uni.createIntersectionObserver(instance?.proxy as never, { thresholds: [0, .5] })
  viewportObserver.relativeToViewport().observe('.tpl-image', entry => { viewportVisible.value = entry.intersectionRatio >= .5 })
})
watch(() => [viewportVisible.value, playback.autoplay, idx.value, isVideo.value], async () => {
  await nextTick()
  const context = uni.createVideoContext(videoId, instance?.proxy as never)
  if (isVideo.value && viewportVisible.value && playback.autoplay) context.play(); else context.pause()
})
onUnmounted(() => viewportObserver?.disconnect())
// #endif

function prev() {
  if (total.value <= 1) return
  idx.value = (idx.value - 1 + total.value) % total.value
}
function next() {
  if (total.value <= 1) return
  idx.value = (idx.value + 1) % total.value
}

function onTap() {
  if (!cur.value) return
  if (cur.value.type === 'image') {
    // 只把图片 URL 传给 previewImage；视频跳过
    const urls = props.items.filter((it) => it.type === 'image').map((it) => it.url)
    uni.previewImage({ urls, current: cur.value.url })
  }
  // video 的点击交给 <video> 自身的 controls（mp-weixin 原生组件）
}

let startX = 0
function onTouchStart(e: TouchEvent) { startX = e.touches[0]?.clientX || 0 }
function onTouchEnd(e: TouchEvent) {
  const dx = (e.changedTouches[0]?.clientX || 0) - startX
  if (Math.abs(dx) > 40) (dx > 0 ? prev() : next())
}

// 调试 —— 网页端实机调试不便，video 状态都进 console，便于 wx devtools 看
function onVideoMeta(e: Event) {
  const detail = (e as unknown as { detail?: { width?: number; height?: number; duration?: number } })?.detail
  logger.info('[tpl-image] video metadata', { ...detail, url: cur.value?.url })
}
function onVideoErrorBase(e: Event) {
  const detail = (e as unknown as { detail?: { errMsg?: string } })?.detail
  logger.warn('[tpl-image] video error', detail, cur.value?.url)
}
function onVideoPlay() { logger.info('[tpl-image] video play', cur.value?.url) }

// —— 卡顿检测：@waiting 累计 5 次 → 提示「视频较大，建议下载到本地相册播放」
// 参考 [composables/useVideoStallDetector.ts]
const stallDetector = useVideoStallDetector(() => cur.value?.url)
function onVideoWaiting() { stallDetector.onWaiting() }
function onVideoError(e: Event) {
  onVideoErrorBase(e)
  stallDetector.onError(e)
}

const aspect = computed(() => props.aspectRatio || '4 / 3')
const radius = computed(() => props.radius || '0')

// 2026-09-14：<image> 优先渲染 thumbnail（gthumb 40-120KB，秒开）；缩略图 URL 加载失败
// （nginx alias 上没落文件 / CDN 缓存了 404 等）就回落原图。与 album/index.vue 同一策略：
// 缩略图是加速手段，绝不能成为「能不能看到图」的前提。
const failedThumbs = ref<Set<string>>(new Set())
const displaySrc = computed(() => {
  const c = cur.value
  if (!c) return ''
  if (/\.gif(?:[?#]|$)/i.test(c.url) && playback.autoplay && viewportVisible.value) return c.url
  const t = c.thumbnail
  if (t && !failedThumbs.value.has(t)) return t
  return c.url
})
function onImgError(e: Event) {
  const c = cur.value
  const t = c?.thumbnail
  if (!t || failedThumbs.value.has(t)) return
  logger.warn('[tpl-image] 缩略图加载失败，回落原图', { thumbnail: t, url: c?.url, e })
  failedThumbs.value.add(t)
  failedThumbs.value = new Set(failedThumbs.value) // Set mutate 不触发响应
}
</script>

<template>
  <view
    class="tpl-image"
    :style="{ aspectRatio: aspect, borderRadius: radius }"
    @click="onTap"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <!-- 2026-07-25 hotfix13：archived media 显示灰色占位符（云端已删原文件）
         用户在 share/play 顶部会看到「取回完整内容」按钮 -->
    <view
      v-if="cur && cur.archived"
      class="tpl-archived"
      :style="{ borderRadius: radius }"
    >
      <SvgIcon name="folder" size="72rpx" color="#8A7A6A" />
      <text class="tpl-archived-text">{{ uiText("已归档到冷存储") }}</text>
      <text class="tpl-archived-hint">{{ uiText("上方点「取回完整内容」恢复") }}</text>
    </view>
    <!-- 视频 item：占满容器，object-fit contain（竖屏视频会留黑边，对齐网页端 .video-in-slot 表现）
         picture-in-picture-mode="" 显式关掉小窗模式 —— 之前用户看到「右上角关闭小程序按钮」
         其实是 mp-weixin 全屏态的 PIP（小窗播放）按钮，会弹「视频/语音通话将会最小化为浮窗」
         说明用户容易误触 → 干脆关掉。全屏统一走右上角 cover-view 的「全屏」按钮 -->
    <video
      v-else-if="isVideo && cur"
      :id="videoId"
      class="tpl-video"
      :src="cur.url"
      :autoplay="playback.autoplay && viewportVisible"
      :muted="playback.autoplay"
      :poster="cur.thumbnail || ''"
      object-fit="contain"
      controls
      show-fullscreen-btn
      picture-in-picture-mode=""
      :style="{ borderRadius: radius }"
      @loadedmetadata="onVideoMeta"
      @play="onVideoPlay"
      @waiting="onVideoWaiting"
      @error="onVideoError"
      @click.stop
    />
    <!-- 图片 item：常规 aspectFill。src 优先 thumbnail，失败 @error 回落原图 -->
    <!-- #ifdef H5 -->
    <H5AnimatedImage v-else-if="cur && /\.gif(?:[?#]|$)/i.test(cur.url)" :src="cur.url" cropped class="tpl-img" />
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <view v-else-if="cur && /\.gif(?:[?#]|$)/i.test(cur.url) && (!playback.autoplay || !viewportVisible) && (!cur.thumbnail || cur.thumbnail === cur.url)" class="tpl-archived"><SvgIcon name="play" size="56rpx" color="#8A7A6A" /><text>{{ uiText('点击查看 GIF') }}</text></view>
    <!-- #endif -->
    <image
      v-else-if="cur"
      class="tpl-img"
      :src="displaySrc"
      mode="aspectFill"
      :style="{ borderRadius: radius }"
      @error="onImgError"
    />

    <slot name="overlay" />

    <!-- 右上角全屏按钮：video 是 mp-weixin 原生组件，普通 view 会被吃掉，必须用 cover-view
         承载点击；用户明确要求「全屏按钮放在右上角」，减少他们误触自带 PIP 按钮的概率 -->
    <cover-view v-if="isVideo && cur" class="fs-btn" @click="enterFullscreen">
      <cover-view class="fs-btn-label">{{ uiText("全屏") }}</cover-view>
    </cover-view>

    <!-- 2026-09-16：H5 桌面浏览器上鼠标无 touchstart/touchend → 无法翻页。
         补两个左右点击箭头（`@click.stop` 阻止冒泡到父 onTap，别触发 previewImage）。
         mp-weixin 端有 native swipe 手势，不显示。 -->
    <!-- #ifdef H5 -->
    <view v-if="total > 1" class="tpl-nav tpl-nav-prev" @click.stop="prev">
      <SvgIcon name="chevron-left" size="40rpx" color="#F7F3EE" />
    </view>
    <view v-if="total > 1" class="tpl-nav tpl-nav-next" @click.stop="next">
      <SvgIcon name="chevron-right" size="40rpx" color="#F7F3EE" />
    </view>
    <!-- #endif -->

    <!-- 媒体计数（≥ 2 才显示）；视频时移到左上，避免与右上角「全屏」按钮重叠 -->
    <view v-if="total > 1" class="counter" :class="{ 'counter-left': isVideo }">
      <text>{{ idx + 1 }} / {{ total }}</text>
      <text v-if="isVideo" class="counter-tag">{{ uiText("视频") }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.tpl-image {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #000; // 视频留边时背景是黑，跟网页端 video-in-slot 一致
}
.tpl-img {
  width: 100%;
  height: 100%;
  display: block;
}
.tpl-video {
  width: 100%;
  height: 100%;
  display: block;
}

// 2026-07-25 hotfix13：archived media 占位符
.tpl-archived {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  background: #E8E0D4;   // 暖灰
  color: #8A7A6A;
  padding: 40rpx;
}
.tpl-archived-text {
  font-size: 26rpx;
  color: #6B5F52;
  font-weight: 500;
}
.tpl-archived-hint {
  font-size: 22rpx;
  color: #A89A8A;
  text-align: center;
}

// 全屏按钮 —— 用 cover-view 覆盖原生 <video>，位置右上角
// counter 也在右上角时，通过 top 值错开（fs-btn 顶部 + counter 挪到下方或左上）
.fs-btn {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
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

.counter {
  position: absolute;
  top: 20rpx;
  right: 20rpx;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 999rpx;
  padding: 4rpx 18rpx;
  font-size: 22rpx;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
}
// 视频时 counter 位于左上，让出右上角给「全屏」按钮
.counter.counter-left {
  right: auto;
  left: 20rpx;
}
.counter-tag {
  background: rgba(196, 74, 74, 0.85);
  padding: 0 10rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
}

/* 2026-09-16：H5 桌面翻页箭头。半透明黑底 + 白 icon，跟 counter 一套视觉。 */
.tpl-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 12;
  cursor: pointer;
  transition: background 0.15s;
}
.tpl-nav:hover { background: rgba(0, 0, 0, 0.65); }
.tpl-nav:active { transform: translateY(-50%) scale(0.94); }
.tpl-nav-prev { left: 20rpx; }
.tpl-nav-next { right: 20rpx; }
</style>
