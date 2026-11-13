<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * NFC「修改匣子内容」— 全屏瀑布流页
 *
 * 2026-07-13 用户明确要求：从 nfc/index.vue 里的折叠项抽出来变成独立页面，
 * 用小红书样式的双列瀑布流展示"你绑过的所有 NFC 卡"，图片随便取一张预览图。
 * 点击卡片 → 跳到 landing 页解析 UID → 走通用的修改流程
 *
 * 数据源：
 *   - 本地 storage NFC_HISTORY（landing.vue 每次解析都会写）
 *   - 对每张卡，如果 bound_type='share'，并行调 fetchShare 拉封面
 */
import { ref, computed, onMounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { STORAGE_KEYS, STATIC_BASE } from "@/config/env";
import { fetchShare } from "@/api/share";
import * as nfcApi from "@/api/nfc";
import { ApiError } from "@/api/request";
import { setPending } from "@/utils/media";
import SvgIcon from "@/components/SvgIcon.vue";
import MasonryFeed, { type MasonryItem } from "@/components/MasonryFeed.vue";
import { logger } from "@/utils/logger";

interface NfcHistItem {
  uid: string;
  bound_type?: "share" | "couplet" | "nfc" | null;
  bound_share_id?: string | null;
  bound_url?: string | null;
  title?: string | null;
  nfc_media_type?: string | null;
}

const nfcHistory = ref<NfcHistItem[]>([]);
const shareCoverCache = ref<Record<string, { cover: string; title: string; share_type?: string }>>({});
const loadingResolve = ref(false);

function _loadLocal() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEYS.NFC_HISTORY);
    const arr: NfcHistItem[] = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    nfcHistory.value = arr.slice(0, 60);
  } catch {
    nfcHistory.value = [];
  }
}

async function _resolveCovers() {
  const targets = nfcHistory.value.filter(
    (h) => h.bound_type === "share" && h.bound_share_id && !shareCoverCache.value[h.bound_share_id],
  );
  if (targets.length === 0) return;
  loadingResolve.value = true;
  await Promise.all(
    targets.map(async (h) => {
      const sid = h.bound_share_id!;
      try {
        const d = await fetchShare(sid);
        const cover = (d as { cover_image?: string; report?: { episodes?: unknown[]; report_title?: string }; share_type?: string })?.cover_image
          || (d as { report?: { episodes?: Array<{ images?: Array<{ thumbnail_url?: string; image_url?: string }> }> } })
              ?.report?.episodes?.[0]?.images?.[0]?.thumbnail_url
          || (d as { report?: { episodes?: Array<{ images?: Array<{ image_url?: string }> }> } })
              ?.report?.episodes?.[0]?.images?.[0]?.image_url
          || "";
        shareCoverCache.value[sid] = {
          cover,
          title: (d as { report?: { report_title?: string } })?.report?.report_title || "未命名",
          share_type: (d as { share_type?: string })?.share_type,
        };
      } catch (e) {
        logger.info("[nfc/history] resolve share failed", { sid, e });
        shareCoverCache.value[sid] = { cover: "", title: "已删除或无权访问" };
      }
    }),
  );
  loadingResolve.value = false;
}

onMounted(() => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 */ }
  _loadLocal();
  _resolveCovers();
});
onShow(() => {
  _loadLocal();
  _resolveCovers();
});

function _resolveUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${STATIC_BASE}${url}`;
  return url;
}

const masonryItems = computed<MasonryItem[]>(() =>
  nfcHistory.value.map((h) => {
    const tail = h.uid ? h.uid.slice(-4) : "";
    let cover = "";
    let title = h.title || "";
    let badge = `UID …${tail}`;
    let badgeTone: MasonryItem["badge_tone"] = "muted";
    if (h.bound_type === "share" && h.bound_share_id) {
      const cache = shareCoverCache.value[h.bound_share_id];
      if (cache) {
        cover = _resolveUrl(cache.cover);
        title = cache.title || title || "画匣子";
        badge = cache.share_type === "album" ? "相册" : "画匣子";
        badgeTone = "primary";
      } else {
        title = title || "画匣子（加载中…）";
        badge = "画匣子";
        badgeTone = "primary";
      }
    } else if (h.bound_type === "nfc") {
      // 视频/音频/文件直链 —— 用 nfc_media_type 决定 badge；封面暂无
      const mt = h.nfc_media_type || "文件";
      title = title || (mt === "video" ? "视频" : mt === "audio" ? "音频" : "文件");
      badge = mt === "video" ? "视频" : mt === "audio" ? "音频" : "文件";
      badgeTone = mt === "video" ? "video" : "muted";
      // 视频直链本身就是一个 mp4/jpg URL，用它做 cover 也行，但 mp-weixin 不能给 mp4 当 image
      // 这里保持空 cover，让 MasonryFeed 显占位色
    } else if (h.bound_type === "couplet") {
      title = title || "春联";
      badge = "春联";
    } else {
      title = title || "未绑定";
      badge = `空 · …${tail}`;
    }
    return { id: `nfc:${h.uid}`, cover_url: cover, title, subtitle: `UID …${tail}`, badge, badge_tone: badgeTone };
  }),
);

const resetLoading = ref(false);

function onPickItem(it: MasonryItem) {
  const uid = it.id.slice("nfc:".length);
  if (!uid || resetLoading.value) return;
  const tail = uid.slice(-4);
  // confirmText 保持 ≤ 4 字：部分老基础库对 confirmText/cancelText 严格校验，超字直接静默 no-op
  uni.showModal({
    title: "重置这张卡？",
    content: `UID 末 4 位：${tail}\n重置后可挑新的画匣子 / 视频 / 音频 / 文件绑定`,
    confirmText: "重置",
    cancelText: "取消",
    success: async (r) => {
      if (!r.confirm) return;
      resetLoading.value = true;
      uni.showLoading({ title: "正在重置…" });
      try {
        await nfcApi.resetNfcCard(uid);
        setPending(STORAGE_KEYS.PENDING_PRESET_ID, uid);
        uni.hideLoading();
        uni.showToast({ title: "已重置，请选新内容", icon: "success", duration: 1200 });
        // switchTab 回 NFC tab —— index.vue onShow 会 reloadPending() 显示"正在为 NFC 卡片绑定内容"banner
        setTimeout(() => uni.switchTab({ url: "/pages/nfc/index" }), 700);
      } catch (e) {
        uni.hideLoading();
        const msg = e instanceof ApiError ? e.message : "重置失败";
        uni.showToast({ title: msg, icon: "none", duration: 3000 });
        logger.warn("[nfc/history] reset failed", e);
      } finally {
        resetLoading.value = false;
      }
    },
  });
}

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/nfc/index" });
}
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="back-btn" @click="goBack">
        <SvgIcon name="chevron-left" size="36rpx" />
      </view>
      <view class="topbar-info">
        <text class="topbar-title">{{ uiText("重置 NFC 匣子内容") }}</text>
        <text class="topbar-sub">{{ nfcHistory.length }} {{ uiText("张卡 · 点击重置并挑新内容") }}</text>
      </view>
      <view class="topbar-placeholder" />
    </view>

    <scroll-view scroll-y class="scroll">
      <view v-if="nfcHistory.length === 0" class="state">
        <text>{{ uiText("还没有碰过的 NFC 卡记录") }}</text>
        <text class="sub">{{ uiText("拿手机再碰一次卡片就会自动加入列表") }}</text>
      </view>
      <MasonryFeed
        v-else
        :items="masonryItems"
        empty_hint="还没有碰过卡片"
        @pick="onPickItem"
      />
      <view class="bottom-spacer" />
    </scroll-view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  height: 100vh;
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
.back-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
}
.topbar-info { flex: 1; padding: 0 t.$spacing-3; display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.topbar-title { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.topbar-sub { font-size: t.$font-xs; color: t.$color-text-mute; }
.topbar-placeholder { width: 64rpx; }

.scroll { flex: 1 1 0; padding: t.$spacing-3 t.$spacing-3 0; box-sizing: border-box; }

.state {
  padding: t.$spacing-6 t.$spacing-4;
  text-align: center;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  display: flex; flex-direction: column; gap: 8rpx; align-items: center;
  .sub { color: t.$color-text-mute; font-size: t.$font-xs; }
}
.bottom-spacer { height: 120rpx; }
</style>
