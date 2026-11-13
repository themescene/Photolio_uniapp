<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 邀请共创页 —— 参考 annualreport/src/components/InviteEditModal.vue
 *
 * 后端：POST /api/share/<id>/invite → { code }
 * 邀请链接：${STATIC_BASE}/share/<id>/<code>
 *
 * 用法：在 share/play 点「邀请共创」 → navigateTo 到本页 → 自动生成邀请码 →
 *      用户可以复制链接 或 用 <button open-type="share"> 直接转给微信好友。
 */
import { ref, computed, onMounted } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import { inviteShare } from "@/api/share";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";

const shareId = ref("");
const shareTitle = ref("");
const code = ref("");
const loading = ref(true);
const errorMsg = ref("");

// 小程序内部 path（受邀者点微信卡片直接打开本页）
// 网页 URL 不再向用户展示，避免他们误以为分享出去的是浏览器链接（p3 痛点）
const miniProgramPath = computed(() =>
  code.value ? `/pages/share/play?id=${shareId.value}&invite=${code.value}` : ""
);

onLoad((opt) => {
  shareId.value = (opt?.id as string) || "";
  shareTitle.value = decodeURIComponent((opt?.title as string) || "");
});

onMounted(async () => {
  if (!shareId.value) {
    errorMsg.value = "缺少 id 参数";
    loading.value = false;
    return;
  }
  await regen();
});

async function regen() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const r = await inviteShare(shareId.value, null);
    code.value = r.code;
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "邀请码准备失败";
    logger.warn("[invite] gen failed", e);
  } finally {
    loading.value = false;
  }
}

function copyMiniPath() {
  if (!miniProgramPath.value) return;
  uni.setClipboardData({
    data: miniProgramPath.value,
    success: () => uni.showToast({ title: "已复制小程序路径", icon: "success" }),
  });
}

function onBack() { uni.navigateBack(); }

// 微信图文卡片分享：把邀请链接放进 path 里（指向小程序播放页 + 邀请码 query）
onShareAppMessage(() => ({
  title: shareTitle.value ? `${shareTitle.value} · 邀你共创` : "邀你共创回忆",
  path: `/pages/share/play?id=${encodeURIComponent(shareId.value)}&invite=${encodeURIComponent(code.value)}`,
}));
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="back-btn" @click="onBack">
        <SvgIcon name="chevron-left" size="36rpx" />
      </view>
      <text class="topbar-title">{{ uiText("邀请共创") }}</text>
      <view class="topbar-placeholder" />
    </view>

    <view class="content">
      <view class="hero">
        <SvgIcon name="share" size="64rpx" color="#3D2E1F" />
        <text class="hero-title">{{ shareTitle || uiText("邀 TA 一起讲这段回忆") }}</text>
        <text class="hero-sub">{{ uiText("收到邀请的人能继续追加章节、添加评论") }}</text>
      </view>

      <view v-if="loading" class="state"><text>{{ uiText("正在准备邀请链接…") }}</text></view>

      <view v-else-if="errorMsg" class="state state-err">
        <text>{{ uiText(errorMsg) }}</text>
        <view class="btn-ghost" @click="regen"><text>{{ uiText("重试") }}</text></view>
      </view>

      <template v-else-if="miniProgramPath">
        <!-- p3 修：突出微信小程序卡片分享是主要动作，不再展示「网页版」URL —— 用户实测
             误以为分享出去的是浏览器链接。微信图文卡片自带 path 参数，对方点开直接
             跳转到本小程序的播放页，并自动消费 invite 邀请码加入共创。 -->
        <view class="card-preview">
          <view class="preview-icon">
            <SvgIcon name="share" size="48rpx" color="#3D2E1F" />
          </view>
          <view class="preview-body">
            <text class="preview-title">{{ shareTitle || uiText("画匣子") }} {{ uiText("· 邀你共创") }}</text>
            <text class="preview-sub">{{ uiText("好友点击微信卡片直接进入小程序，可继续追加章节") }}</text>
          </view>
        </view>

        <view class="actions">
          <button class="btn-primary" open-type="share">
            <SvgIcon name="share" size="32rpx" color="#F7F3EE" />
            <text>{{ uiText("转发给微信好友") }}</text>
          </button>
          <view class="btn-ghost-mini" @click="copyMiniPath">
            <text>{{ uiText("复制小程序路径（用于打印 / 转给他人）") }}</text>
          </view>
          <view class="btn-ghost-mini" @click="regen">
            <text>{{ uiText("换一个邀请码") }}</text>
          </view>
        </view>

        <text class="hint">{{ uiText("邀请码是一次性的，换一个后旧的会失效") }}</text>
      </template>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: t.$spacing-3 t.$spacing-4;
  border-bottom: 2rpx solid t.$color-border;
  background: t.$color-bg;
}
.topbar-title { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.topbar-placeholder { width: 64rpx; }
.back-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
}

.content {
  flex: 1;
  padding: t.$spacing-5 t.$spacing-4;
  display: flex; flex-direction: column;
  gap: t.$spacing-5;
}

.hero {
  display: flex; flex-direction: column; align-items: center;
  gap: t.$spacing-2;
  padding: t.$spacing-4 0;
}
.hero-title {
  font-size: t.$font-lg; font-weight: t.$weight-bold;
  color: t.$color-text;
  text-align: center;
}
.hero-sub {
  font-size: t.$font-sm; color: t.$color-text-mute;
}

.state {
  padding: t.$spacing-5;
  display: flex; flex-direction: column;
  align-items: center; gap: t.$spacing-3;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  &.state-err { color: t.$color-danger; }
}

.card-preview {
  display: flex;
  align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-3 t.$spacing-4;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-card;
  box-shadow: t.$shadow-soft;
}
.preview-icon {
  width: 88rpx; height: 88rpx;
  border-radius: 50%;
  background: #EDE4D8;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.preview-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  gap: 4rpx;
}
.preview-title {
  font-size: t.$font-md;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.preview-sub {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  line-height: 1.5;
}

.actions {
  display: flex; flex-direction: column;
  gap: t.$spacing-3;
}
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 8rpx;
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-md;
}
.btn-ghost {
  display: inline-flex; align-items: center; justify-content: center;
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  background: transparent;
  border: 2rpx solid t.$color-border;
  color: t.$color-text;
  font-size: t.$font-md;
}
.btn-ghost-mini {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 12rpx 24rpx;
  align-self: center;
  color: t.$color-text-mute;
  font-size: t.$font-sm;
}

.hint {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  text-align: center;
}
</style>
