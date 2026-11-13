<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * NFC 落地页：从 query.uid（14 位 hex）开始，调后端 /api/nfc/<uid>，按状态分发。
 *
 * - status=empty   → 提示「待绑定」，给主人入口（Phase 2 接入绑定流程）
 * - status=filled + bound_type=share   → 跳片语播放页（Phase 2 接入）
 * - status=filled + bound_type=nfc     → bound_url 是视频/音频/文件直链，跳直链页（Phase 2）
 * - status=filled + bound_type=couplet → 春联展示页（远期）
 *
 * Phase 1 只做骨架展示与状态判定，把每条分支用 UI 模拟出来。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import * as nfcApi from "@/api/nfc";
import { resolveContentDestination } from "@/services/contentNavigation";
// 2026-07-14：mp-weixin 不支持动态 import()，改用静态 import 探 share_type
import { ApiError } from "@/api/request";
import { STORAGE_KEYS } from "@/config/env";
import { setPending } from "@/utils/media";
import { logger } from "@/utils/logger";
import { useVideoStallDetector } from "@/composables/useVideoStallDetector";
import type { NfcResolveResult } from "@/types";
import { openRemoteDocument } from "@/utils/open-document";
import SvgIcon from "@/components/SvgIcon.vue";

// —— 本地记录一份「碰过的 NFC 卡」历史，供 NFC tab 展示可选修改（issue 8） ——
interface NfcHistItem {
  uid: string
  ts: number
  bound_type?: string
  bound_share_id?: string | null
  bound_url?: string | null
  title?: string | null
}
function _recordNfcHistory(uid: string, res: NfcResolveResult) {
  if (!uid) return;
  try {
    const raw = uni.getStorageSync(STORAGE_KEYS.NFC_HISTORY);
    const arr: NfcHistItem[] = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    const now: NfcHistItem = {
      uid,
      ts: Date.now(),
      bound_type: res.bound_type || undefined,
      bound_share_id: res.bound_share_id || null,
      bound_url: res.bound_url || null,
      // 后端未回 title，交由 nfc/index.vue 显式改名或按 bound_type 兜底展示
    };
    const dedup = [now, ...arr.filter((it) => it.uid !== uid)].slice(0, 20);
    uni.setStorageSync(STORAGE_KEYS.NFC_HISTORY, dedup);
  } catch (e) {
    logger.warn("[nfc] history save failed", e);
  }
}

const uid = ref("");
const state = ref<"loading" | "empty" | "share" | "nfc" | "couplet" | "error">("loading");
const errorMsg = ref("");
const result = ref<NfcResolveResult | null>(null);

// 卡顿检测：NFC 视频落地页也用同一份 detector（NFC 视频常常是原始高码率视频，最容易卡）
const nfcVideoStall = useVideoStallDetector(() => result.value?.bound_url || "");

// 从 bound_url 后缀推断媒体类型（后端 /nfc/<uid> 暂未回吐 nfc_media_type）
type NfcMediaKind = "video" | "audio" | "file";
const nfcKind = computed<NfcMediaKind>(() => {
  const u = (result.value?.bound_url || "").toLowerCase();
  if (/\.(mp4|mov|m4v|webm)(\?|$)/.test(u)) return "video";
  if (/\.(mp3|m4a|aac|wav|ogg)(\?|$)/.test(u)) return "audio";
  return "file";
});

// 文件模式：把 bound_url 的完整链接换成可读文件名，避免整条 URL 直接甩到用户脸上
// 顺应网页版规范（NfcFileDownloadView.vue：URL 里带 ?name=真名）：优先取 query 里的 name
// 拿不到（小程序当前上传流没塞 name）就从 URL 末尾提取，把 tmp_ 前缀替成"文件"
const fileDisplayName = computed(() => {
  const url = result.value?.bound_url || "";
  if (!url) return "";
  try {
    const qMatch = url.match(/[?&]name=([^&]+)/);
    if (qMatch?.[1]) return decodeURIComponent(qMatch[1]);
    const path = url.split("?")[0];
    const rawName = decodeURIComponent(path.split("/").pop() || "");
    const ext = rawName.includes(".") ? rawName.split(".").pop() : "";
    return ext ? `文件.${ext}` : "文件";
  } catch {
    return "文件";
  }
});

// 音频播放：用 uni.createInnerAudioContext（小程序里没有 <audio> 标签）
let audioCtx: UniApp.InnerAudioContext | null = null;
const audioPlaying = ref(false);
const audioCurrent = ref(0);
const audioDuration = ref(0);
function _fmtTime(s: number) {
  if (!isFinite(s) || s <= 0) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
const audioTimeText = computed(() => `${_fmtTime(audioCurrent.value)} / ${_fmtTime(audioDuration.value)}`);

function ensureAudioCtx() {
  if (audioCtx) return audioCtx;
  audioCtx = uni.createInnerAudioContext();
  audioCtx.onPlay(() => { audioPlaying.value = true; });
  audioCtx.onPause(() => { audioPlaying.value = false; });
  audioCtx.onStop(() => { audioPlaying.value = false; audioCurrent.value = 0; });
  audioCtx.onEnded(() => { audioPlaying.value = false; audioCurrent.value = 0; });
  audioCtx.onTimeUpdate(() => {
    audioCurrent.value = audioCtx?.currentTime || 0;
    audioDuration.value = audioCtx?.duration || audioDuration.value;
  });
  audioCtx.onError((err) => {
    audioPlaying.value = false;
    logger.warn("[nfc] audio error", err);
    uni.showToast({ title: "音频播放失败", icon: "none" });
  });
  return audioCtx;
}

function toggleAudio() {
  const url = result.value?.bound_url || "";
  if (!url) return;
  const ctx = ensureAudioCtx();
  if (audioPlaying.value) {
    ctx.pause();
    return;
  }
  if (ctx.src !== url) ctx.src = url;
  ctx.play();
}

function copyBoundUrl() {
  const url = result.value?.bound_url || "";
  if (!url) return;
  uni.setClipboardData({
    data: url,
    success: () => uni.showToast({ title: "链接已复制，可在浏览器打开下载", icon: "none", duration: 2500 }),
  });
}

// 文件预览/下载：小程序不能直接下载到相册，但 uni.downloadFile + openDocument
// 可以让用户在系统应用里查看 pdf/word/excel/ppt/txt 等常见类型
//
// 微信打开文档时**导航栏标题 = filePath 的 basename**。
// uni.downloadFile 落到临时目录（basename 形如 tmp_xxx.docx）→ 直接 openDocument 就是这坨乱码。
// 解决：downloadFile 拿到 tempFilePath 后，用 FileSystemManager.copyFile 拷到
// USER_DATA_PATH/<真名>，然后 openDocument 那个副本 → 微信显示的就是真名。
function openOrDownloadFile() {
  const url = result.value?.bound_url || "";
  if (url) openRemoteDocument(url, fileDisplayName.value, copyBoundUrl);
}

onUnmounted(() => {
  try { audioCtx?.stop(); audioCtx?.destroy(); } catch { /* ignore */ }
  audioCtx = null;
});

onLoad((opt) => {
  uid.value = (opt?.uid as string) || "";
});

onMounted(async () => {
  if (!uid.value) {
    state.value = "error";
    errorMsg.value = "缺少 uid 参数";
    return;
  }
  // hotfix6：放宽到 14 位 hex；同时对「全 0 UID」给专属提示
  // 全 0 = NFC 芯片 UID Mirroring 没生效，卡片可能是白牌/损坏，不是正品 NXP NTAG21x
  if (/^0+$/.test(uid.value)) {
    state.value = "error";
    errorMsg.value = "这张 NFC 卡的 UID 反射（UID Mirroring）功能未生效，无法识别。建议换成正品 NXP NTAG213/215/216 卡（UID 以 04 开头）";
    return;
  }
  if (!/^[0-9A-Fa-f]{14}$/.test(uid.value)) {
    state.value = "error";
    errorMsg.value = "uid 格式不合法";
    return;
  }

  try {
    const res = await nfcApi.resolveNfcUid(uid.value.toUpperCase());
    result.value = res;
    logger.info("[nfc] resolve", res);
    _recordNfcHistory(uid.value.toUpperCase(), res);

    if (res.status === "empty") {
      state.value = "empty";
      return;
    }
    if (res.status === "filled") {
      // 相册/画匣子/合集共用类型解析器；先确认相册类型，再检查合集，不用缺失字段猜测。
      if (res.bound_type === "share" && res.bound_share_id) {
        const boundId = res.bound_share_id;
        const destination = await resolveContentDestination(boundId);
        uni.redirectTo({ url: destination });
        return;
      }
      // 春联同理：直接进展示页
      if (res.bound_type === "couplet" && res.bound_share_id) {
        uni.redirectTo({ url: `/pages/couplet/display?id=${encodeURIComponent(res.bound_share_id)}` });
        return;
      }
      if (res.bound_type === "nfc") state.value = "nfc";
      else state.value = "error", (errorMsg.value = "未知绑定类型");
    }
  } catch (e) {
    state.value = "error";
    errorMsg.value = e instanceof ApiError ? e.message : "查询失败";
    logger.warn("[nfc] resolve failed", e);
  }
});

function gotoBind() {
  // 选择已有画匣子绑定：跳 nfc/bind 列出 personal shares
  uni.navigateTo({ url: `/pages/nfc/bind?uid=${encodeURIComponent(uid.value)}` });
}

// 新建内容并绑定：写 PENDING_PRESET → 切到 NFC tab 选 4 种模式
function gotoCreateAndBind() {
  setPending(STORAGE_KEYS.PENDING_PRESET_ID, uid.value);
  uni.switchTab({ url: "/pages/nfc/index" });
}

function gotoHome() {
  uni.reLaunch({ url: "/pages/index/index" });
}
</script>

<template>
  <view class="landing">
    <!-- 视频落地态不展示 header：视频直接 autoplay 全屏播放，避免遮挡 -->
    <view v-if="!(state === 'nfc' && nfcKind === 'video')" class="header">
      <text class="brand">{{ uiText("画匣子") }}</text>
      <text v-if="uid" class="uid">UID: {{ uid }}</text>
    </view>

    <view v-if="state === 'loading'" class="state">
      <text>{{ uiText("正在打开这枚卡片…") }}</text>
    </view>

    <view v-else-if="state === 'empty'" class="state">
      <text class="state-title">{{ uiText("这枚画匣子还未绑定内容") }}</text>
      <text class="state-sub">{{ uiText("如果你是它的主人，可以新建图文 / 视频 / 音频 / 文件，或选择已上传的画匣子、文件和音视频绑定。") }}</text>
      <button class="btn btn-primary" @click="gotoCreateAndBind">{{ uiText("新建内容并绑定") }}</button>
      <button class="btn btn-ghost" @click="gotoBind">{{ uiText("选择已有内容") }}</button>
      <view class="link" @click="gotoHome"><text>{{ uiText("返回首页") }}</text></view>
    </view>

    <!-- 视频：占满屏；autoplay + 隐藏中间「即将播放」层，碰一碰立刻放视频 -->
    <view v-else-if="state === 'nfc' && nfcKind === 'video'" class="nfc-video-fullscreen">
      <video
        class="nfc-video-full"
        :src="result?.bound_url || ''"
        controls
        autoplay
        show-fullscreen-btn
        object-fit="contain"
        :enable-progress-gesture="true"
        @waiting="nfcVideoStall.onWaiting"
        @error="nfcVideoStall.onError"
      />
    </view>

    <view v-else-if="state === 'nfc' && nfcKind === 'audio'" class="state state-media">
      <text class="state-title">{{ uiText("这枚画匣子里有一段录音") }}</text>
      <view class="audio-card">
        <view class="audio-play-btn" @click="toggleAudio">
          <SvgIcon :name="audioPlaying ? 'pause' : 'play'" size="36rpx" color="#F7F3EE" />
        </view>
        <text class="audio-time">{{ audioTimeText }}</text>
      </view>
      <view class="link-row">
        <view class="link" @click="copyBoundUrl"><text>{{ uiText("复制音频链接") }}</text></view>
      </view>
    </view>

    <view v-else-if="state === 'nfc'" class="state state-media">
      <text class="state-title">{{ uiText("这枚画匣子里有一份文件") }}</text>
      <text class="state-sub">{{ fileDisplayName }}</text>
      <button class="btn btn-primary" @click="openOrDownloadFile">{{ uiText("打开 / 下载") }}</button>
      <view class="link-row">
        <view class="link" @click="copyBoundUrl"><text>{{ uiText("复制文件链接") }}</text></view>
      </view>
    </view>

    <view v-else class="state state-err">
      <text class="state-title">{{ uiText("出问题了") }}</text>
      <text class="state-sub">{{ uiText(errorMsg) }}</text>
      <button class="btn btn-ghost" @click="gotoHome">{{ uiText("返回首页") }}</button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.landing {
  min-height: 100vh;
  padding: t.$spacing-5 t.$spacing-4;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header {
  text-align: center;
  margin-top: t.$spacing-5;
  margin-bottom: t.$spacing-6;
  .brand {
    display: block;
    font-size: t.$font-xl;
    letter-spacing: 6rpx;
    color: t.$color-text;
    font-weight: 700;
  }
  .uid {
    display: block;
    margin-top: t.$spacing-2;
    font-size: t.$font-xs;
    color: t.$color-text-mute;
  }
}

.state {
  width: 100%;
  max-width: 600rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-5;
  background: t.$color-surface;
  border-radius: t.$radius-lg;
  box-shadow: t.$shadow-card;
  text-align: center;
  .state-title {
    font-size: t.$font-lg;
    color: t.$color-text;
    font-weight: 600;
  }
  .state-sub {
    font-size: t.$font-sm;
    color: t.$color-text-soft;
    line-height: 1.6;
  }
}
.state-err {
  .state-title { color: t.$color-danger; }
}

.btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: t.$radius-pill;
  font-size: t.$font-md;
  margin: t.$spacing-3 0 0 0;
  padding: 0;
}
.btn-primary {
  background: t.$color-accent;
  color: t.$color-text-invert;
}
.btn-ghost {
  background: transparent;
  color: t.$color-accent;
  border: 2rpx solid t.$color-accent;
}

.link {
  margin-top: t.$spacing-3;
  font-size: t.$font-sm;
  color: t.$color-text-mute;
}

.state-media { gap: t.$spacing-4; }

// 全屏视频：碰一碰跳过任何中间层，直接 autoplay 撑满屏
.nfc-video-fullscreen {
  position: fixed;
  inset: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.nfc-video-full {
  width: 100vw;
  height: 100vh;
  display: block;
  background: #000;
}

.audio-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-3;
  background: t.$color-bg;
  border-radius: t.$radius-md;
}
.audio-play-btn {
  width: 88rpx; height: 88rpx;
  border-radius: 50%;
  background: t.$color-accent;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.audio-time {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
}

.link-row {
  display: flex; justify-content: center;
  margin-top: t.$spacing-2;
}
</style>
