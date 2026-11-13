<script setup lang="ts">
/**
 * H5 悬浮返回按钮（2026-09-15，v2 对齐老 vue `.circle-btn` 契约）。
 *
 * 背景：pages.json globalStyle.h5.titleNView = false → H5 上没有原生导航栏 →
 * 无自建顶栏的子页面（存储空间 / 我的设置 / 我的客服 / 声纹协议）没有返回入口。
 *
 * 【契约来源】老 vue 网页版 `styles/auth/login.css .circle-btn`：
 *   - 40×40 圆
 *   - `backdrop-filter: blur(10px)` 毛玻璃
 *   - light: rgba(61,46,31,0.06) 底 + rgba(61,46,31,0.08) 边
 *   - dark:  rgba(255,255,255,0.10) 底 + rgba(255,255,255,0.10) 边
 * 严格照抄，不再自造尺寸 / 阴影 / 底色（v1 用了大浮 pill + 阴影，用户反馈"叠上去很诡异"）。
 *
 * 【使用规则】
 *   - 只在**没有自建顶栏** chevron 的页面挂 <H5BackFab />
 *   - 已有 `.topbar > .back-btn` 的页面（friends / nfc/history / album）**不要挂**
 *   - mp-weixin 一律不渲（有原生 nav）
 */
import SvgIcon from "./SvgIcon.vue";

function onBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/index/index" });
}
</script>

<template>
  <!-- #ifndef MP-WEIXIN -->
  <view class="h5-back-fab circle-btn" @click="onBack">
    <SvgIcon name="chevron-left" size="32rpx" color="#3D2E1F" />
  </view>
  <!-- #endif -->
</template>

<style lang="scss" scoped>
/* 2026-09-15 v5：`left` 由 App.vue 的 `.h5-back-fab` 全局规则托管（走 --doc-inner-left
   var，跟 back-fab / topbar 内缘严格一致）。此处**不写死** left —— 硬编码就是漂移的源。 */
.h5-back-fab {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 20rpx);
  z-index: 90;
}

/* 老 vue .circle-btn 严格复刻 —— 40×40 + 毛玻璃 */
.circle-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(61, 46, 31, 0.08);
  background: rgba(61, 46, 31, 0.06);
  transition: all 0.05s;
}
.circle-btn:active { transform: scale(0.94); }
</style>
