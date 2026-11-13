<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 播放 tab —— Phase 3 v3：不自己实现播放，直接重定向到完整播放页。
 *
 * 之前的实现是简化版（只渲染 wooden_box 第一个 episode、没视频、没控制栏），
 * 与 `/pages/share/play` 的真正播放页体验不一致，被用户吐槽"半成品"。
 *
 * 新策略：
 *   - tab 进入时读 storage 里的「最近播放」share_id
 *   - 有 → redirectTo /pages/share/play?id=xxx（完整播放页）
 *   - 没有 → 显示空态 + "回画匣子选一份" CTA
 *
 * 这样保证「点开任何画匣子的体验」和「点底栏播放 tab 的体验」完全一致。
 */
import { resolveContentDestination } from "@/services/contentNavigation";
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import CustomTabBar from "@/components/CustomTabBar.vue";

const STORAGE_KEY_LAST = "photolio_last_played_share";

const noLastPlayed = ref(false);

onShow(async () => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 fallback */ }
  try {
    const id = uni.getStorageSync(STORAGE_KEY_LAST);
    if (id) {
      uni.redirectTo({ url: await resolveContentDestination(String(id)) });
      return;
    }
  } catch { uni.showToast({ title: "内容暂时无法打开，请从画匣子重试", icon: "none" }); }
  noLastPlayed.value = true;
});

function gotoHome() {
  uni.switchTab({ url: "/pages/index/index" });
}
</script>

<template>
  <view class="page">
    <view v-if="noLastPlayed" class="empty">
      <text class="empty-title">{{ uiText("还没有打开过任何回忆") }}</text>
      <text class="empty-sub">{{ uiText("从画匣子里挑一份开始观看") }}</text>
      <view class="btn btn-primary" @click="gotoHome"><text>{{ uiText("回画匣子") }}</text></view>
    </view>

    <CustomTabBar active="play" />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty {
  display: flex; flex-direction: column;
  align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-4;
  .empty-title { font-size: t.$font-lg; font-weight: t.$weight-bold; color: t.$color-text; }
  .empty-sub { font-size: t.$font-sm; color: t.$color-text-soft; }
}

.btn {
  margin-top: t.$spacing-3;
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  padding: 0 t.$spacing-6;
  font-size: t.$font-md;
  display: flex; align-items: center; justify-content: center;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
</style>
