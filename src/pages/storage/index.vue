<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 存储空间详情页（2026-07-17）
 *
 * 内容：
 * - 顶部：总容量 / 已用 / 剩余（进度条）
 * - grants 列表：每份授予的来源、容量、发放日
 * - 即将过期 records：给用户提前提醒可以下载备份
 * - CTA：兑换扩容包（跳 /pages/storage/redeem）+ 联系客服
 *
 * 数据来源：GET /api/storage/usage
 */
import { ref, computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { getStorageUsage } from "@/api/storage";
import type { StorageUsageSummary } from "@/types";
import { logger } from "@/utils/logger";
import { ApiError } from "@/api/request";
import H5BackFab from "@/components/H5BackFab.vue";

const summary = ref<StorageUsageSummary | null>(null);
const loading = ref(false);
const errorMsg = ref("");

const percent = computed(() => {
  const s = summary.value;
  if (!s || !s.total_bytes) return 0;
  return Math.min(100, Math.round((s.used_bytes / s.total_bytes) * 100));
});

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function grantLabel(g: StorageUsageSummary["grants"][number]): string {
  if (g.source === "signup") return "初始额度";
  if (g.source.startsWith("boost:")) return "扩容包";
  return "手动发放";
}

async function load() {
  loading.value = true;
  errorMsg.value = "";
  try {
    summary.value = await getStorageUsage();
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "加载失败，请稍后重试";
    errorMsg.value = msg;
    logger.warn("[storage/index] load failed", e);
  } finally {
    loading.value = false;
  }
}

function gotoRedeem() {
  uni.navigateTo({ url: "/pages/storage/redeem" });
}
function gotoSupport() {
  uni.navigateTo({ url: "/pages/my/support" });
}

onShow(() => { load(); });
</script>

<template>
  <H5BackFab />
  <view class="page">
    <view v-if="loading && !summary" class="loading">
      <text>{{ uiText("正在加载存储详情…") }}</text>
    </view>

    <template v-else-if="summary">
      <view class="card">
        <view class="head">
          <text class="title">{{ uiText("已用空间") }}</text>
          <text class="value">{{ fmt(summary.used_bytes) }} / {{ fmt(summary.total_bytes) }}</text>
        </view>
        <view class="bar">
          <view class="fill" :style="{ width: `${percent}%` }" />
        </view>
        <view class="foot">
          <text class="hint">{{ uiText("剩余可用") }} {{ fmt(summary.available_bytes) }}</text>
          <text class="hint">{{ uiText("每份上传占用") }} {{ summary.record_ttl_days }} {{ uiText("天") }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">{{ uiText("额度构成") }}</text>
        <view v-for="g in summary.grants" :key="g.grant_id" class="row">
          <view class="row-main">
            <text class="row-title">{{ g.note || grantLabel(g) }}</text>
            <text class="row-sub">{{ uiText("获得于") }} {{ fmtDate(g.granted_at) }}</text>
          </view>
          <text class="row-value">{{ fmt(g.bytes) }}</text>
        </view>
      </view>

      <view v-if="summary.expiring_soon.length" class="section">
        <text class="section-title">{{ uiText("即将过期") }}</text>
        <text class="section-hint">{{ uiText("这些上传即将超过") }} {{ summary.record_ttl_days }} {{ uiText("天有效期。过期后容量会自动回到额度池；如需保留原始文件，请提前下载备份。") }}</text>
        <view v-for="r in summary.expiring_soon" :key="r.record_id" class="row">
          <view class="row-main">
            <text class="row-title">{{ r.file_type === 'video' ? uiText("视频") : r.file_type === 'audio' ? uiText("音频") : r.file_type === 'file' ? uiText("文件") : uiText("图片") }} · {{ fmt(r.bytes_size) }}</text>
            <text class="row-sub">{{ fmtDate(r.expires_at) }} {{ uiText("到期") }}</text>
          </view>
        </view>
      </view>

      <view class="actions">
        <view class="btn btn-primary" @click="gotoRedeem">
          <text>{{ uiText("兑换扩容包") }}</text>
        </view>
        <view class="btn btn-ghost" @click="gotoSupport">
          <text>{{ uiText("联系客服") }}</text>
        </view>
      </view>

      <view class="explainer">
        <text class="explainer-title">{{ uiText("存储规则") }}</text>
        <text class="explainer-line">{{ uiText("· 免费送 150MB 初始额度") }}</text>
        <text class="explainer-line">{{ uiText("· 扩容包永不过期，一次充值持续在你的账号池里") }}</text>
        <text class="explainer-line">{{ uiText("· 每份上传的文件占用 3 年容量，之后自动回池") }}</text>
        <text class="explainer-line">{{ uiText("· 过期的原始文件我们会另做冷备份，如需下载请联系客服") }}</text>
      </view>
    </template>

    <view v-else class="empty">
      <text>{{ errorMsg || uiText("无法加载存储信息") }}</text>
      <view class="btn btn-ghost" @click="load"><text>{{ uiText("重试") }}</text></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding: t.$spacing-4;
  padding-bottom: calc(t.$spacing-8 + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: t.$spacing-4;
}

.loading, .empty {
  padding: t.$spacing-8;
  text-align: center;
  color: t.$color-text-mute;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-4;
  align-items: center;
}

.card {
  padding: t.$spacing-5;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  display: flex; flex-direction: column; gap: t.$spacing-3;
}
.head { display:flex; align-items:center; justify-content: space-between; }
.title { font-size: t.$font-md; color: t.$color-text-soft; }
.value { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.bar { height: 16rpx; border-radius: 999rpx; background: t.$color-border; overflow: hidden; }
.fill { height:100%; background: t.$color-accent; border-radius: 999rpx; transition: width 0.3s; }
.foot { display:flex; justify-content: space-between; }
.hint { font-size: t.$font-xs; color: t.$color-text-mute; }

.section {
  padding: t.$spacing-4;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  display: flex; flex-direction: column; gap: t.$spacing-2;
}
.section-title { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.section-hint { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.5; margin-bottom: t.$spacing-2; }
.row {
  display: flex; align-items: center; justify-content: space-between;
  padding: t.$spacing-2 0;
  border-top: 1rpx solid t.$color-border;
  &:first-of-type { border-top: none; }
}
.row-main { display:flex; flex-direction: column; gap: 4rpx; min-width:0; flex:1; }
.row-title { font-size: t.$font-sm; color: t.$color-text; }
.row-sub { font-size: t.$font-xs; color: t.$color-text-mute; }
.row-value { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text; }

.actions {
  display: flex; flex-direction: column; gap: t.$spacing-2;
  margin-top: t.$spacing-2;
}
.btn {
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill;
  text-align: center;
  font-size: t.$font-md;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-ghost { background: t.$color-surface; color: t.$color-text; border: 1rpx solid t.$color-border; }

.explainer {
  padding: t.$spacing-4;
  background: t.$color-surface-2;
  border-radius: t.$radius-card;
  display: flex; flex-direction: column; gap: t.$spacing-1;
}
.explainer-title { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text-soft; }
.explainer-line { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.6; }
</style>
