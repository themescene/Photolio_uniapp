<script setup lang="ts">
/**
 * 上传 tab —— Phase 3 P2：直接承担创作流程。
 *
 * 参考：annualreport/src/views/UploadView.vue 的 HOME→UPLOAD→COMPOSE 状态机
 * tab 模式：CreationFlow 内部 fixed actions-bar 会被告知给 CustomTabBar 让位
 *  （CreationFlow 检测 mode=tab 时把自己 actions-bar 上移 tab-bar 高度）
 *
 * 2026-09-25：h5 无感登录（?exchange_code=xxx）已上移到 App.vue 全局处理，本页只做 UI。
 */
import CreationFlow from "@/components/CreationFlow.vue";
import CustomTabBar from "@/components/CustomTabBar.vue";
import { onShow } from "@dcloudio/uni-app";

onShow(() => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 fallback */ }
});
</script>

<template>
  <view class="upload-tab-wrap">
    <CreationFlow mode="tab" />
    <CustomTabBar active="upload" />
  </view>
</template>

<style lang="scss" scoped>
.upload-tab-wrap { width: 100%; height: 100vh; }
</style>
