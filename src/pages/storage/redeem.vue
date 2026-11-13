<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 兑换扩容包（2026-07-17）
 *
 * 进入路径：
 * 1. 二维码承载页 URL Link → 小程序 /pages/storage/redeem?code=xxx（App.vue 已分流）
 * 2. 「我的 → 存储空间 → 兑换扩容包」按钮
 * 3. 「账号设置 → 兑换码」历史入口也会走这里的 previewBoost + redeemStorage 双 API
 *
 * 流程：
 *  1) 页面 onLoad 读 query.code；有则 preview + 显示"确认充值"
 *  2) 无 code 或用户手输 → previewBoost；命中显示详情
 *  3) 确认 → redeemStorage → 成功后刷新 auth 用户数据 → 跳存储详情
 */
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { previewBoost, redeemStorage } from "@/api/storage";
import { useAuthStore } from "@/stores/auth";
import { ApiError } from "@/api/request";
import type { StorageBoostPreview } from "@/types";
import { logger } from "@/utils/logger";

const auth = useAuthStore();

const inputCode = ref("");
const preview = ref<StorageBoostPreview | null>(null);
const previewing = ref(false);
const redeeming = ref(false);
const errorMsg = ref("");
const successPayload = ref<{ note: string; bytes: number } | null>(null);

const codeInvalidReason = computed(() => {
  if (preview.value?.is_redeemed) return "该兑换码已被使用";
  return "";
});

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function doPreview() {
  errorMsg.value = "";
  const code = inputCode.value.trim();
  if (!code) {
    errorMsg.value = "请输入兑换码";
    return;
  }
  previewing.value = true;
  try {
    preview.value = await previewBoost(code);
    logger.info("[redeem] preview ok", preview.value);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "兑换码无效";
    preview.value = null;
    errorMsg.value = msg;
  } finally {
    previewing.value = false;
  }
}

async function doRedeem() {
  if (!preview.value || preview.value.is_redeemed) return;
  if (!auth.isLoggedIn) {
    uni.showModal({
      title: "请先登录",
      content: "登录后才能把扩容包充值到你的账号里",
      confirmText: "去登录",
      success: (r) => { if (r.confirm) uni.navigateTo({ url: "/pages/auth/login" }); },
    });
    return;
  }
  errorMsg.value = "";
  redeeming.value = true;
  try {
    const res = await redeemStorage(preview.value.code);
    logger.info("[redeem] success", res);
    // 拉最新 /me 让「我的」和顶部 CTA 立刻显示新总额
    await auth.refreshMe();
    successPayload.value = {
      note: preview.value.note || "扩容包",
      bytes: res.grant?.bytes ?? preview.value.capacity_bytes,
    };
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "兑换失败，请稍后重试";
    errorMsg.value = msg;
  } finally {
    redeeming.value = false;
  }
}

function gotoStorage() {
  uni.redirectTo({ url: "/pages/storage/index" });
}
function gotoSupport() {
  uni.navigateTo({ url: "/pages/my/support" });
}

onLoad((query) => {
  const code = (query?.code as string | undefined)?.trim();
  if (code) {
    inputCode.value = code;
    doPreview();
  }
});
import H5BackFab from "@/components/H5BackFab.vue";
</script>

<template>
  <H5BackFab />
  <view class="page">
    <!-- 成功态：兑换成功 -->
    <view v-if="successPayload" class="success-card">
      <text class="success-title">{{ uiText("兑换成功") }}</text>
      <text class="success-bytes">+{{ fmt(successPayload.bytes) }}</text>
      <text class="success-note">{{ successPayload.note }} {{ uiText("已加入你的存储池") }}</text>
      <view class="actions">
        <view class="btn btn-primary" @click="gotoStorage">
          <text>{{ uiText("查看我的存储空间") }}</text>
        </view>
      </view>
    </view>

    <!-- 正常态：输入 / 预览 / 确认 -->
    <template v-else>
      <view class="hero">
        <text class="hero-title">{{ uiText("兑换扩容包") }}</text>
        <text class="hero-sub">{{ uiText("扫码或粘贴兑换码，把额外容量加入你的账号") }}</text>
      </view>

      <view class="input-card">
        <text class="label">{{ uiText("兑换码") }}</text>
        <input
          v-model="inputCode"
          class="input"
          :placeholder='uiText("请输入或粘贴兑换码")'
          :disabled="previewing || redeeming"
          @confirm="doPreview"
        />
        <view v-if="!preview" class="btn btn-primary" :class="{ disabled: previewing }" @click="doPreview">
          <text>{{ previewing ? uiText("正在查询…") : uiText("查询") }}</text>
        </view>
      </view>

      <view v-if="preview" class="preview-card">
        <view class="preview-row">
          <text class="preview-key">{{ uiText("扩容容量") }}</text>
          <text class="preview-value">{{ fmt(preview.capacity_bytes) }}</text>
        </view>
        <view v-if="preview.note" class="preview-row">
          <text class="preview-key">{{ uiText("说明") }}</text>
          <text class="preview-value">{{ preview.note }}</text>
        </view>
        <view class="preview-row">
          <text class="preview-key">{{ uiText("有效期") }}</text>
          <text class="preview-value">{{ uiText("永久（加入即成为账号池）") }}</text>
        </view>

        <text v-if="codeInvalidReason" class="warn">{{ codeInvalidReason }}</text>

        <view class="actions">
          <view
            class="btn btn-primary"
            :class="{ disabled: preview.is_redeemed || redeeming }"
            @click="doRedeem"
          >
            <text>{{ redeeming ? uiText("正在兑换…") : preview.is_redeemed ? uiText("已被使用") : uiText("确认兑换") }}</text>
          </view>
        </view>
      </view>

      <text v-if="errorMsg" class="error">{{ uiText(errorMsg) }}</text>

      <view class="help">
        <text class="help-title">{{ uiText("兑换码从哪来？") }}</text>
        <text class="help-line">{{ uiText("· 在网店 / 影楼门店购买的扩容卡上会附带一个小卡片，或印在包装的说明书里") }}</text>
        <text class="help-line">{{ uiText("· 微信「扫一扫」二维码可直接进入本页并自动填码") }}</text>
        <text class="help-line">{{ uiText("· 每张兑换码只能使用一次，用后作废；请勿多人转发") }}</text>
        <view class="btn btn-ghost" @click="gotoSupport"><text>{{ uiText("联系客服") }}</text></view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding: t.$spacing-5 t.$spacing-4;
  padding-bottom: calc(t.$spacing-8 + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: t.$spacing-4;
}

.hero { display: flex; flex-direction: column; gap: t.$spacing-1; }
.hero-title { font-size: t.$font-2xl; font-weight: t.$weight-bold; color: t.$color-text; }
.hero-sub { font-size: t.$font-sm; color: t.$color-text-soft; }

.input-card, .preview-card, .success-card, .help {
  padding: t.$spacing-5;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  display: flex; flex-direction: column; gap: t.$spacing-3;
}
.label { font-size: t.$font-xs; color: t.$color-text-soft; }
.input {
  height: 88rpx;
  padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  background: t.$color-surface-2;
  color: t.$color-text;
  font-size: t.$font-md;
  border: 1rpx solid t.$color-border;
}

.preview-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: t.$spacing-2 0;
  border-top: 1rpx solid t.$color-border;
  &:first-of-type { border-top: none; padding-top: 0; }
}
.preview-key { font-size: t.$font-sm; color: t.$color-text-soft; }
.preview-value { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text; }
.warn { font-size: t.$font-sm; color: #c66; margin-top: t.$spacing-2; }
.error { font-size: t.$font-sm; color: #c66; padding: 0 t.$spacing-4; }

.actions { display: flex; flex-direction: column; gap: t.$spacing-2; margin-top: t.$spacing-2; }
.btn {
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  text-align: center;
  font-size: t.$font-md;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-ghost { background: t.$color-surface; color: t.$color-text; border: 1rpx solid t.$color-border; }
.btn.disabled { opacity: 0.5; }

.success-card { align-items: center; text-align: center; }
.success-title { font-size: t.$font-xl; font-weight: t.$weight-bold; color: t.$color-text; }
.success-bytes { font-size: 96rpx; font-weight: t.$weight-bold; color: t.$color-accent; margin: t.$spacing-2 0; }
.success-note { font-size: t.$font-sm; color: t.$color-text-soft; }
.success-card .actions { width: 100%; }

.help-title { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text-soft; }
.help-line { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.7; }
</style>
