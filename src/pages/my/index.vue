<script setup lang="ts">
import LanguageSwitcher from "@/components/LanguageSwitcher.vue";
import { t as uiText } from "@/i18n";
/**
 * 我的 tab —— 用户中心。
 *
 * 内容：
 * - 顶部 hero：头像 + 昵称 + 用户名 + 已解锁特性标签
 * - 简略入口：账号设置（跳现有 settings 子页）/ 用户协议 / 隐私协议
 * - 退出登录
 * - 未登录态：仅显示登录 CTA
 *
 * 注意：详细的子流程（改昵称 / 设密码 / 兑换码 / 绑定旧账号）已经在 `pages/account/settings.vue`
 * 里实现得不错，本页只做入口，不再重复实现，避免 CLAUDE.md 强调的「重复 UI」反例。
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { onShow } from "@dcloudio/uni-app";
import { useAuthStore } from "@/stores/auth";
import { STATIC_BASE } from "@/config/env";
import AppRow from "@/components/AppRow.vue";
import CustomTabBar from "@/components/CustomTabBar.vue";

const auth = useAuthStore();
const { isLoggedIn, user, nickname } = storeToRefs(auth);

// 存储额度（2026-07-17 新模型）：字段来自 GET /auth/me → data.storage
// 参考 arbackend/storage_service.get_usage_summary
const storage = computed(() => {
  const s = user.value?.storage;
  if (!s || !s.total_bytes) return null;
  const percent = s.total_bytes > 0
    ? Math.min(100, Math.round((s.used_bytes / s.total_bytes) * 100))
    : 0;
  return {
    used: s.used_bytes,
    total: s.total_bytes,
    available: s.available_bytes,
    percent,
    expiringSoon: s.expiring_soon || [],
  };
});

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

function gotoStorage() {
  uni.navigateTo({ url: "/pages/storage/index" });
}
function gotoSupport() {
  uni.navigateTo({ url: "/pages/my/support" });
}

function gotoLogin() {
  uni.navigateTo({ url: "/pages/auth/login" });
}
function gotoSettings() {
  uni.navigateTo({ url: "/pages/account/settings" });
}
function gotoFriends() {
  uni.navigateTo({ url: "/pages/friends/index" });
}
function gotoLegal(kind: "privacy" | "terms") {
  uni.navigateTo({ url: `/pages/legal/${kind}` });
}

function resolveAvatar(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}

function onLogout() {
  uni.showModal({
    title: "退出登录",
    content: "退出后将不能查看 / 编辑你的画匣子，下次需要重新登录",
    success: (res) => {
      if (res.confirm) {
        auth.logout();
        uni.switchTab({ url: "/pages/index/index" });
      }
    },
  });
}

onShow(() => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 fallback */ }
  if (isLoggedIn.value) auth.refreshMe();
});
</script>

<template>
  <view class="page">
    <LanguageSwitcher />
    <!-- 未登录 -->
    <view v-if="!isLoggedIn" class="login-cta">
      <text class="cta-title">{{ uiText("登录后查看个人信息") }}</text>
      <button class="btn btn-primary" @click="gotoLogin">{{ uiText("立即登录") }}</button>
    </view>

    <!-- 已登录 -->
    <template v-else>
      <view class="hero">
        <image
          v-if="user?.avatar_url"
          class="avatar"
          :src="resolveAvatar(user.avatar_url)"
          mode="aspectFill"
        />
        <view v-else class="avatar avatar-placeholder">
          <text>{{ (nickname || uiText("匣"))[0] }}</text>
        </view>

        <view class="info">
          <text class="nick">{{ nickname || uiText("匣子用户") }}</text>
          <text class="username">@ {{ user?.username }}</text>
          <view v-if="user?.entitlements?.length" class="tags">
            <text v-for="ent in user.entitlements" :key="ent" class="tag">{{ ent }}</text>
          </view>
        </view>
      </view>

      <!-- 存储空间 —— 来自 /auth/me 的 data.storage（grant 池 + 3 年 record TTL 模型）
           每次上传扣一份，record 3 年后过期把容量还回池；grant 本身不过期。
           详情 / 兑换扩容 / 到期提示都在 /pages/storage/index -->
      <view v-if="storage" class="quota-card" @click="gotoStorage">
        <view class="quota-head">
          <text class="quota-label">{{ uiText("存储空间") }}</text>
          <text class="quota-value">{{ formatBytes(storage.used) }} / {{ formatBytes(storage.total) }}</text>
        </view>
        <view class="quota-bar">
          <view class="quota-fill" :style="{ width: `${storage.percent}%` }" />
        </view>
        <view class="quota-foot">
          <text class="quota-hint">{{ uiText("剩余") }} {{ formatBytes(storage.available) }} {{ uiText("· 兑换扩容包 →") }}</text>
          <text v-if="storage.expiringSoon.length" class="quota-warn">
            {{ storage.expiringSoon.length }} {{ uiText("份即将过期") }}
          </text>
        </view>
      </view>

      <view class="group">
        <AppRow :label='uiText("好友")' @click="gotoFriends" />
        <!-- 2026-09-15 v5：去重 —— 上方 .quota-card 已经是"存储空间"入口，这里再放
             AppRow "存储空间 >" 用户视觉重复。用户明确抱怨"俩存储空间 tab 重复了"。 -->
        <AppRow :label='uiText("联系客服")' @click="gotoSupport" />
        <AppRow :label='uiText("账号设置")' @click="gotoSettings" />
      </view>

      <view class="group">
        <AppRow :label='uiText("用户协议")' @click="gotoLegal('terms')" />
        <AppRow :label='uiText("隐私协议")' @click="gotoLegal('privacy')" />
      </view>

      <view class="group">
        <AppRow :label='uiText("退出登录")' tone="danger" :arrow="false" @click="onLogout" />
      </view>
    </template>

    <CustomTabBar active="profile" />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
}

// ---- 未登录 ----
.login-cta {
  padding: t.$spacing-8 t.$spacing-4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$spacing-5;
  .cta-title {
    font-size: t.$font-md;
    color: t.$color-text-soft;
  }
}
.btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: t.$radius-pill;
  padding: 0 t.$spacing-6;
  font-size: t.$font-md;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }

// ---- 已登录 hero ----
.hero {
  display: flex;
  align-items: center;
  gap: t.$spacing-4;
  padding: t.$spacing-5 t.$spacing-4;
}
.avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: t.$color-surface-2;
  flex-shrink: 0;
}
.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: t.$font-2xl;
  font-weight: t.$weight-bold;
  color: t.$color-text-mute;
}

.info {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-1;
  min-width: 0;
  flex: 1;
}
.nick {
  font-size: t.$font-xl;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.username {
  font-size: t.$font-sm;
  color: t.$color-text-mute;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: t.$spacing-1;
  margin-top: t.$spacing-1;
}
.tag {
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-xs;
  border-radius: t.$radius-pill;
  padding: 4rpx t.$spacing-3;
}

// ---- 分组列表 ----
.group {
  margin: t.$spacing-3 t.$spacing-3;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  overflow: hidden;
}

// ---- 配额卡 ----
.quota-card {
  margin: t.$spacing-3 t.$spacing-3;
  padding: t.$spacing-4;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
}
.quota-head {
  display: flex; align-items: center; justify-content: space-between;
}
.quota-label {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
}
.quota-value {
  font-size: t.$font-sm;
  color: t.$color-text;
  font-weight: t.$weight-bold;
}
.quota-bar {
  height: 12rpx;
  background: t.$color-border;
  border-radius: 999rpx;
  overflow: hidden;
}
.quota-fill {
  height: 100%;
  background: t.$color-accent;
  border-radius: 999rpx;
  transition: width 0.3s;
}
.quota-hint {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}
.quota-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: t.$spacing-2;
}
.quota-warn {
  font-size: t.$font-xs;
  color: #C4A882;
  font-weight: t.$weight-bold;
}
</style>
