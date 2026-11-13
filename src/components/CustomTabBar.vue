<script setup lang="ts">
import { t as uiText, locale } from "@/i18n";
/**
 * 自定义底栏 —— 替代 mp-weixin 原生 tabBar，让我们可以用 SVG 图标。
 *
 * 用法：
 *   每个 tab 页面在模板末尾放 <CustomTabBar :active="'home'" />
 *   并在 onShow() 里调 uni.hideTabBar({ animation: false, fail: () => {} })
 *
 * 原理：原生 tabBar 仍然在 pages.json 注册（保证 switchTab 能用、5 个页面被识别为
 * tab 页），但每个 tab 页 onShow 把它隐藏，由本组件接管视觉呈现。点击调 switchTab。
 *
 * 图标来源：src/static/tabbar-svg/<name>.svg
 *   - 文件本身用 #2c3e50 着色
 *   - 未选中：opacity 0.45 让它看起来是中性灰
 *   - 选中：opacity 1
 */
import { computed } from "vue";

type TabKey = "home" | "upload" | "play" | "nfc" | "profile";

interface TabDef {
  key: TabKey;
  label: string;
  path: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: "home",    label: "画匣子", path: "/pages/index/index",   icon: "/static/tabbar-svg/home.svg"    },
  { key: "upload",  label: "上传",   path: "/pages/upload/index",  icon: "/static/tabbar-svg/upload.svg"  },
  { key: "play",    label: "播放",   path: "/pages/play/index",    icon: "/static/tabbar-svg/play.svg"    },
  { key: "nfc",     label: "NFC",   path: "/pages/nfc/index",      icon: "/static/tabbar-svg/nfc.svg"     },
  { key: "profile", label: "我的",   path: "/pages/my/index",      icon: "/static/tabbar-svg/profile.svg" },
];

const props = defineProps<{ active: TabKey }>();

const tabs = computed(() => TABS);

function go(t: TabDef) {
  if (t.key === props.active) return;
  uni.switchTab({ url: t.path });
}
</script>

<template>
  <view class="tab-bar">
    <view
      v-for="t in tabs"
      :key="t.key"
      class="tab-item"
      :class="{ active: t.key === active }"
      @click="go(t)"
    >
      <image class="tab-icon" :src="t.icon" mode="aspectFit" />
      <text class="tab-label">{{ locale === 'en' ? ({ home: 'Home', upload: 'Upload', play: 'Play', nfc: 'NFC', profile: 'You' }[t.key]) : t.label }}</text>
    </view>
    <!-- iPhone 底部圆角安全区占位 -->
    <view class="safe-bottom" />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.tab-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  display: flex;
  flex-wrap: wrap;
  z-index: 50;
  padding-bottom: env(safe-area-inset-bottom);
}

/* 2026-09-15 v5：位置 / 宽度全交给 App.vue 的 `.tab-bar` 全局规则托管
   （max-width: var(--doc-inner-width) —— 契约见 [App.vue :root vars]）。
   此处只保留 tabbar 特有的**视觉**（圆角 + 阴影 + 无硬边线）。 */
/* #ifdef H5 */
.tab-bar {
  border-top-left-radius: 28rpx;
  border-top-right-radius: 28rpx;
  border-top: none;
  box-shadow: 0 -8rpx 24rpx rgba(61, 46, 31, 0.08);
  overflow: hidden;
}
/* #endif */

.tab-item {
  flex: 1;
  height: 100rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  opacity: 0.6;     // 用户反馈 0.45 看不清 → 调到 0.6 拉对比度
}
.tab-item.active { opacity: 1; }

.tab-icon {
  width: 48rpx;     // 比原来 44 大一档，让 thin line svg 更易识别
  height: 48rpx;
}

.tab-label {
  font-size: 22rpx;
  color: t.$color-accent;
  line-height: 1.2;
}

.safe-bottom { width: 100%; }
</style>
