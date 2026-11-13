<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 扩容包批量生成 · 商家印刷物料工具（2026-07-17 v2 定稿）
 *
 * 门禁：entitlement=preset_links（与 NFC 烧卡助手同一权限）
 *
 * 工作流（对齐 nfc-burn 的极简模式）：
 *  1) 选档位 pill（1/3/5/10GB）+ 数量 → 生成
 *  2) 每张扩容包一张卡片，包含：
 *     - 头部：容量 + 生成时间
 *     - 中心：内嵌 QR PNG（来自 backend /api/qr?text=<URL>）
 *              长按 QR → 微信弹「保存图片」/「识别二维码」菜单
 *     - 一个复制按钮：复制 URL（`https://hxiazi.com/s/<code>` 印刷用）
 *  3) 底部历史列表（带「已兑换/未兑换」badge）
 *
 * 与 v1 的差异：
 *  - 去掉「复制 code」按钮：商家印在物料上的只有 URL，code 是内部字段无用户可见性
 *  - 去掉「导出 CSV」：批量物料交给二维码本身承载（长按保存到相册即可批量收集）
 *  - 加 5GB / 10GB 档位（对齐用户 2026-07-17 补充）
 */
import { ref, computed } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { createBoostBatch, listMyBoosts } from "@/api/storage";
import type { StorageBoost } from "@/types";
import { STATIC_BASE, STORAGE_BOOST_TIERS, qrImageUrl } from "@/config/env";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
// #ifdef H5
import { exportAsPdf, exportAsZip } from "./storage-boost-export";
// #endif

const auth = useAuthStore();
const { user } = storeToRefs(auth);

const hasEntitlement = computed(() =>
  (user.value?.entitlements || []).includes("preset_links"),
);

const tierIdx = ref(0);
const count = ref(1);
const label = ref("");
const generating = ref(false);
const errMsg = ref("");
const newlyCreated = ref<StorageBoost[]>([]);

const history = ref<StorageBoost[]>([]);
const historyLoading = ref(false);

function fmt(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(0)}GB`;
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return iso.slice(0, 10); }
}
function shareUrl(code: string): string {
  return `${STATIC_BASE}/s/${code}`;
}

async function doGenerate() {
  if (!hasEntitlement.value) return;
  const t = STORAGE_BOOST_TIERS[tierIdx.value];
  const cnt = Math.max(1, Math.min(500, count.value | 0));
  errMsg.value = "";
  generating.value = true;
  try {
    const r = await createBoostBatch({
      capacity_bytes: t.bytes,
      count: cnt,
      label: label.value.trim() || undefined,
      note: `${t.label} 扩容包`,
    });
    logger.info("[dev/boost] created batch", r.count);
    newlyCreated.value = r.boosts;
    await loadHistory();
  } catch (e) {
    errMsg.value = e instanceof ApiError ? e.message : "生成失败";
  } finally {
    generating.value = false;
  }
}

async function loadHistory() {
  historyLoading.value = true;
  try {
    const r = await listMyBoosts();
    history.value = r.boosts;
  } catch (e) {
    logger.warn("[dev/boost] loadHistory failed", e);
  } finally {
    historyLoading.value = false;
  }
}

// ============ 导出（H5 only）====================
// 契约：勾选 → 批量导出。两种档：单张 PNG 打包 zip / A4 12 宫格 PDF
// mp-weixin 不做（无法批量存相册，还不如登录 h5 版做印刷物料）
const selected = ref<Set<string>>(new Set());
function isSelected(code: string): boolean {
  return selected.value.has(code);
}
function toggleSelect(code: string) {
  const n = new Set(selected.value);
  if (n.has(code)) n.delete(code);
  else n.add(code);
  selected.value = n;
}
function selectAll() {
  selected.value = new Set(history.value.map((b) => b.code));
}
function selectNone() {
  selected.value = new Set();
}
// 勾选 12 * n 张（快选一整页 PDF 的量）
function selectFirstN(n: number) {
  selected.value = new Set(history.value.slice(0, n).map((b) => b.code));
}
const selectedBoosts = computed(() =>
  history.value.filter((b) => selected.value.has(b.code)),
);

// #ifdef H5
const exporting = ref(false);
const exportProgress = ref("");
async function doExportZip() {
  const list = selectedBoosts.value;
  if (!list.length) return;
  exporting.value = true;
  exportProgress.value = `导出 ZIP 0/${list.length}`;
  try {
    await exportAsZip(list, (done, total) => {
      exportProgress.value = `导出 ZIP ${done}/${total}`;
    });
    uni.showToast({ title: `已导出 ${list.length} 张 PNG`, icon: "success" });
  } catch (e) {
    logger.warn("[dev/boost] exportZip fail", e);
    uni.showToast({ title: "导出失败，看 Console", icon: "none" });
  } finally {
    exporting.value = false;
    exportProgress.value = "";
  }
}
async function doExportPdf() {
  const list = selectedBoosts.value;
  if (!list.length) return;
  exporting.value = true;
  const pages = Math.ceil(list.length / 12);
  exportProgress.value = `导出 PDF 0/${list.length}`;
  try {
    await exportAsPdf(list, (done, total) => {
      exportProgress.value = `导出 PDF ${done}/${total}`;
    });
    uni.showToast({ title: `已导出 ${pages} 页 PDF`, icon: "success" });
  } catch (e) {
    logger.warn("[dev/boost] exportPdf fail", e);
    uni.showToast({ title: "导出失败，看 Console", icon: "none" });
  } finally {
    exporting.value = false;
    exportProgress.value = "";
  }
}
// #endif

function copyUrl(url: string) {
  logger.info("[boost] copyUrl click", { len: url.length, head: url.slice(0, 40) });
  // #ifdef MP-WEIXIN
  copyWithPrivacy(url, "[boost]");
  // #endif
  // #ifdef H5
  uni.setClipboardData({ data: url });
  // #endif
}

// 微信 setClipboardData 自 2.32.3 起被纳入隐私接口 → 必须先过 requirePrivacyAuthorize
// 用户拒绝过 / 未同意隐私协议时 errno=112；此帮手把授权弹窗前置，通过后再复制
// #ifdef MP-WEIXIN
function copyWithPrivacy(data: string, tag: string) {
  const doCopy = () => {
    try {
      wx.setClipboardData({
        data,
        success: (res) => logger.info(`${tag} wx.setClipboardData success`, res),
        fail: (err) => {
          logger.warn(`${tag} wx.setClipboardData fail RAW`, JSON.stringify(err), err);
          uni.showToast({ title: "复制失败，请长按上方文本手动复制", icon: "none", duration: 3000 });
        },
      });
    } catch (e) {
      logger.warn(`${tag} wx.setClipboardData throw`, e);
      uni.showToast({ title: "复制异常，请长按上方文本", icon: "none", duration: 3000 });
    }
  };
  const req = (wx as unknown as { requirePrivacyAuthorize?: (o: {
    success?: () => void;
    fail?: (err: unknown) => void;
  }) => void }).requirePrivacyAuthorize;
  if (typeof req === "function") {
    req({
      success: doCopy,
      fail: (err) => {
        logger.warn(`${tag} requirePrivacyAuthorize fail`, err);
        uni.showToast({ title: "需先同意隐私协议才能复制", icon: "none", duration: 2500 });
      },
    });
  } else {
    doCopy();
  }
}
// #endif

onShow(() => {
  if (auth.isLoggedIn) loadHistory();
});
import H5BackFab from "@/components/H5BackFab.vue";
import SvgIcon from "@/components/SvgIcon.vue";
</script>

<template>
  <H5BackFab />
  <view class="page">
    <view v-if="!auth.isLoggedIn" class="empty">
      <text>{{ uiText("请先登录") }}</text>
    </view>
    <view v-else-if="!hasEntitlement" class="empty">
      <text class="empty-title">{{ uiText("未解锁") }}</text>
      <text class="empty-sub">{{ uiText("该工具仅对持有 preset_links 兑换码的用户开放") }}</text>
      <text class="empty-sub">{{ uiText("去「账号设置 → 兑换码」输入内部码后再来") }}</text>
    </view>
    <template v-else>
      <view class="intro">
        <text class="intro-title">{{ uiText("批量生成扩容包 · 印刷物料工具") }}</text>
        <text class="intro-sub">
          {{ uiText("选档位 + 数量 → 生成。每张卡片长按二维码可保存到相册，\r\n          批量收集后直接送印。用户扫码即扩容，一码一次性有效。") }}
        </text>
      </view>

      <!-- 生成面板 -->
      <view class="card">
        <text class="label">{{ uiText("档位") }}</text>
        <view class="pills">
          <view
            v-for="(t, i) in STORAGE_BOOST_TIERS"
            :key="t.label"
            class="pill"
            :class="{ active: tierIdx === i }"
            @click="tierIdx = i"
          ><text>{{ uiText(t.label) }}</text></view>
        </view>

        <view class="row-inline">
          <view class="row-item">
            <text class="label">{{ uiText("数量") }}</text>
            <input v-model.number="count" class="input" type="number" placeholder="1" />
          </view>
          <view class="row-item">
            <text class="label">{{ uiText("批次备注（选填）") }}</text>
            <input v-model="label" class="input" :placeholder='uiText("如 2026-07 张影楼")' />
          </view>
        </view>

        <text v-if="errMsg" class="err">{{ errMsg }}</text>
        <view class="btn btn-primary" :class="{ disabled: generating }" @tap="doGenerate">
          <text>{{ generating ? uiText("正在生成…") : uiText("生成") }}</text>
        </view>
      </view>

      <!-- #ifdef H5 -->
      <!-- 批量导出（独立 section 置顶；H5 only；勾选来自下方历史列表） -->
      <view v-if="history.length > 0" class="section export-section">
        <view class="between">
          <text class="section-title">{{ uiText("批量导出印刷物料") }}</text>
          <text class="export-hint">{{ uiText("已选") }} {{ selected.size }} / {{ history.length }}</text>
        </view>
        <text class="section-hint">
          {{ uiText("在下方「历史扩容包」勾选要导出的张数，或用下面的快选按钮。卡片只含容量 + 二维码，无日期无 URL。") }}
        </text>
        <view class="quick-btns">
          <text class="chip" @click="selectAll">{{ uiText("全选") }}</text>
          <text class="chip" @click="selectNone">{{ uiText("清空") }}</text>
          <text class="chip" @click="selectFirstN(12)">{{ uiText("前 12") }}</text>
          <text class="chip" @click="selectFirstN(24)">{{ uiText("前 24") }}</text>
          <text class="chip" @click="selectFirstN(48)">{{ uiText("前 48") }}</text>
        </view>
        <view class="export-actions">
          <view class="btn btn-export"
                :class="{ disabled: exporting || selected.size === 0 }"
                @tap="doExportPdf">
            <text>{{ exporting && exportProgress.includes('PDF')
                    ? exportProgress
                    : `A4 · 12/页 · 导出 PDF（${Math.ceil(selected.size / 12) || 0} 页）` }}</text>
          </view>
          <view class="btn btn-export btn-export-alt"
                :class="{ disabled: exporting || selected.size === 0 }"
                @tap="doExportZip">
            <text>{{ exporting && exportProgress.includes('ZIP')
                    ? exportProgress
                    : `单张 PNG · 打包 ZIP（${selected.size} 张）` }}</text>
          </view>
        </view>
      </view>
      <!-- #endif -->

      <!-- 本次结果 -->
      <view v-if="newlyCreated.length" class="section">
        <text class="section-title">{{ uiText("本次生成 ·") }} {{ newlyCreated.length }} {{ uiText("张") }}</text>
        <text class="section-hint">{{ uiText("长按二维码可保存到相册或识别；点击\"复制 URL\"可直接粘到二维码生成工具批量出图。") }}</text>

        <view v-for="b in newlyCreated" :key="b.code" class="boost-card">
          <view class="boost-head">
            <text class="boost-cap">{{ fmt(b.capacity_bytes) }} {{ uiText("扩容包") }}</text>
            <text class="boost-date">{{ fmtDate(b.created_at) }}</text>
          </view>

          <view class="qr-wrap">
            <image
              class="qr"
              :src="qrImageUrl(shareUrl(b.code), 480)"
              mode="widthFix"
              show-menu-by-longpress
            />
            <text class="qr-hint">{{ uiText("长按二维码可保存到相册") }}</text>
          </view>

          <!-- URL 明文（长按 textarea 弹「全选 / 复制」菜单是最稳的兜底路径） -->
          <textarea
            class="url-ta"
            :value="shareUrl(b.code)"
            auto-height
            disable-default-padding
            :show-confirm-bar="false"
            :adjust-position="false"
          />
          <text class="fallback-hint">{{ uiText("若下方按钮无效，长按上方 URL → 全选 → 复制") }}</text>
          <view class="btn btn-copy" @tap="copyUrl(shareUrl(b.code))">
            <text>{{ uiText("一键复制 URL") }}</text>
          </view>
        </view>
      </view>

      <!-- 历史 -->
      <view class="section">
        <view class="between">
          <text class="section-title">{{ uiText("历史扩容包 ·") }} {{ history.length }} {{ uiText("张") }}</text>
          <text class="refresh" @click="loadHistory">{{ uiText("刷新") }}</text>
        </view>
        <view v-if="historyLoading && history.length === 0" class="hint">{{ uiText("加载中…") }}</view>
        <view v-else-if="history.length === 0" class="hint">{{ uiText("暂无历史") }}</view>

        <view v-for="b in history" :key="b.code" class="hist-row">
          <!-- #ifdef H5 -->
          <view class="hist-check" @click="toggleSelect(b.code)">
            <view class="check-box" :class="{ on: isSelected(b.code) }">
              <SvgIcon v-if="isSelected(b.code)" name="check" size="28rpx" color="#ffffff" />
            </view>
          </view>
          <!-- #endif -->
          <view class="hist-main">
            <text class="hist-cap">{{ fmt(b.capacity_bytes) }} · {{ b.label || uiText("未标记") }}</text>
            <text class="hist-sub">{{ fmtDate(b.created_at) }}</text>
          </view>
          <text class="hist-badge" :class="{ used: b.is_redeemed }">
            {{ b.is_redeemed ? uiText("已兑换") : uiText("未兑换") }}
          </text>
        </view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding: t.$spacing-4;
  padding-bottom: calc(t.$spacing-8 + env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: t.$spacing-4;
}
.empty {
  padding: t.$spacing-8;
  text-align: center;
  color: t.$color-text-mute;
  display: flex; flex-direction: column; gap: t.$spacing-2; align-items: center;
}
.empty-title { font-size: 36rpx; font-weight: t.$weight-bold; color: t.$color-text; }
.empty-sub { font-size: t.$font-sm; color: t.$color-text-mute; line-height: 1.6; }

.intro { padding: 0 t.$spacing-1; display: flex; flex-direction: column; gap: t.$spacing-1; }
.intro-title { font-size: t.$font-xl; font-weight: t.$weight-bold; color: t.$color-text; }
.intro-sub { font-size: t.$font-xs; color: t.$color-text-soft; line-height: 1.6; }

.card, .section {
  padding: t.$spacing-4;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  box-shadow: t.$shadow-soft;
  display: flex; flex-direction: column; gap: t.$spacing-3;
}
.section-title { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.section-hint { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.5; margin-bottom: t.$spacing-2; }
.between { display: flex; align-items: center; justify-content: space-between; }
.refresh { font-size: t.$font-sm; color: t.$color-accent; }
.hint { font-size: t.$font-xs; color: t.$color-text-mute; }
.err { font-size: t.$font-sm; color: #c66; }

.label { font-size: t.$font-xs; color: t.$color-text-soft; display: block; margin-bottom: 8rpx; }
.input {
  height: 80rpx; padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  background: t.$color-surface-2;
  border: 1rpx solid t.$color-border;
  color: t.$color-text;
  font-size: t.$font-md;
  width: 100%;
  box-sizing: border-box;
}
.row-inline { display: flex; gap: t.$spacing-3; }
.row-item { flex: 1; min-width: 0; }

.pills { display: flex; gap: t.$spacing-2; flex-wrap: wrap; }
.pill {
  padding: t.$spacing-1 t.$spacing-4;
  border-radius: t.$radius-pill;
  background: t.$color-surface-2;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  border: 1rpx solid t.$color-border;
}
.pill.active { background: t.$color-accent; color: t.$color-text-invert; border-color: t.$color-accent; }

.btn {
  height: 88rpx; line-height: 88rpx;
  border-radius: t.$radius-pill; text-align: center; font-size: t.$font-md;
  box-sizing: border-box;
  &.disabled { opacity: 0.5; }
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-copy { background: #3D2E1F; color: #ffffff; margin-top: t.$spacing-1; }
.fallback-hint {
  display: block;
  text-align: center;
  font-size: 22rpx;
  color: t.$color-text-mute;
  margin-top: t.$spacing-1;
}

.boost-card {
  padding: t.$spacing-4;
  background: t.$color-surface-2;
  border-radius: t.$radius-md;
  display: flex; flex-direction: column; gap: t.$spacing-3;
}
.boost-head { display: flex; justify-content: space-between; align-items: center; }
.boost-cap { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.boost-date { font-size: t.$font-xs; color: t.$color-text-mute; }

.qr-wrap {
  display: flex; flex-direction: column; align-items: center; gap: t.$spacing-2;
  padding: t.$spacing-3;
  background: #ffffff;
  border-radius: t.$radius-md;
}
.qr { width: 480rpx; }
.qr-hint { font-size: t.$font-xs; color: t.$color-text-mute; }

.url-ta {
  padding: t.$spacing-3;
  background: #ffffff;
  border: 1rpx dashed t.$color-border;
  border-radius: t.$radius-sm;
  font-size: 24rpx;
  color: t.$color-text;
  line-height: 1.5;
  font-family: monospace;
  word-break: break-all;
  box-sizing: border-box;
}

.hist-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: t.$spacing-2 0;
  border-top: 1rpx solid t.$color-border;
  &:first-of-type { border-top: none; padding-top: 0; }
}
.hist-main { display: flex; flex-direction: column; gap: 4rpx; }
.hist-cap { font-size: t.$font-sm; color: t.$color-text; }
.hist-sub { font-size: t.$font-xs; color: t.$color-text-mute; }
.hist-badge {
  padding: 4rpx t.$spacing-2;
  border-radius: t.$radius-pill;
  background: t.$color-surface-2;
  color: t.$color-text-mute;
  font-size: t.$font-xs;
}
.hist-badge.used { background: t.$color-accent; color: t.$color-text-invert; }

/* ===== 导出 section & 勾选（H5 only） ===== */
.export-section {
  border: 2rpx solid t.$color-accent;
}
.export-hint {
  font-size: t.$font-xs;
  color: t.$color-text-soft;
}
.quick-btns { display: flex; flex-wrap: wrap; gap: t.$spacing-1; }
.chip {
  padding: 6rpx t.$spacing-2;
  border-radius: t.$radius-pill;
  background: t.$color-surface;
  color: t.$color-text-soft;
  font-size: t.$font-xs;
  border: 1rpx solid t.$color-border;
}
.export-actions { display: flex; flex-direction: column; gap: t.$spacing-2; }
.btn-export {
  background: #3D2E1F;
  color: #ffffff;
  font-size: t.$font-sm;
  height: 80rpx; line-height: 80rpx;
}
.btn-export-alt {
  background: t.$color-surface;
  color: t.$color-text;
  border: 1rpx solid t.$color-border;
}

.hist-check {
  padding-right: t.$spacing-2;
  display: flex; align-items: center;
}
.check-box {
  width: 40rpx; height: 40rpx;
  border-radius: t.$radius-sm;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
  box-sizing: border-box;
}
.check-box.on {
  background: t.$color-accent;
  border-color: t.$color-accent;
}
</style>
