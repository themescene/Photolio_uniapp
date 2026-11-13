<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * NFC tab —— 参考 annualreport/src/views/NfcLandingView.vue 的卡片选择面板。
 *
 * UX：
 *   1. 头部 hero「NFC 画匣子」+ 副标题
 *   2. 若有 pending preset（碰一碰从 nfc/landing 跳进来时写入 storage）→ 顶部 banner
 *      「正在为 NFC 卡片绑定内容」+ 显示 UID 末 4 位
 *   3. 4 张模式卡片：图文 / 视频 / 音频 / 文件（圆形 icon + 名称 + 描述 + 右箭头）
 *      - 图文：切 upload tab，CreationFlow 完成 save-share 后读 PENDING_PRESET 自动 bind
 *      - 视频/音频/文件：上传 → save-share记录归属 → 有待绑卡才绑定；无卡直接留在素材列表
 *   4. 入口「重置 NFC 匣子内容」—— 跳 /pages/nfc/history 瀑布流，点卡片确认 → resetNfcCard → 重新进入绑定流
 *   5. 折叠区「手动输入 UID」（开发期调试），底部共用NfcContentLibrary显示账号内容
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import * as nfcApi from "@/api/nfc";
import { uploadShareVideo, pollVideoStatus } from "@/api/share";
import { saveShare, newSessionId } from "@/api/round";
import { useAuthStore } from "@/stores/auth";
import { buildMediaReport, type UploadedMedia } from "@/features/nfc/content";
import { useRecorder } from "@/composables/useRecorder";
import { nfcError } from "@/composables/useNfcLibrary";
import NfcContentLibrary from "@/components/NfcContentLibrary.vue";
import { ApiError } from "@/api/request";
import { STORAGE_KEYS } from "@/config/env";
import { readPending, clearPending } from "@/utils/media";
import { ensurePrivacyAuthorized } from "@/utils/privacy";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";
import PermissionSheet from "@/components/PermissionSheet.vue";
import CustomTabBar from "@/components/CustomTabBar.vue";

interface NfcHistItem {
  uid: string
  ts: number
  bound_type?: string
  bound_share_id?: string | null
  bound_url?: string | null
  title?: string | null
}

type NfcMode = "collection" | "video" | "audio" | "file";

const MODES: { key: NfcMode; name: string; desc: string; icon: string }[] = [
  // 2026-07-13 用户要求把「图文」换个能体现"大批量或相册"的叫法 → 改为「画匣子」（品牌统一）
  // 画匣子 = 图文回忆 / 相册云存 二合一入口；后续在 CreationFlow 的 A/B/C 里再细分
  { key: "collection", name: "画匣子", desc: "图文回忆或高清云相册，可事后编辑追加。", icon: "folder" },
  { key: "video",      name: "视频", desc: "上传保存到已上传内容，可直接播放或稍后绑定卡片。", icon: "play" },
  { key: "audio",      name: "音频", desc: "录制或选择音频，保存后可试听并绑定卡片。", icon: "mic" },
  { key: "file",       name: "文件", desc: "支持 PDF 等文件；先上传保存，无需先碰 NFC 卡。", icon: "upload" },
];

const auth = useAuthStore();
const libraryRefresh = ref(0);
const pendingSave = ref<UploadedMedia | null>(null);
const saveError = ref("");
let savingRecord = false;
let uploadOwnerToken = "";
let uploadTarget = "";
const pendingPresetId = ref("");
const presetTail = computed(() => {
  if (!pendingPresetId.value) return "";
  const s = pendingPresetId.value;
  return s.length >= 4 ? s.slice(-4) : s;
});

// 2026-07-13：NFC 内容的权限设置——碰一碰进入本页后，先选权限再点 4 种类型
// 权限只作用到「画匣子」模式（走 save-share 有 visibility 字段）；视频/音频/文件是直链 NFC，
// 权限系统本轮暂不覆盖直链模式（需 backend 加 preset-level 权限，工程量大，下一轮做）
type Scope = 0 | 1 | 2 | 3;
type Level = 0 | 1 | 2;
const nfcVisibility = ref<Scope>(1);   // 默认「已分享的人」，最贴近碰一碰的语义
const nfcAccessLevel = ref<Level>(2);
const permissionSheetOpen = ref(false);
const SCOPE_NAMES = ["私密", "已分享的人", "所有好友", "公开"];

function openPermissionSheet() { permissionSheetOpen.value = true; }
function onSaveNfcPermissions(payload: { scope: Scope; level: Level }) {
  nfcVisibility.value = payload.scope;
  nfcAccessLevel.value = payload.level;
  permissionSheetOpen.value = false;
  uni.showToast({ title: "已更新，本次绑定生效", icon: "success", duration: 1500 });
  // 写入 storage，让 CreationFlow 在 save-share 时能拿到
  try {
    uni.setStorageSync(STORAGE_KEYS.PENDING_NFC_VISIBILITY, payload.scope);
    uni.setStorageSync(STORAGE_KEYS.PENDING_NFC_ACCESS_LEVEL, payload.level);
  } catch { /* ignore */ }
}
function gotoRebindHistory() {
  uni.navigateTo({ url: "/pages/nfc/history" });
}
function onCopyNfcInfo() {
  uni.setClipboardData({
    data: pendingPresetId.value,
    success: () => uni.showToast({ title: "UID 已复制", icon: "success" }),
  });
}
function onInviteToNfc() {
  uni.showToast({ title: "NFC 共创请先绑定后在详情页操作", icon: "none" });
}

const busyMode = ref<NfcMode | "">("");
const uploadPercent = ref<number | null>(null);

const showManual = ref(false);
const manualUid = ref("");

// 已碰过的 NFC 卡：仅用于顶部入口按钮的计数展示。清单和重置流全部在 /pages/nfc/history 页
const nfcHistory = ref<NfcHistItem[]>([]);
function _loadHistory() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEYS.NFC_HISTORY);
    const arr: NfcHistItem[] = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    nfcHistory.value = arr.slice(0, 20);
  } catch {
    nfcHistory.value = [];
  }
}

// —— 音频模式改为「现场录制」而不是 chooseMessageFile ——
// chooseMessageFile 需要「聊天文件」隐私接口声明，个人主体或未完成配置时会 fail
// 现场录制走 getRecorderManager，只需麦克风权限，避开 scope 未声明的死路
let resolveAudio: ((path: string | null) => void) | null = null;
const audioRecorder = useRecorder({
  onAudioReady: audio => { const resolve = resolveAudio; resolveAudio = null; resolve?.(audio.tempFilePath); },
  onError: message => { const resolve = resolveAudio; resolveAudio = null; resolve?.(null); toastErr(message); },
});
const { isRecording: isRecordingAudio, recordingTime: audioRecordSeconds } = audioRecorder;
// hotfix6：放宽到任意 14 位 hex（原来强制 04 开头把白牌卡全挡了）
const isValidManual = computed(() => /^[0-9A-Fa-f]{14}$/.test(manualUid.value.trim()));

function reloadPending() {
  pendingPresetId.value = readPending<string>(STORAGE_KEYS.PENDING_PRESET_ID) || "";
}

onMounted(() => {
  reloadPending();
  _loadHistory();
});
onShow(() => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 fallback */ }
  reloadPending();
  _loadHistory();
});
onUnmounted(() => {
  resolveAudio?.(null); resolveAudio = null;
});

function gotoCollection() {
  // 图文模式：切到上传 tab；如有 pending preset，CreationFlow 完成 save-share 后会自动 bind
  uni.switchTab({ url: "/pages/upload/index" });
}

function onModeClick(event: { currentTarget?: { dataset?: { mode?: NfcMode } } }) {
  const mode = event.currentTarget?.dataset?.mode;
  if (mode && MODES.some(item => item.key === mode)) void chooseAndUpload(mode);
}
async function chooseAndUpload(mode: NfcMode) {
  if (busyMode.value) return;
  if (!auth.isLoggedIn) {
    uni.navigateTo({ url: "/pages/auth/login" }); return;
  }
  if (pendingSave.value) { toastErr("上一份文件尚未保存，请先点击下方重试保存"); return; }
  uploadTarget = pendingPresetId.value;
  uploadOwnerToken = auth.token || "";
  if (mode === "collection") return gotoCollection();

  busyMode.value = mode;
  saveError.value = "";
  try {
    if (mode === "video") {
      const res = await chooseMedia(["video"]);
      const f = res?.tempFiles?.[0];
      if (!f?.tempFilePath) return;
      if ((f.size || 0) > 500 * 1024 * 1024) {
        return toastErr("视频不能超过 500MB");
      }
      busyMode.value = "video";
      uploadPercent.value = 0;
      // 2026-08-11：NFC 绑定视频走原图模式 —— 卡片是永久物料，画质应尽量保留；
      // backend 若 h264/mp4 直接 rename，非 mp4 只做容器封装无重编码
      const up = await uploadShareVideo(f.tempFilePath, sessionId(), (p) => (uploadPercent.value = p), /* originalQuality */ true);
      uploadPercent.value = null;
      const video = await waitVideoTranscode(up.job_id);
      await finishUpload({ session_id: newSessionId(), type: "video", title: video.original_filename || `视频 ${new Date().toLocaleString()}`,
        url: video.video_url, thumbnail: video.thumbnail_url || undefined, size_mb: video.output_size_mb, duration: video.duration });
    } else if (mode === "audio") {
      // 音频：让用户选「现场录制」或「从聊天选文件」——用户明确要求两种方式二选一
      // 录制：uni.getRecorderManager，仅需麦克风（已声明）
      // 文件：uni.chooseMessageFile，需要「文件」类隐私接口 —— 未声明会直接抛，
      //   由 catch 分支把 errMsg 转成人话（否则「chooseMessageFile:fail scope…」看起来像乱码）
      const source = await pickAudioSource();
      if (!source) return;
      let tempFilePath = "", audioName = "";
      if (source === "record") {
        // 首次录音必须弹独立《声纹授权协议》授权 modal（合规审核要求）
        const ok = await ensureVoiceprintConsent();
        if (!ok) return;
        tempFilePath = await recordAudioLive() || "";
      } else {
        const picked = await chooseFileWithName("audio");
        if (picked && picked.size > 50 * 1024 * 1024) return toastErr("音频不能超过 50MB");
        tempFilePath = picked?.path || ""; audioName = picked?.name || "";
      }
      if (!tempFilePath) return;
      busyMode.value = "audio";
      uploadPercent.value = 0;
      const r = await nfcApi.uploadNfcAudio(tempFilePath, (p) => (uploadPercent.value = p));
      uploadPercent.value = null;
      await finishUpload({ session_id: newSessionId(), type: "audio", title: audioName || `录音 ${new Date().toLocaleString()}`,
        url: r.audio_url, duration: r.duration, size_mb: r.size_mb });
    } else if (mode === "file") {
      const picked = await chooseFileWithName("all");
      if (!picked) return;
      if (picked.size > 200 * 1024 * 1024) return toastErr("文件不能超过 200MB");
      busyMode.value = "file";
      uploadPercent.value = 0;
      // 2026-08-11：把 chooseMessageFile 拿到的真名通过 formData 送后端，让 backend
      //   用它做 safe_name（保存到 uploads/ 时保留真名）+ 返回权威 original_name
      const r = await nfcApi.uploadNfcFile(
        picked.path,
        (p) => (uploadPercent.value = p),
        picked.name || undefined,
      );
      uploadPercent.value = null;
      // 把原始文件名塞进 bound_url 的 ?name= query（对齐网页端 NfcLandingView.vue:147）
      // landing.vue 的 fileDisplayName 优先解析 ?name= → 展示原名
      // openOrDownloadFile 也读同一个 ?name= 把 downloadFile 后的临时文件重命名 → 微信打开文档时导航栏标题也是原名
      // 2026-08-11：优先取本地 picked.name（100% 真名）；backend 回显作 fallback
      const originalName = picked.name || r.original_name || "";
      const finalUrl = originalName
        ? `${r.file_url}${r.file_url.includes("?") ? "&" : "?"}name=${encodeURIComponent(originalName)}`
        : r.file_url;
      await finishUpload({ session_id: newSessionId(), type: "file", title: originalName || "文件",
        url: finalUrl, size_mb: r.size_mb });
    }
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : (e as Error)?.message || "上传失败";
    if (!/cancel/i.test(msg)) toastErr(msg);
    logger.warn("[nfc] upload failed", e);
  } finally {
    busyMode.value = "";
    uploadPercent.value = null;
  }
}

// 首次录音必须弹独立《声纹授权协议》授权 modal（合规审核 2026-07-16 要求）
// 与 CreationFlow.ensureVoiceprintConsent 逻辑保持一致；共用 VOICEPRINT_CONSENT storage
function ensureVoiceprintConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    let agreed = false;
    try { agreed = !!uni.getStorageSync(STORAGE_KEYS.VOICEPRINT_CONSENT); } catch { /* ignore */ }
    if (agreed) return resolve(true);
    uni.showModal({
      title: "声纹授权",
      content:
        "画匣子仅将本次录音上传作为 NFC 音频留言播放使用，绝不用于声纹识别、身份认证或 AI 模型训练。详见《声纹授权协议》。",
      confirmText: "同意",
      cancelText: "查看协议",
      success: (r) => {
        if (r.confirm) {
          try { uni.setStorageSync(STORAGE_KEYS.VOICEPRINT_CONSENT, true); } catch { /* ignore */ }
          resolve(true);
        } else {
          uni.navigateTo({ url: "/pages/legal/voiceprint" });
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}

// 音频来源二选一：现场录制 / 从聊天选文件。返回 null 表示用户取消
function pickAudioSource(): Promise<"record" | "file" | null> {
  let fileLabel = "从聊天里选一个音频文件";
  // #ifdef H5
  fileLabel = "从本机选择音频文件";
  // #endif
  return new Promise((resolve) => {
    uni.showActionSheet({
      itemList: ["现场录制一段（≤ 5 分钟）", fileLabel],
      success: (r) => {
        if (r.tapIndex === 0) resolve("record");
        else if (r.tapIndex === 1) resolve("file");
        else resolve(null);
      },
      fail: () => resolve(null),
    });
  });
}

function chooseMedia(mediaType: ("image" | "video")[]) {
  // #ifdef H5
  return new Promise<{ tempFiles: Array<{ tempFilePath: string; size: number }> } | null>((resolve, reject) => {
    uni.chooseVideo({ sourceType: ["album", "camera"], compressed: false,
      success: result => resolve({ tempFiles: [{ tempFilePath: result.tempFilePath, size: result.size }] }),
      fail: error => /cancel/i.test(error.errMsg || "") ? resolve(null) : reject(new Error("选择视频失败，请重试")) });
  });
  // #endif
  // #ifndef H5
  return new Promise<UniApp.ChooseMediaSuccessCallbackResult | null>((resolve, reject) => {
    logger.info("[nfc] chooseMedia start", { mediaType });
    uni.chooseMedia({
      count: 1,
      mediaType,
      sourceType: ["album", "camera"],
      maxDuration: 60,
      success: (r) => {
        logger.info("[nfc] chooseMedia success", { count: r.tempFiles?.length });
        resolve(r);
      },
      fail: (err) => {
        const msg = err?.errMsg || "";
        logger.warn("[nfc] chooseMedia fail", err);
        // 用户主动取消 → resolve(null) 静默；其它错误（隐私接口未声明等）→ reject 让上层弹 toast
        if (/cancel/i.test(msg)) resolve(null);
        else reject(new Error(msg || "选择媒体失败"));
      },
    });
  });
  // #endif
}

function recordAudioLive(): Promise<string | null> {
  return new Promise(resolve => { resolveAudio = resolve; void audioRecorder.startRecording(); });
}
function stopRecordAudio() { audioRecorder.stopRecording(); }

function fmtAudioTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// 首次调用 chooseMessageFile / getRecorderManager 等隐私接口时，wx 需要弹「用户隐私保护提示」
// 由用户点「同意」才能继续。图文 / 视频模式走 chooseMedia，微信基础库会自动弹；
// 但走 chooseMessageFile 的路径不会自动弹（用户 Bug7：新账号在文件模式看到「乱码」
// 其实是 "chooseMessageFile:fail api scope is not declared" 之类的错误消息）。
// 这里主动调 wx.requirePrivacyAuthorize 走一遍隐私对话框，通过后再打开选择器。
// 文件模式需要原始文件名（用于上传后拼 ?name= query + 打开文档时显示真名），
// audio 模式当前只用 path。统一走这个函数，audio 复用 chooseFile 保持接口不变。
async function chooseFileWithName(
  kind: "audio" | "all",
): Promise<{ path: string; name: string; size: number } | null> {
  // 新账号在文件模式下不会自动弹隐私对话框，chooseMessageFile 会直接报 scope error（用户投诉的「乱码」）
  const ok = await ensurePrivacyAuthorized();
  if (!ok) {
    uni.showToast({ title: "需要先同意隐私协议才能选文件", icon: "none", duration: 3000 });
    return null;
  }
  // #ifdef H5
  return new Promise((resolve, reject) => {
    uni.chooseFile({ count: 1, type: "all", extension: kind === "audio" ? [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"] : undefined,
      success: result => {
        const file = (Array.isArray(result.tempFiles) ? result.tempFiles[0] : result.tempFiles) as File & { path?: string };
        resolve(file?.path ? { path: file.path, name: file.name || "", size: file.size || 0 } : null);
      }, fail: error => /cancel/i.test(error.errMsg || "") ? resolve(null) : reject(new Error("选择文件失败，请重试")) });
  });
  // #endif
  // #ifndef H5
  return new Promise((resolve, reject) => {
    logger.info("[nfc] chooseMessageFile start", { kind });
    uni.chooseMessageFile({
      count: 1,
      type: kind === "audio" ? "file" : "all",
      extension: kind === "audio" ? ["mp3", "wav", "m4a", "aac", "flac", "ogg"] : undefined,
      success: (r) => {
        const f = r.tempFiles?.[0];
        logger.info("[nfc] chooseMessageFile success", { path: f?.path, name: f?.name, size: f?.size });
        if (!f?.path) { resolve(null); return; }
        resolve({ path: f.path, name: f.name || "", size: f.size || 0 });
      },
      fail: (err) => {
        const msg = (err as { errMsg?: string })?.errMsg || "";
        logger.warn("[nfc] chooseMessageFile fail", err);
        if (/cancel/i.test(msg)) resolve(null);
        else if (/scope/i.test(msg)) {
          // 把 raw errMsg 翻译成人话，避免用户看到「chooseMessageFile:fail api scope is not
          // declared in the privacy agreement」这种"乱码"
          reject(new Error("小程序尚未开通「聊天文件」隐私接口，暂时无法选文件；可先用「图文」或「视频」入口，或联系管理员在小程序后台开通"));
        }
        else reject(new Error(msg || "选择文件失败"));
      },
    });
  });
  // #endif
}

async function waitVideoTranscode(jobId: string) {
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const s = await pollVideoStatus(jobId);
      if (s.status === "done" && s.video_url) return { ...s, video_url: s.video_url };
      if (s.status === "error") throw new Error(s.message || "转码失败");
    } catch (e) {
      if (e instanceof Error && e.message.includes("转码失败")) throw e;
      // 网络抖动，继续重试
    }
  }
  throw new Error("转码超时，稍后再试");
}

// 参考：annualreport/src/views/NfcLandingView.vue saveToServer；先持久化，再独立执行绑定。
async function finishUpload(record: UploadedMedia) {
  pendingSave.value = record;
  await retrySave();
}
async function retrySave() {
  const record = pendingSave.value;
  if (!record || savingRecord) return;
  if (auth.token !== uploadOwnerToken) { saveError.value = "登录账号已变化，请回到上传账号后重试保存"; return; }
  savingRecord = true;
  busyMode.value = record.type; saveError.value = "";
  try {
    logger.info("[nfc-media] save:start", { type: record.type, session: record.session_id, hasTarget: !!uploadTarget });
    const saved = await saveShare({ session_id: record.session_id, report: buildMediaReport(record),
      cover_thumbnail: record.thumbnail || "", nfc_fullscreen: true, group_id: "__nfc__" });
    pendingSave.value = null;
    libraryRefresh.value++;
    try { uni.setStorageSync(STORAGE_KEYS.HOME_DIRTY, true); } catch { /* 刷新提示失败不影响服务端已保存 */ }
    logger.info("[nfc-media] save:done", { shareId: saved.share_id, type: record.type });
    if (uploadTarget && uploadTarget === pendingPresetId.value) {
      try {
        await nfcApi.bindPresetToNfcUrl(uploadTarget, record.url, record.type);
        bound(uploadTarget);
      } catch (error) {
        saveError.value = "内容已保存，绑定未完成。可在下方选择这份内容重新绑定。";
        toastErr(nfcError(error, "内容已保存，绑定失败，请从下方重试"));
      }
    } else uni.showToast({ title: "已保存到已上传内容", icon: "success" });
  } catch (error) {
    saveError.value = "文件已上传，但保存记录失败。请留在本页重试保存，无需重新上传。";
    logger.warn("[nfc-media] save failed", error); toastErr(nfcError(error, "保存失败，请重试"));
  } finally { busyMode.value = ""; savingRecord = false; }
}
function bound(uid: string) {
  if (readPending<string>(STORAGE_KEYS.PENDING_PRESET_ID) === uid) clearPending(STORAGE_KEYS.PENDING_PRESET_ID);
  pendingPresetId.value = "";
  uni.showToast({ title: "绑定成功", icon: "success" });
  setTimeout(() => uni.reLaunch({ url: `/pages/nfc/landing?uid=${encodeURIComponent(uid)}` }), 600);
}

function sessionId() { return newSessionId(); }

function toastErr(msg: string) {
  uni.showToast({ title: /[a-zA-Z]{4,}/.test(msg) ? "操作失败，请稍后重试" : msg, icon: "none", duration: 3000 });
}

// ---- 折叠区：手动输入 UID（开发期调试） ----
function onManualGo() {
  if (!isValidManual.value) return;
  uni.navigateTo({
    url: `/pages/nfc/landing?uid=${encodeURIComponent(manualUid.value.trim().toUpperCase())}`,
  });
}
</script>

<template>
  <view class="page">
    <view class="hero">
      <text class="title">{{ uiText("NFC 画匣子") }}</text>
      <text class="hint">{{ uiText("把回忆封进卡片，亲友碰一碰即可重温") }}</text>
    </view>

    <!-- 待绑定 banner（有 UID 时显示）-->
    <view v-if="pendingPresetId" class="bind-banner">
      <SvgIcon name="gear" size="28rpx" color="#5C4033" />
      <text>{{ uiText("正在为 NFC 卡片绑定内容 · UID 末 4 位：") }}{{ presetTail }}</text>
    </view>

    <!-- 无待绑卡时也可以上传，内容先存入账号。 -->
    <view v-else class="hint-banner">
      <text>{{ uiText("可以先上传文件、音频或视频，内容会保存到下方列表。之后碰一碰未绑定的 NFC 卡，再选择已有内容绑定。") }}</text>
    </view>

    <!-- 2026-07-13：权限编辑入口 —— 在 4 个绑定选项之前先给用户设 visibility / access_level
         仅「画匣子」模式会真正应用（走 save-share 有字段落库）；视频/音频/文件直链 NFC 目前不支持权限
    -->
    <view v-if="pendingPresetId" class="perm-banner" @click="openPermissionSheet">
      <view class="perm-banner-left">
        <SvgIcon name="share" size="28rpx" color="#3D2E1F" />
        <view class="perm-banner-text">
          <text class="perm-banner-title">{{ uiText("分享权限") }}</text>
          <text class="perm-banner-sub">
            {{ SCOPE_NAMES[nfcVisibility] }} {{ uiText("· 点击调整（仅「画匣子」模式生效）") }}
          </text>
        </view>
      </view>
      <SvgIcon name="chevron-right" size="32rpx" color="#A89A8A" />
    </view>

    <!-- 上传和绑定解耦；有待绑卡时保留上传后直接绑定。 -->
    <view class="mode-list">
      <view
        v-for="m in MODES" :key="m.key"
        class="mode-card"
        :class="{ busy: busyMode === m.key }"
        :data-mode="m.key" role="button" :aria-disabled="!!busyMode" @click="onModeClick"
      >
        <view class="mode-icon">
          <SvgIcon :name="m.icon" size="44rpx" color="#6B4E37" />
        </view>
        <view class="mode-body">
          <text class="mode-name">{{ uiText(m.name) }}</text>
          <text class="mode-desc">{{ uiText(m.desc) }}</text>
          <text v-if="busyMode === m.key && uploadPercent !== null" class="mode-progress">
            {{ uiText("上传中") }} {{ uploadPercent }}%
          </text>
          <text v-else-if="busyMode === m.key" class="mode-progress">{{ uiText("正在处理…") }}</text>
        </view>
        <view class="mode-chevron">
          <SvgIcon name="chevron-right" size="32rpx" color="#A89A8A" />
        </view>
      </view>
    </view>

    <!-- 「重置 NFC 匣子内容」独立瀑布流页：列出碰过的所有卡，点卡片弹重置确认 modal -->
    <view class="section">
      <view class="section-toggle" @click="gotoRebindHistory">
        <SvgIcon name="gear" size="24rpx" color="#A89A8A" />
        <text>{{ uiText("重置 NFC 匣子内容（") }}{{ nfcHistory.length }}）</text>
        <SvgIcon name="chevron-right" size="24rpx" color="#A89A8A" />
      </view>
    </view>

    <!-- 折叠：手动输入 UID（开发期） -->
    <view class="section">
      <view class="section-toggle" @click="showManual = !showManual">
        <SvgIcon name="plus" size="24rpx" color="#A89A8A" />
        <text>{{ uiText("手动输入 UID（开发调试）") }}</text>
        <SvgIcon class="toggle-arrow" :style="{ transform: showManual ? 'rotate(90deg)' : 'none' }" name="chevron-right" size="24rpx" color="#A89A8A" />
      </view>
      <view v-if="showManual" class="section-body">
        <input
          v-model="manualUid"
          class="input"
          placeholder="04XXXXXXXXXXXX"
          maxlength="14"
        />
        <view
          class="btn-primary" :class="{ disabled: !isValidManual }"
          @click="onManualGo"
        ><text>{{ uiText("打开落地页") }}</text></view>
      </view>
    </view>

    <view v-if="saveError" class="upload-status"><text>{{ saveError }}</text><view v-if="pendingSave" class="btn-primary" :class="{ disabled: !!busyMode }" role="button" @click="!busyMode && retrySave()"><text>{{ uiText("重试保存") }}</text></view></view>
    <NfcContentLibrary :preset-id="pendingPresetId" :refresh-key="libraryRefresh" :disabled="!!busyMode" @bound="bound" />

    <!-- 音频现场录制悬浮层：显示计时 + 停止；用户点停止或 5min 上限自动完成 -->
    <view v-if="isRecordingAudio" class="recording-overlay">
      <view class="recording-card">
        <view class="recording-dot" />
        <text class="recording-time">{{ fmtAudioTime(audioRecordSeconds) }}</text>
        <text class="recording-hint">{{ uiText("正在录音，最长 5 分钟。说完点下方按钮停止。") }}</text>
        <view class="btn-primary" @click="stopRecordAudio"><text>{{ uiText("停止并上传") }}</text></view>
      </view>
    </view>

    <CustomTabBar active="nfc" />

    <PermissionSheet
      :open="permissionSheetOpen"
      :can-manage="true"
      :can-invite="false"
      :scope="nfcVisibility"
      :level="nfcAccessLevel"
      :subject-title="pendingPresetId ? `NFC · UID …${presetTail}` : 'NFC 卡片'"
      @update:open="(v) => (permissionSheetOpen = v)"
      @save="onSaveNfcPermissions"
      @invite="onInviteToNfc"
      @copy-link="onCopyNfcInfo"
    />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  min-height: 100vh;
  background: t.$color-bg;
  padding: t.$spacing-5 t.$spacing-4 calc(160rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: t.$spacing-4;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
  text-align: center;
  .title {
    font-size: t.$font-xl;
    font-weight: t.$weight-extrabold;
    color: t.$color-text;
  }
  .hint {
    font-size: t.$font-sm;
    color: t.$color-text-soft;
  }
}

.bind-banner {
  display: flex;
  align-items: center;
  gap: t.$spacing-2;
  padding: 16rpx 24rpx;
  border-radius: t.$radius-md;
  background: rgba(61, 46, 31, 0.08);
  color: #5C4033;
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
}
.perm-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: t.$spacing-2;
  padding: 20rpx 24rpx;
  margin: t.$spacing-3 0;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
}
.perm-banner-left {
  display: flex; align-items: center; gap: t.$spacing-2;
  flex: 1; min-width: 0;
}
.perm-banner-text { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.perm-banner-title {
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.perm-banner-sub {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}
.hint-banner {
  padding: 16rpx 24rpx;
  border-radius: t.$radius-md;
  border: 2rpx dashed t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
  font-size: t.$font-xs;
  line-height: 1.5;
}
.upload-status { padding: 24rpx; background: #fbefeb; border-radius: 16rpx; color: t.$color-danger; font-size: t.$font-sm; display: flex; flex-direction: column; gap: 16rpx; }

// ---- 4 张模式卡 ----
.mode-list {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-3;
}
.mode-card {
  display: flex;
  align-items: center;
  gap: t.$spacing-3;
  padding: t.$spacing-3 t.$spacing-3;
  border-radius: t.$radius-card;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  box-shadow: t.$shadow-soft;
}
.mode-card.busy { opacity: 0.6; }
.mode-icon {
  width: 88rpx; height: 88rpx;
  border-radius: 50%;
  background: #EDE4D8;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mode-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.mode-name {
  font-size: t.$font-md;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.mode-desc {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  line-height: 1.5;
}
.mode-progress {
  margin-top: 4rpx;
  font-size: t.$font-xs;
  color: t.$color-accent;
  font-weight: t.$weight-bold;
}
.mode-chevron {
  flex-shrink: 0;
  opacity: 0.6;
}

// ---- 折叠区 ----
.section {
  border-top: 2rpx solid t.$color-border;
  padding-top: t.$spacing-3;
  margin-top: t.$spacing-2;
}
.section-toggle {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: t.$font-sm;
  color: t.$color-text-mute;
}
.toggle-arrow { margin-left: auto; }
.section-body {
  margin-top: t.$spacing-3;
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
}
.hint-text {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  line-height: 1.5;
}
.err-text {
  font-size: t.$font-xs;
  color: t.$color-danger;
}
.input {
  height: 80rpx;
  padding: 0 t.$spacing-3;
  border-radius: t.$radius-md;
  border: 2rpx solid t.$color-border;
  background: t.$color-bg;
  font-size: t.$font-sm;
  color: t.$color-text;
}
.btn-primary {
  align-self: flex-start;
  height: 72rpx;
  line-height: 72rpx;
  padding: 0 t.$spacing-5;
  border-radius: t.$radius-pill;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
}
.btn-primary.disabled { opacity: 0.4; }

// ---- 音频录制悬浮层 ----
.recording-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: t.$spacing-4;
  z-index: 80;
}
.recording-card {
  background: t.$color-surface;
  border-radius: t.$radius-card;
  padding: t.$spacing-5 t.$spacing-4;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: t.$spacing-3;
  width: 100%;
  max-width: 600rpx;
  box-shadow: t.$shadow-pop;
}
.recording-dot {
  width: 20rpx; height: 20rpx;
  border-radius: 50%;
  background: #C13939;
  animation: rec-pulse 1s infinite alternate;
}
@keyframes rec-pulse { from { opacity: 0.4; } to { opacity: 1; } }
.recording-time {
  font-size: 48rpx;
  font-weight: t.$weight-bold;
  color: t.$color-text;
  font-family: monospace;
}
.recording-hint {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  text-align: center;
}
</style>
