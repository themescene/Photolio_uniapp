<script setup lang="ts">
/**
 * SVG 图标 —— 支持运行时着色。
 *
 * mp-weixin 的 <image> 不会继承父级 color，外部静态 SVG 文件颜色是写死的。
 * 解决方案：把常用图标的 SVG 字符串内联在本组件，按 props.color 动态生成
 * data URI；这样：
 *   - 颜色跟着 props.color / 主题色 走
 *   - 仍只在编译产物里有一份 SVG 字符串（不需要 N 个着色副本文件）
 *
 * 用法：
 *   <SvgIcon name="play" size="40rpx" />
 *   <SvgIcon name="folder" size="32rpx" color="#3D2E1F" />
 *
 * 新增图标：在下面 ICONS 表里加一条；body 是 <svg> 内部（不包 <svg> 外层），
 * 用 {COLOR} 作为颜色占位。所有 stroke / fill 都换成 {COLOR} 即可跟主题色。
 */
import { computed } from "vue";

const props = withDefaults(defineProps<{
  name: string;
  size?: string;           // 例如 "32rpx" / "40rpx"
  color?: string;          // 默认主题深咖啡（亮模式 token 一致）
}>(), {
  size: "32rpx",
  color: "#3D2E1F",
});

// 所有可用图标的 SVG body —— 颜色用 {COLOR} 占位，运行时按 props.color 替换
const ICONS: Record<string, string> = {
  bowl: `<path d="M3 11h18a9 9 0 0 1-18 0ZM8 20h8M8 3v4M12 2v5M16 3v4" stroke="{COLOR}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  pin: `<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" stroke="{COLOR}" stroke-width="2" fill="none"/><circle cx="12" cy="10" r="2.5" stroke="{COLOR}" stroke-width="2" fill="none"/>`,
  plane: `<path d="m22 2-8 20-3-9-9-3 20-8ZM11 13 22 2" stroke="{COLOR}" stroke-width="2" stroke-linejoin="round" fill="none"/>`,
  refresh: `<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" stroke="{COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  play:  `<polygon points="6,4 20,12 6,20" fill="{COLOR}"/>`,
  pause: `<rect x="6" y="4" width="4" height="16" rx="1" fill="{COLOR}"/><rect x="14" y="4" width="4" height="16" rx="1" fill="{COLOR}"/>`,
  stop:  `<rect x="5" y="5" width="14" height="14" rx="2" fill="{COLOR}"/>`,
  mic:   `<rect x="9" y="3" width="6" height="12" rx="3" fill="{COLOR}"/><path d="M5 11a7 7 0 0 0 14 0" stroke="{COLOR}" stroke-width="2" stroke-linecap="round" fill="none"/><line x1="12" y1="18" x2="12" y2="21" stroke="{COLOR}" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="21" x2="16" y2="21" stroke="{COLOR}" stroke-width="2" stroke-linecap="round"/>`,
  'chevron-left':  `<polyline points="15 18 9 12 15 6" stroke="{COLOR}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  'chevron-right': `<polyline points="9 6 15 12 9 18" stroke="{COLOR}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  plus:  `<line x1="12" y1="5" x2="12" y2="19" stroke="{COLOR}" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="{COLOR}" stroke-width="2.5" stroke-linecap="round"/>`,
  close: `<line x1="6" y1="6" x2="18" y2="18" stroke="{COLOR}" stroke-width="2.5" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="{COLOR}" stroke-width="2.5" stroke-linecap="round"/>`,
  check: `<polyline points="20 6 9 17 4 12" stroke="{COLOR}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  gear:  `<circle cx="12" cy="12" r="3" stroke="{COLOR}" stroke-width="2" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  folder: `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  share: `<circle cx="18" cy="5" r="3" stroke="{COLOR}" stroke-width="2" fill="none"/><circle cx="6" cy="12" r="3" stroke="{COLOR}" stroke-width="2" fill="none"/><circle cx="18" cy="19" r="3" stroke="{COLOR}" stroke-width="2" fill="none"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="{COLOR}" stroke-width="2" stroke-linecap="round"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="{COLOR}" stroke-width="2" stroke-linecap="round"/>`,
  trash: `<polyline points="3 6 5 6 21 6" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  heart: `<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  comment: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  upload: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 8 12 3 7 8" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="{COLOR}" stroke-width="2" stroke-linecap="round"/>`,
  // 2026-08-11：加箭头朝下的下载图标（upload 是朝上，之前把下载错用成 upload 图标了）
  download: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><polyline points="7 12 12 17 17 12" stroke="{COLOR}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="17" stroke="{COLOR}" stroke-width="2" stroke-linecap="round"/>`,
};

const src = computed(() => {
  const body = ICONS[props.name] || '';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${body.replace(/{COLOR}/g, props.color)}</svg>`;
  // mp-weixin 的 <image> 对 `;utf8,` 这种**非标准** mime 参数渲染不稳（实测有不显示的情况）。
  // 改成 base64：图标内容是纯 ASCII（color 已替换、路径都是数字 / 字母），
  // 直接 btoa 即可，无需额外 UTF-8 处理。mp-weixin 基础库 ≥ 2.x 支持 btoa。
  return `data:image/svg+xml;base64,${strToBase64Ascii(svg)}`;
});

function strToBase64Ascii(s: string): string {
  // 全部 ASCII 时直接 btoa；mp-weixin 没有 btoa 时用手写 base64 兜底
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (typeof globalThis !== 'undefined' ? globalThis : (0, eval)('this')) as { btoa?: (s: string) => string };
  if (typeof g.btoa === 'function') {
    try { return g.btoa(s); } catch { /* fall through */ }
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c1 = s.charCodeAt(i++) & 0xff;
    const c2 = i < s.length ? s.charCodeAt(i++) & 0xff : NaN;
    const c3 = i < s.length ? s.charCodeAt(i++) & 0xff : NaN;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 0x3) << 4) | ((isNaN(c2) ? 0 : c2) >> 4);
    const e3 = isNaN(c2) ? 64 : (((c2 & 0xf) << 2) | ((isNaN(c3) ? 0 : c3) >> 6));
    const e4 = isNaN(c3) ? 64 : c3 & 0x3f;
    out += chars.charAt(e1) + chars.charAt(e2) +
           (e3 === 64 ? '=' : chars.charAt(e3)) +
           (e4 === 64 ? '=' : chars.charAt(e4));
  }
  return out;
}

const sizeStyle = computed(() => ({ width: props.size, height: props.size }));
</script>

<template>
  <image class="svg-icon" :src="src" mode="aspectFit" :style="sizeStyle" />
</template>

<style lang="scss" scoped>
.svg-icon {
  display: inline-block;
  vertical-align: middle;
}
</style>
