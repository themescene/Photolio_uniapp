<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 联系客服（2026-07-17）
 *
 * 三条路径，优先级从上到下：
 * 1. 官方客服会话 `<button open-type="contact">` —— 直接在小程序内开客服聊天；
 *    需要在小程序管理后台「客服 → 客服人员」里配好客服人员账号。
 *    **仅 mp-weixin**：2026-09-14 起用 #ifdef 包住 —— H5 上没有微信客服会话，
 *    点了会报错（用户实测），整块不渲染
 * 2. 微信号 textarea 长按复制 —— 用户复制 `Theme_Scene` 后手动加好友
 * 3. 客服二维码 image 长按识别 —— 微信原生「识别图中二维码 → 添加朋友」
 *
 * 剪贴板 pitfall：mp-weixin 模拟器上 uni.setClipboardData 会静默失败，
 * 所以主兜底是让用户长按 textarea 弹系统菜单，不是靠按钮 setClipboardData。
 * 详见 CLAUDE.md 的「剪贴板 / 长文本复制」pitfall。
 */
import { SUPPORT_WECHAT_ID, SUPPORT_QR_LOCAL } from "@/config/env";

function copyWechat() {
  // setClipboardData 自 2.32.3 起是隐私接口，需前置 wx.requirePrivacyAuthorize（errno 112）
  // #ifdef MP-WEIXIN
  const doCopy = () => wx.setClipboardData({
    data: SUPPORT_WECHAT_ID,
    fail: () => uni.showToast({ title: "复制失败，请长按下方微信号手动复制", icon: "none", duration: 2500 }),
  });
  const req = (wx as unknown as { requirePrivacyAuthorize?: (o: {
    success?: () => void;
    fail?: (err: unknown) => void;
  }) => void }).requirePrivacyAuthorize;
  if (typeof req === "function") {
    req({
      success: doCopy,
      fail: () => uni.showToast({ title: "需先同意隐私协议才能复制", icon: "none", duration: 2500 }),
    });
  } else {
    doCopy();
  }
  // #endif
  // #ifdef H5
  uni.setClipboardData({ data: SUPPORT_WECHAT_ID });
  // #endif
}

function saveQR() {
  // 先把 static path 转成小程序本地 path 才能存相册
  uni.getImageInfo({
    src: SUPPORT_QR_LOCAL,
    success: (info) => {
      uni.saveImageToPhotosAlbum({
        filePath: info.path,
        success: () => uni.showToast({ title: "已保存到相册，可用微信扫一扫识别", icon: "none", duration: 2500 }),
        fail: (err) => {
          const msg = /auth|permission/i.test(err.errMsg || "") ? "未授权保存到相册，可长按图片识别" : "保存失败，可长按图片识别";
          uni.showToast({ title: msg, icon: "none", duration: 2500 });
        },
      });
    },
    fail: () => uni.showToast({ title: "长按二维码识别添加", icon: "none", duration: 2500 }),
  });
}
import H5BackFab from "@/components/H5BackFab.vue";
</script>

<template>
  <H5BackFab />
  <view class="page">
    <view class="hero">
      <text class="hero-title">{{ uiText("联系画匣子客服") }}</text>
      <text class="hero-sub">{{ uiText("遇到扩容、账号、内容问题都可以直接找我们") }}</text>
    </view>

    <!-- 官方客服会话：`open-type="contact"` 是**微信小程序专有能力**。
         2026-09-14：H5 上这个按钮点了会报错（浏览器里没有微信客服会话），
         用户明确要求去掉。用条件编译只在 mp-weixin 保留。 -->
    <!-- #ifdef MP-WEIXIN -->
    <view class="card">
      <text class="card-title">{{ uiText("在小程序里咨询") }}</text>
      <text class="card-hint">{{ uiText("推荐路径。点击下方按钮直接和客服开始会话，无需加好友。") }}</text>
      <button class="btn btn-primary" open-type="contact">
        <text>{{ uiText("打开客服会话") }}</text>
      </button>
    </view>
    <!-- #endif -->

    <!-- 兜底：加微信 -->
    <view class="card">
      <text class="card-title">{{ uiText("或添加客服微信") }}</text>
      <text class="card-hint">{{ uiText("长按下方微信号复制，或长按二维码识别添加朋友。") }}</text>

      <view class="wechat-row">
        <text class="wechat-label">{{ uiText("微信号") }}</text>
        <!-- textarea 是 mp-weixin 里长按复制最稳的方式（对齐 CLAUDE.md 剪贴板 pitfall） -->
        <textarea
          class="wechat-textarea"
          :value="SUPPORT_WECHAT_ID"
          auto-height
          disable-default-padding
          :show-confirm-bar="false"
        />
        <view class="btn btn-ghost btn-sm" @click="copyWechat">
          <text>{{ uiText("复制") }}</text>
        </view>
      </view>

      <view class="qr-wrap" @click="saveQR">
        <image class="qr" :src="SUPPORT_QR_LOCAL" mode="aspectFit" show-menu-by-longpress />
        <text class="qr-hint">{{ uiText("长按图片识别 · 或点击图片保存到相册") }}</text>
      </view>
    </view>

    <view class="tips">
      <text class="tips-title">{{ uiText("你可能想问") }}</text>
      <!-- #ifdef MP-WEIXIN -->
      <text class="tips-line">{{ uiText("· 兑换码用后没生效 → 打开客服会话把兑换码发给我们，会立刻手动补") }}</text>
      <!-- #endif -->
      <!-- #ifndef MP-WEIXIN -->
      <text class="tips-line">{{ uiText("· 兑换码用后没生效 → 加上面的客服微信，把兑换码发给我们，会立刻手动补") }}</text>
      <!-- #endif -->
      <text class="tips-line">{{ uiText("· 3 年后过期的文件想找回 → 我们已冷备份，联系客服提供 share id 即可申请恢复") }}</text>
      <text class="tips-line">{{ uiText("· 商家批量采购扩容包 / 定制物料 → 直接加微信详谈") }}</text>
    </view>
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

.card, .tips {
  padding: t.$spacing-5;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  display: flex; flex-direction: column; gap: t.$spacing-3;
}
.card-title { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.card-hint { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.6; }

.btn {
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  text-align: center;
  font-size: t.$font-md;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-ghost { background: t.$color-surface; color: t.$color-text; border: 1rpx solid t.$color-border; }
.btn-sm { height: 64rpx; line-height: 64rpx; font-size: t.$font-sm; padding: 0 t.$spacing-4; align-self: flex-end; }

.wechat-row { display: flex; flex-direction: column; gap: t.$spacing-2; }
.wechat-label { font-size: t.$font-xs; color: t.$color-text-soft; }
.wechat-textarea {
  min-height: 64rpx;
  padding: t.$spacing-3;
  background: t.$color-surface-2;
  border: 1rpx solid t.$color-border;
  border-radius: t.$radius-md;
  font-size: t.$font-md;
  color: t.$color-text;
  font-family: monospace;
  line-height: 1.4;
}

.qr-wrap {
  margin-top: t.$spacing-3;
  display: flex; flex-direction: column; align-items: center; gap: t.$spacing-2;
  padding: t.$spacing-3;
  background: #ffffff;
  border-radius: t.$radius-card;
  border: 1rpx dashed t.$color-border;
}
.qr { width: 400rpx; height: 400rpx; }
.qr-hint { font-size: t.$font-xs; color: t.$color-text-mute; }

.tips-title { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text-soft; }
.tips-line { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.7; }
</style>
