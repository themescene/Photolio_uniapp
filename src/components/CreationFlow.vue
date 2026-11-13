<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 创作流程 —— 抽出来给 pages/create + pages/upload 共享。
 *
 * 参考：annualreport/src/views/UploadView.vue 的 UPLOAD / COMPOSE 状态机
 * 与 pages/create/index.vue 完全等价，差异由 props 控制：
 *   - mode "page"：取消按钮 navigateBack
 *   - mode "tab" ：取消按钮回到 UPLOAD 步骤（tab 不能 navigateBack）
 */
import { ref, computed, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import MediaPicker from "@/components/MediaPicker.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import SvgIcon from "@/components/SvgIcon.vue";
import { useAuthStore } from "@/stores/auth";
import { useCreation } from "@/composables/useCreation";
import { useRecorder } from "@/composables/useRecorder";
import { useStyleStream } from "@/composables/useStyleStream";
import { processRound } from "@/api/round";
import { bindPresetToShare } from "@/api/nfc";
import { mpToH5Code } from "@/api/auth";
import { logger } from "@/utils/logger";
import { STORAGE_KEYS, H5_PICK_MAX, STATIC_BASE, qrImageUrl } from "@/config/env";
import { readPending, clearPending } from "@/utils/media";
import type { StyleKey, TemplateType } from "@/types";

// 上传 / 创作必须先登录：画匣子需要绑定到用户账号才能保存。
// 防止用户花时间填完内容，到点「生成」才发现未登录被驳回（u1 痛点）；
// 同时也避免未登录态下上传视频 → 后端 401 / 配额查询失败（u2）。
const auth = useAuthStore();
const { isLoggedIn } = storeToRefs(auth);

function goLogin() {
  uni.navigateTo({ url: "/pages/auth/login" });
}

// 错误弹窗的「取消」：仅退出 error 态，保留 prepared / videos / text / audio
// 不再 creation.clear() —— 之前那么做相当于「点取消 = 内容全没」，用户实测吐槽
function dismissError() {
  creation.dismissError();
}

const props = withDefaults(defineProps<{
  mode?: "page" | "tab";
}>(), { mode: "page" });

type Step = "UPLOAD" | "COMPOSE";

const step = ref<Step>("UPLOAD");
const images = ref<string[]>([]);
const text = ref("");
// 2026-08-08 hotfix14：新建流程新增【标题】字段（选填），落到 episodes[0].copywriting.h1
// 留空则 useCreation.generate 用当天日期 "YYYY-MM-DD" 兜底
const titleInput = ref("");

const autoPlayAudio = ref(true);
const groupId = ref<string | null>(null);
const pendingGroupName = ref<string | null>(null);
const personalPinned = ref(false);
// 2026-08-08 hotfix14：默认原图模式（用户 2026-08-08 拍板）——
// 影楼场景 / 亲友回忆场景对画质极敏感，默认应保原图；用户可手动到设置里关掉换取速度/额度
const originalQuality = ref(true);
const authorDisplayName = ref("");
const preferredTemplate = ref<TemplateType | "">("");
const settingsOpen = ref(false);

// 创作模式（2026-07-13 加）：memory=单份回忆 / group=追加章节到合集 / album=相册（本轮 UI 占位，backend 未落地）
type CreationMode = "memory" | "group" | "album";
const creationMode = ref<CreationMode>("memory");

// 2026-09-14：选图上限。相册模式在 H5 上走浏览器 multiple input，没有微信的张数硬限；
// 回忆模式固定 9 张（模板排版契约）。
const albumPickMax = computed(() => {
  if (creationMode.value !== "album") return 9;
  // #ifdef H5
  return H5_PICK_MAX;
  // #endif
  // #ifndef H5
  return 99;
  // #endif
});
// 有 pendingGroupId 时自动锁定为 group 模式（追加章节场景）
watch(pendingGroupName, (v) => {
  if (v) creationMode.value = "group";
});
// 切换到 album 模式时自动开启原图（用户要求相册模式默认原图）
watch(creationMode, (v) => {
  if (v === "album") originalQuality.value = true;
});

// 「追加章节」入口：share/play 写了 pendingGroupId，这里启动时读出来预填
// 用 readPending 包装：超过 60 分钟未消费自动过期，避免漫游污染下次新建画匣子
function consumePendingGroup() {
  const gid = readPending<string>(STORAGE_KEYS.PENDING_GROUP_ID);
  if (gid) {
    groupId.value = gid;
    personalPinned.value = false;
    const gname = readPending<string>(STORAGE_KEYS.PENDING_GROUP_NAME);
    if (gname) pendingGroupName.value = gname;
    clearPending(STORAGE_KEYS.PENDING_GROUP_ID);
    clearPending(STORAGE_KEYS.PENDING_GROUP_NAME);
  }
}

onMounted(() => {
  // 仅登录态消费 pending —— 否则未登录被拦截，登录回来时 pending 已被清掉，
  // 「追加章节」入口失效
  if (isLoggedIn.value) consumePendingGroup();
});

// 用户从未登录 → 登录 → 回到本页，再消费 pending（readPending 自带 60min TTL 兜底）
// 同时 kick off 之前 deferred 的图片 / 视频上传（用户未登录时只存了 localPath）
watch(isLoggedIn, (v, prev) => {
  logger.info('[creation-flow] isLoggedIn 变化', { from: prev, to: v });
  if (v && !prev) {
    logger.info('[creation-flow] 检测到登录态切换 false→true，触发 consumePending + resumePending');
    consumePendingGroup();
    creation.resumePending();
  }
});

const STYLES: StyleKey[] = ["独白", "家书", "给兄弟", "给闺蜜"];
// 默认 null = 原文（对齐网页版）。**绝对不要**初始化成 '独白' 否则强制套文风
const activeStyle = ref<StyleKey | null>(null);
const styleStream = useStyleStream();

// 2026-08-11 R0：AI 只做一次 tone 转换（就是 pickStyle 触发的这次流式改写）；
//   改写结果直接写进 text.value，成为新 textbox 内容；save 阶段不允许 AI 再改。
//   之前 originalTypedText 快照的双轨制是我上轮凭空诊断错，真正的二道润色是
//   save 阶段 generate-report 又跑了一遍 style_guides —— 已在 useCreation.generate 强制覆盖 body 修掉。
watch(() => styleStream.streamedText.value, (v) => {
  if (styleStream.styling.value && v) text.value = v;
});

const creation = useCreation();
// 每次 originalQuality 变化都同步给 useCreation —— 之后 addVideo 走的编码/上传链
// 会读这个 flag（跳过前端压缩 + 上传时带 original_quality=1）
watch(originalQuality, (v) => creation.setOriginalQuality(v), { immediate: true });
const phase = creation.phase;
const prepared = creation.prepared;
const videos = creation.videos;
const uploadProgress = creation.uploadProgress;
const allUploaded = creation.allUploaded;
const firstAnalyzed = creation.firstAnalyzed;
// 录音按钮是否可用：有图时看 firstAnalyzed；video-only 时看视频缩略图是否就绪
// —— 不然用户加了视频没图，永远点不动录音（hotfix7-A 修的第二个坑）
const canRecord = computed(() => {
  if (prepared.value.length > 0) return firstAnalyzed.value;
  return videos.value.some((v) => v.uploadDone && !!v.thumbnailUrl);
});
const analyzeReady = creation.analyzeReady;
const allVideosReady = creation.allVideosReady;
const errorMessage = creation.errorMessage;
const stageMessage = creation.stageMessage;
const styling = styleStream.styling;

const isBusy = computed(() => ['generating', 'saving', 'analyzing'].includes(phase.value));
// 允许 video-only 也能下一步：只要有图或有视频之一就可以
const canGoCompose = computed(() => images.value.length > 0 || videos.value.length > 0);
const canSubmit = computed(() =>
  !isBusy.value && !styling.value && !isRecording.value && !asrLoading.value
  && (prepared.value.length > 0 || videos.value.length > 0)
  && allVideosReady.value
);

const audioInfo = ref<{ url: string; duration: number } | null>(null);
const asrLoading = ref(false);

const recorder = useRecorder({
  onAudioReady: async ({ tempFilePath, duration, format }) => {
    // 调试用：把客户端拿到的 duration 直接打到 console，便于定位"backend 说 0s"是
    // ①客户端录音本身就 0s 还是 ②客户端 X 秒但 backend 读成 0
    logger.info('[creation-flow] onAudioReady', {
      tempFilePath: tempFilePath?.slice(-40),
      clientDuration: duration,
      format,
    });
    // 先用客户端拿到的 duration 兜底占位（UI 立刻显示"已录 Xs"，不等 ASR 完再显示）
    audioInfo.value = { url: "", duration };
    // 后端 process-round 要求 image_already_uploaded=true 时必须带 image_url。
    // video-only 场景（没图只有视频）走视频缩略图作 image_url —— hotfix7-A：修用户
    // 反馈的「无论传没传图都提示请等图片处理」bug（video-only 时 prepared[0] 是 undefined）
    const firstImageUrl =
      prepared.value[0]?.imageUrl ||
      videos.value.find((v) => v.uploadDone && v.thumbnailUrl)?.thumbnailUrl ||
      "";
    if (!firstImageUrl) {
      // 分别提示：有图但还没传完 vs 完全没有素材
      const hasAnyMedia = prepared.value.length > 0 || videos.value.length > 0;
      uni.showToast({
        title: hasAnyMedia ? "请等图片 / 视频处理完再录音" : "请先加一张图或视频",
        icon: "none",
      });
      return;
    }
    // 音频时长下限已在后端完全取消（round_service.py）—— 之前的 <3s / <4s 拦截
    // 因 mp-weixin mp3 header 不完整导致 mutagen 读到 0.0s 反复误伤真实的 10s+ 录音，
    // 用户明确要求取消下限。ASR 若真处理不了会自己返回空 transcript，不重复拦。
    asrLoading.value = true;
    try {
      const r = await processRound({
        sessionId: creation.sessionId.value,
        roundIndex: 0,
        audioFilePath: tempFilePath,
        imageAlreadyUploaded: true,
        imageUrl: firstImageUrl,
        lang: "zh",
      });
      logger.info('[creation-flow] processRound ok', {
        asrLen: r.asr_text?.length || 0,
        backendDuration: r.audio_duration,
        clientDuration: duration,
      });
      if (!r.asr_text?.trim()) throw new Error('未识别到语音，请重新录制')
      if (r.asr_text) text.value = (text.value ? text.value + "\n" : "") + r.asr_text;
      // 关键：backend 拿到 mp-weixin mp3 header 不全时 audio_duration=0 —— 此时用客户端
      // 计时的 duration 作为兜底展示，避免用户看到"已录 0s"以为录音失败
      audioInfo.value = {
        url: r.audio_url,
        duration: r.audio_duration > 0 ? r.audio_duration : duration,
      };
    } catch (e) {
      logger.warn("[creation-flow] asr fail", e);
      // 把后端真实原因（如"音频时长少于10秒"/"未识别到语音"）透出，便于用户对症调整
      const raw = e instanceof Error ? e.message : "";
      const msg = raw && !/[a-zA-Z]{4,}/.test(raw) ? raw : "语音识别失败，请重试";
      uni.showToast({ title: msg, icon: "none", duration: 3000 });
    } finally {
      asrLoading.value = false;
    }
  },
  onError: (msg) => uni.showToast({ title: msg, icon: "none" }),
});
const { isRecording, recordingTime, formatRecordingTime } = recorder;

// 2026-07-15：MediaPicker 在 album 模式下走 chooseMessageFile，能拿到真实文件名（如 IMG_20250712_143022.jpg）
// 存 tempFilePath → originalName 的映射，prepareImages 时透传给 useCreation → 后端 formData.original_filename
const pickedFileNames = ref<Record<string, string>>({});
function onPicked(files: Array<{ path: string; name: string }>) {
  const map: Record<string, string> = { ...pickedFileNames.value };
  for (const f of files) {
    if (f.path && f.name) map[f.path] = f.name;
  }
  pickedFileNames.value = map;
}

function onMediaChange(arr: string[]) {
  images.value = arr;
  logger.info('[creation-flow] 选图变化', {
    count: arr.length,
    step: step.value,
    mode: creationMode.value,
    isLoggedIn: isLoggedIn.value,
    namedCount: Object.keys(pickedFileNames.value).length,
  });
  if (step.value !== "UPLOAD") return;
  // 相册模式：直接留在 UPLOAD，只 prepareImages 后台上传；用户点「保存相册」触发 submit
  // 不进 COMPOSE（文本 / 录音 / 文风 / 模板全不需要）
  if (creationMode.value === "album") {
    if (arr.length > 0) creation.prepareImages(arr, pickedFileNames.value);
    return;
  }
  if (arr.length > 0) {
    step.value = "COMPOSE";
    logger.info('[creation-flow] 进入 COMPOSE 步骤');
    creation.prepareImages(arr, pickedFileNames.value);
  } else if (videos.value.length > 0) {
    // video-only：没有图也允许进 compose；prepareImages([]) 自身会 early-return
    // generate 时会把视频缩略图当成"视觉素材"喂给 generate-report
    step.value = "COMPOSE";
  }
}

function resetAll() {
  step.value = "UPLOAD";
  images.value = [];
  text.value = "";
  titleInput.value = "";
  audioInfo.value = null;
  activeStyle.value = null;
  creation.clear();
}

function goBackToUpload() {
  if (isBusy.value || isRecording.value) {
    uni.showToast({ title: "正在处理中，稍后再返回", icon: "none" });
    return;
  }
  resetAll();
}

async function pickStyle(s: StyleKey) {
  if (styleStream.styling.value) return;
  if (s === activeStyle.value) return;
  activeStyle.value = s;

  // 2026-09-14 用户契约：默认不识图；**只有用户切换了文风才识图**。
  // 这里非阻塞地补一次首图视觉分析（走 /analyze-image-url 分析已上传的 URL，
  // 不重传原图），让接下来的 apply-style / generate-report 有 visual_tags 可用。
  // 失败或还没传完都只是少了标签，不影响文风切换和保存。
  void creation.analyzeFirstImage();

  if (!text.value.trim()) return;
  try {
    // 2026-08-11 R0 硬性契约（用户明文要求）：
    //   AI 只做一次 tone 转换 —— 就是此刻用户点击 pill 触发的这次 apply-style 流式改写。
    //   改写后的结果**直接写进 text.value**，成为新的 textbox 内容。
    //   用户可以继续在 textbox 里增删改。之后点保存时，body = text.value（就是这一刻的 textbox 内容）。
    //   **绝对不能保留 pre-style 快照送到 save-share** —— 之前 originalTypedText 逻辑
    //   是为了修一个我上轮凭空诊断错的"二道润色"，其实真正的二道润色是 save 阶段
    //   generate-report 又用 style_guides 再改一次（已在 useCreation.generate 强制覆盖 body 修掉）。
    const before = text.value;
    await styleStream.apply(before, s);
  } catch (e) {
    logger.warn("[creation-flow] style stream failed", e);
    uni.showToast({ title: "文风切换失败", icon: "none" });
  }
}

// 「原文」pill：清掉当前 activeStyle，text.value 保持不动（用户已经接受当前显示的内容）
// 想恢复原文，用户自己在 textbox 手动编辑或撤销
function clearStyle() {
  if (styleStream.styling.value) styleStream.abort();
  activeStyle.value = null;
}

// 本地提交锁：useCreation.generate 里 phase 变化有滞后（要等 analyze/video 分支才切），
// 期间 canSubmit 仍是 true → 用户连点会重复触发 8+ 次 save-share（见用户实测日志）。
// 顶部这个 submitting ref 一进函数立刻置 true，函数出口 finally 释放，杜绝重入。
const submitting = ref(false);

// 2026-09-25：mp-weixin 端"去完整网页版上传"入口 —— 生成一次性 exchange_code + 拼 H5 URL。
// 展示 QR + 复制按钮。用户长按 QR "识别→复制链接→到浏览器打开"，或点复制手动去浏览器。
// H5 端 App.vue landing 检测 ?exchange_code=xxx 自动无感登录。突破 mp 端 9 张选图 + EXIF 丢失两个硬伤。
const h5UploadLink = ref("");
const h5UploadQrSrc = ref("");
const h5LinkLoading = ref(false);
const h5LinkExpanded = ref(false);
async function _prepareH5UploadLink() {
  if (h5LinkLoading.value) return;
  if (h5UploadLink.value) { h5LinkExpanded.value = true; return; }
  // #ifdef MP-WEIXIN
  h5LinkLoading.value = true;
  try {
    const r = await mpToH5Code();
    if (!r?.code) throw new Error("空 code");
    // H5 landing 读 ?exchange_code=xxx 自动登录 → 跳上传 tab；scene=upload 明示意图
    const url = `${STATIC_BASE}/?exchange_code=${encodeURIComponent(r.code)}&scene=upload#/pages/upload/index`;
    h5UploadLink.value = url;
    h5UploadQrSrc.value = qrImageUrl(url, 480);
    h5LinkExpanded.value = true;
    logger.info("[creation-flow] H5 upload link ready", { url });
  } catch (e) {
    logger.warn("[creation-flow] mpToH5Code 失败", e);
    uni.showToast({ title: "生成失败，请重试", icon: "none" });
  } finally {
    h5LinkLoading.value = false;
  }
  // #endif
}
function onCopyH5UploadLink() {
  if (!h5UploadLink.value) return;
  // #ifdef MP-WEIXIN
  const _wx = wx as unknown as { setClipboardData?: (o: { data: string; success?: () => void; fail?: () => void }) => void };
  _wx.setClipboardData?.({
    data: h5UploadLink.value,
    success: () => uni.showToast({ title: "链接已复制，去浏览器粘贴打开", icon: "none", duration: 2500 }),
    fail: () => uni.showToast({ title: "复制失败，请长按二维码识别", icon: "none" }),
  });
  // #endif
}

async function onSubmit() {
  if (submitting.value) {
    logger.info('[creation-flow] 「生成」被重复点击，已在提交中，忽略');
    return;
  }
  logger.info('[creation-flow] 点击「生成」', {
    canSubmit: canSubmit.value,
    isLoggedIn: isLoggedIn.value,
    phase: phase.value,
    images: prepared.value.length,
    videos: videos.value.length,
    textLen: text.value.length,
    hasAudio: !!audioInfo.value?.url,
  });
  if (!canSubmit.value) {
    logger.warn('[creation-flow] 「生成」按钮被点击但 canSubmit=false，忽略', {
      isBusy: isBusy.value,
      styling: styling.value,
      isRecording: isRecording.value,
      allVideosReady: allVideosReady.value,
    });
    return;
  }
  submitting.value = true;
  try {
  // 审核合规：进入流程不强制登录（用户可以先体验「选图/写文字/录音」），
  // 但保存到账号必须登录——这里做一次性 preflight。
  // navigateTo 保留 CreationFlow 页面状态，登录回来 step/images/text 都还在
  if (!isLoggedIn.value) {
    logger.info('[creation-flow] 未登录，弹 preflight 登录 modal');
    uni.showModal({
      title: "登录后即可保存",
      content: "画匣子需要保存到你的账号才能在「我的」中查看和编辑；登录后会回到这里，已选的图片和文字都还在",
      confirmText: "去登录",
      cancelText: "暂不",
      success: (r) => {
        logger.info('[creation-flow] preflight modal 关闭', { confirm: r.confirm });
        if (r.confirm) uni.navigateTo({ url: "/pages/auth/login" });
      },
    });
    return;
  }
  // 2026-07-13：NFC 页给「画匣子」模式预设了 visibility / access_level，读出来传给 save-share
  let nfcVisibility: 0 | 1 | 2 | 3 | undefined;
  let nfcAccessLevel: 0 | 1 | 2 | undefined;
  try {
    const v = uni.getStorageSync(STORAGE_KEYS.PENDING_NFC_VISIBILITY);
    if (v === 0 || v === 1 || v === 2 || v === 3) nfcVisibility = v;
    const a = uni.getStorageSync(STORAGE_KEYS.PENDING_NFC_ACCESS_LEVEL);
    if (a === 0 || a === 1 || a === 2) nfcAccessLevel = a;
  } catch { /* ignore */ }
  // 2026-08-11 R0 硬性契约：body = 用户点击提交那一刻 textbox 里的内容。
  //   如果用户之前应用过文风滤镜，text.value 已经是流式改写后的版本 —— 就用这个。
  //   如果用户之后手动编辑了 —— text.value 就是编辑后的，用这个。
  //   useCreation.generate 内部拿到 opts.text 后会**强行**覆盖到 episode.body，
  //   绝对不允许 save-share 阶段任何 AI 二次修改。
  const bodyAtSubmit = text.value.trim();
  logger.info('[text-trace] onSubmit-body-snapshot', {
    bodyLen: bodyAtSubmit.length,
    bodyPreview: bodyAtSubmit.slice(0, 80),
    activeStyle: activeStyle.value,
  });
  const saved = await creation.generate({
    text: bodyAtSubmit,
    title: titleInput.value.trim(),
    audioUrl: audioInfo.value?.url || "",
    audioDuration: audioInfo.value?.duration || 0,
    style: activeStyle.value,
    preferredTemplate: (preferredTemplate.value || undefined) as TemplateType | undefined,
    groupId: groupId.value,
    autoPlayAudio: autoPlayAudio.value,
    personalPinned: personalPinned.value,
    originalQuality: originalQuality.value,
    authorDisplayName: authorDisplayName.value.trim(),
    shareType: creationMode.value === "album" ? "album" : "memory",
    visibility: nfcVisibility,
    accessLevel: nfcAccessLevel,
  });
  if (saved) {
    try { uni.setStorageSync("photolio_last_played_share", saved.share_id); } catch { /* ignore */ }
    // 主页脏标 —— index/index.vue 的 onShow 看到就会清 tab 缓存重拉
    // 修「上传完不会自动刷新，找不到刚传的东西」
    try { uni.setStorageSync(STORAGE_KEYS.HOME_DIRTY, true); } catch { /* ignore */ }

    // 「NFC 图文模式」收尾：NFC tab 把 PENDING_PRESET_ID 写入 storage，这里成功 save-share 后
    // 自动 bind share → preset，与网页端 NfcLandingView.vue:330+ 的 addToHistory bind 路径一致
    const pendingPreset = readPending<string>(STORAGE_KEYS.PENDING_PRESET_ID) || "";
    // 2026-08-11：区分"绑定成功 / 绑定失败"，避免失败也 reLaunch 去 nfc/landing 展示 stale 内容（Bug 5）
    let bindSucceeded = false;
    if (pendingPreset && saved.share_id) {
      try {
        await bindPresetToShare(pendingPreset, saved.share_id);
        bindSucceeded = true;
        clearPending(STORAGE_KEYS.PENDING_PRESET_ID);
        // 权限也是一次性设置，绑完清理，避免下次新建画匣子沿用
        try { uni.removeStorageSync(STORAGE_KEYS.PENDING_NFC_VISIBILITY); } catch { /* ignore */ }
        try { uni.removeStorageSync(STORAGE_KEYS.PENDING_NFC_ACCESS_LEVEL); } catch { /* ignore */ }
        uni.showToast({ title: "已绑定到 NFC 卡", icon: "success" });
      } catch (e) {
        logger.warn("[creation-flow] preset bind failed", e);
        // 关键：清掉 pending，避免下次任意保存流程又意外触发绑定
        clearPending(STORAGE_KEYS.PENDING_PRESET_ID);
        try { uni.removeStorageSync(STORAGE_KEYS.PENDING_NFC_VISIBILITY); } catch { /* ignore */ }
        try { uni.removeStorageSync(STORAGE_KEYS.PENDING_NFC_ACCESS_LEVEL); } catch { /* ignore */ }
        uni.showToast({
          title: "已保存，NFC 绑定失败，可去 NFC 页重试",
          icon: "none",
          duration: 3500,
        });
      }
    } else {
      uni.showToast({ title: "已保存", icon: "success" });
    }

    setTimeout(() => {
      if (pendingPreset && bindSucceeded) {
        // 绑定成功 → 跳 NFC landing 看绑定后的效果
        uni.reLaunch({ url: `/pages/nfc/landing?uid=${encodeURIComponent(pendingPreset)}` });
      } else if (saved.share_id) {
        // p1 fix：保存成功后直接进入该画匣子的播放页，而不是回主页
        // 用户实测反馈：「保存成功后看不到刚做的画匣子，被丢回主页很迷茫」
        // tab 模式同样直接跳——reLaunch 清栈避免播放页 navigateBack 回到上传草稿
        if (props.mode === "tab") resetAll();
        // 相册模式跳专用相册播放页；其他模式沿用 share/play
        const targetUrl = creationMode.value === "album"
          ? `/pages/album/index?id=${encodeURIComponent(saved.share_id)}`
          : `/pages/share/play?id=${encodeURIComponent(saved.share_id)}`;
        uni.reLaunch({ url: targetUrl });
      } else if (props.mode === "tab") {
        resetAll();
        uni.switchTab({ url: "/pages/index/index" });
      } else {
        uni.switchTab({ url: "/pages/index/index" });
      }
    }, 800);
  }
  } finally {
    submitting.value = false;
  }
}

function onCancel() {
  if (isBusy.value) return;
  if (props.mode === "tab") {
    resetAll();
  } else {
    uni.navigateBack();
  }
}

// 首次录音必须弹独立的《声纹授权协议》授权 modal（合规审核 2026-07-16 要求：
// "取得用户授权同意后才可获取声纹信息"）。同意后写 VOICEPRINT_CONSENT storage，
// 之后同一账号内不再重复弹窗。
function ensureVoiceprintConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    let agreed = false;
    try { agreed = !!uni.getStorageSync(STORAGE_KEYS.VOICEPRINT_CONSENT); } catch { /* ignore */ }
    if (agreed) return resolve(true);
    uni.showModal({
      title: "声纹授权",
      content:
        "画匣子仅将本次录音用于「语音转文字」并保存到您的画匣子里，绝不用于声纹识别、身份认证或 AI 模型训练。详见《声纹授权协议》。",
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

async function toggleRecord() {
  if (isRecording.value) {
    recorder.stopRecording();
    return;
  }
  // 未登录：录音需要 ASR，走 process-round 需 token。之前让游客先录再拦，
  // 会一直弹"请等图片/视频处理完再录音"（因为图未上传所以 imageUrl 空），
  // 用户明确要求「非登录直接禁用录音」。这里在触发录音前直接拦。
  if (!isLoggedIn.value) {
    uni.showToast({ title: "登录后可录音", icon: "none", duration: 2000 });
    return;
  }
  // 已登录但图/视频还没处理完 —— canRecord 已经判断了 firstAnalyzed / video ready
  if (!canRecord.value) {
    const hasAnyMedia = prepared.value.length > 0 || videos.value.length > 0;
    uni.showToast({
      title: hasAnyMedia ? "请等图片 / 视频处理完再录音" : "请先加一张图或视频",
      icon: "none",
      duration: 2000,
    });
    return;
  }
  const ok = await ensureVoiceprintConsent();
  if (!ok) return;
  recorder.startRecording();
}

// —— COMPOSE 阶段：追加 / 删除单张图片 ——
function onAddMoreImages() {
  if (!isLoggedIn.value) {
    uni.showToast({ title: "请先登录", icon: "none", duration: 2500 });
    setTimeout(goLogin, 500);
    return;
  }
  // 2026-09-14：上限随「创作模式 + 平台」走，不再写死 9。
  // - 回忆模式：9 张（模板排版契约，未变）
  // - 相册模式：mp-weixin 受微信 chooseMedia 20 张硬限；H5 是浏览器 multiple input，无限制
  let cap = 9;
  if (creationMode.value === "album") {
    // #ifdef H5
    cap = H5_PICK_MAX;
    // #endif
    // #ifndef H5
    cap = 20;
    // #endif
  }
  const remain = cap - prepared.value.length;
  if (remain <= 0) {
    uni.showToast({
      title: creationMode.value === "album"
        ? `本次最多 ${cap} 个，可分批继续追加`
        : "最多 9 张",
      icon: "none", duration: 3000,
    });
    return;
  }
  logger.info("[creation-flow] onAddMoreImages chooseMedia start", { remain, original: originalQuality.value });
  // #ifdef H5
  // H5：uni.chooseMedia 未在 uni-h5 实现（"is not a function"）；改用 uni.chooseImage → 底层 DOM input
  uni.chooseImage({
    count: remain,
    sourceType: ["album", "camera"],
    sizeType: originalQuality.value ? ["original"] : ["original", "compressed"],
    success: (res) => {
      logger.info("[creation-flow] onAddMoreImages h5 success", { count: res.tempFilePaths?.length });
      (res.tempFilePaths || []).forEach((p) => creation.addImage(p));
    },
    fail: (err) => {
      logger.warn("[creation-flow] onAddMoreImages h5 fail", err);
      const msg = String(err?.errMsg || "");
      if (!/cancel/i.test(msg)) {
        const safe = /[a-zA-Z]{4,}/.test(msg) ? "选择失败，请重试" : msg;
        uni.showToast({ title: safe, icon: "none", duration: 3000 });
      }
    },
  });
  return;
  // #endif
  // #ifndef H5
  // 2026-07-19 hotfix11：原图模式必须传 sizeType:["original"]，否则微信客户端会返回压过的版本
  // —— 之前硬编码 ["compressed"]，即便前端跳过压缩也只是"不再二次压缩已压过的版本"，用户吐槽"原图仍模糊"
  // 注意：mp-weixin 的 sizeType:["original"] 也仍会被微信客户端 lossy 转码（EXIF 部分保留）；真原图路径是 MediaPicker 里的 chooseMessageFile
  uni.chooseMedia({
    count: remain,
    mediaType: ["image"],
    sourceType: ["album", "camera"],
    sizeType: originalQuality.value ? ["original"] : ["compressed"],
    success: (res) => {
      logger.info("[creation-flow] onAddMoreImages success", { count: res.tempFiles?.length });
      res.tempFiles.forEach((f) => creation.addImage(f.tempFilePath));
    },
    fail: (err) => {
      logger.warn("[creation-flow] onAddMoreImages fail", err);
      const msg = err?.errMsg || "";
      if (!/cancel/i.test(msg)) uni.showToast({ title: msg, icon: "none", duration: 3000 });
    },
  });
  // #endif
}

// 追加视频：选 → useCreation 全程后台跑（本地压 → 上传 → 转码轮询）
function onAddVideo() {
  if (!isLoggedIn.value) {
    uni.showToast({ title: "登录后可上传视频", icon: "none", duration: 2500 });
    return;
  }
  if (videos.value.length >= 3) {
    uni.showToast({ title: "一份回忆里最多放 3 段视频", icon: "none" });
    return;
  }
  logger.info("[creation-flow] onAddVideo chooseMedia start");
  // #ifdef H5
  uni.chooseVideo({
    sourceType: ["album", "camera"],
    maxDuration: 60,
    success: (res) => {
      logger.info("[creation-flow] onAddVideo h5 success", { size: res.size });
      if ((res.size || 0) > 500 * 1024 * 1024) {
        uni.showToast({ title: "视频不能超过 500MB", icon: "none", duration: 3000 });
        return;
      }
      creation.addVideo(res.tempFilePath, undefined);
    },
    fail: (err) => {
      logger.warn("[creation-flow] onAddVideo h5 fail", err);
      const msg = String(err?.errMsg || "");
      if (!/cancel/i.test(msg)) {
        const safe = /[a-zA-Z]{4,}/.test(msg) ? "选择失败，请重试" : msg;
        uni.showToast({ title: safe, icon: "none", duration: 3000 });
      }
    },
  });
  return;
  // #endif
  // #ifndef H5
  uni.chooseMedia({
    count: 1,
    mediaType: ["video"],
    sourceType: ["album", "camera"],
    maxDuration: 60,
    success: (res) => {
      logger.info("[creation-flow] onAddVideo success", { size: res.tempFiles?.[0]?.size });
      const f = res.tempFiles?.[0];
      if (!f?.tempFilePath) return;
      if ((f.size || 0) > 500 * 1024 * 1024) {
        uni.showToast({ title: "视频不能超过 500MB", icon: "none", duration: 3000 });
        return;
      }
      // wx.chooseMedia 返回 thumbTempFilePath 是本地封面帧；传给 useCreation 作为封面兜底
      // （后端 ffmpeg 提帧偶尔失败 → 仅视频回忆没封面的历史问题就靠这条链路修）
      const thumbPath = (f as { thumbTempFilePath?: string }).thumbTempFilePath;
      creation.addVideo(f.tempFilePath, thumbPath);
    },
    fail: (err) => {
      logger.warn("[creation-flow] onAddVideo fail", err);
      const msg = err?.errMsg || "";
      if (!/cancel/i.test(msg)) uni.showToast({ title: msg, icon: "none", duration: 3000 });
    },
  });
  // #endif
}

function onRemoveVideo(idx: number) {
  creation.removeVideo(idx);
}

// 相册模式：backend share_type=album 已落地，点击直接切换
function onPickAlbumMode() {
  creationMode.value = "album";
  // 相册模式提示：文本录音都可以跳，纯上传媒体
  uni.showToast({
    title: "相册模式：仅上传媒体",
    icon: "none",
    duration: 1500,
  });
}

function onRemoveImage(idx: number) {
  if (idx === 0 && prepared.value.length > 1) {
    uni.showModal({
      title: "删除封面图？",
      content: "首图会作为封面，删除后以第二张为新封面",
      success: (r) => { if (r.confirm) creation.removeImage(0); },
    });
    return;
  }
  creation.removeImage(idx);
}

/** 点击失败蒙版 → 用同一张 localPath 重新触发一轮 addImage，让 uploadFile 的 3 次
 *  自动重试再走一遍。等价于「删掉重加」但保留位置感。 */
function onRetryImage(idx: number, it: { localPath: string; errorMsg?: string }) {
  logger.info("[creation-flow] 用户点击失败图重试", { idx, err: it.errorMsg });
  creation.removeImage(idx);
  creation.addImage(it.localPath);
}
</script>

<template>
  <view class="creation-flow" :class="{ 'is-tab': mode === 'tab' }">
    <!-- ============== UPLOAD 步骤 ============== -->
    <view v-if="step === 'UPLOAD'" class="upload-step">
      <view class="upload-topbar">
        <view class="upload-hero">
          <text class="title">{{ pendingGroupName ? uiText("追加章节") : uiText("新建画匣子") }}</text>
          <text class="hint">
            {{ pendingGroupName
              ? `追加到「${pendingGroupName}」`
              : creationMode === 'album'
                ? uiText("相册模式：多选无上限，自动原图，仅存图不编辑")
                : uiText("选 1–9 张照片开始，可选追加视频") }}
          </text>
        </view>
        <view class="settings-btn-prominent" @click="settingsOpen = true">
          <SvgIcon name="gear" size="32rpx" color="#F7F3EE" />
          <text class="settings-btn-label">{{ uiText("设置") }}</text>
        </view>
      </view>

      <!-- 2026-09-25：mp-weixin 相册模式底部小提示 —— 想保留 EXIF / 一次传 100+ 张？
           点开生成 QR，长按识别到浏览器打开完整 H5 版（H5 自动无感登录）。
           小程序内部上传保留（chooseMedia sizeType=original），只是 H5 版是"更完整"选项。 -->
      <!-- #ifdef MP-WEIXIN -->
      <view
        v-if="creationMode === 'album' && !pendingGroupName"
        class="h5-upload-hint"
      >
        <view v-if="!h5LinkExpanded" class="h5uh-collapsed" @click="_prepareH5UploadLink">
          <SvgIcon name="upload" size="28rpx" color="#6B5F52" />
          <text class="h5uh-title">{{ uiText("想保留 EXIF 或一次传 100+ 张？在浏览器打开完整网页版") }}</text>
          <text class="h5uh-arrow">›</text>
        </view>
        <view v-else class="h5uh-expanded">
          <text class="h5uh-hint-title">{{ uiText("长按二维码识别 → 在浏览器打开完整网页版") }}</text>
          <text class="h5uh-hint-sub">{{ uiText("网页版无 9 张限制、真 EXIF、原文件名。已自动带登录，打开就能传。") }}</text>
          <view class="h5uh-qr-wrap">
            <image v-if="h5UploadQrSrc" :src="h5UploadQrSrc" class="h5uh-qr" mode="aspectFit" show-menu-by-longpress />
          </view>
          <view class="h5uh-actions">
            <text class="h5uh-btn" @click="onCopyH5UploadLink">{{ uiText("复制链接") }}</text>
            <text class="h5uh-btn h5uh-btn-ghost" @click="h5LinkExpanded = false">{{ uiText("收起") }}</text>
          </view>
        </view>
      </view>
      <!-- #endif -->

      <!-- UPLOAD 主内容用 scroll-view 承载：之前用户反馈「屏底内容被下一步按钮和 tabbar 遮住无法完全查看」
           解法：topbar / actions-bar 保持在 flex 上下两端，中间 scroll-view flex:1 承载所有 section -->
      <scroll-view class="upload-scroll" scroll-y>
      <!-- A/B/C 三模式选择器：追加章节场景（有 pendingGroupName）时锁死为 group -->
      <view class="mode-tabs" v-if="!pendingGroupName">
        <view
          class="mode-tab"
          :class="{ active: creationMode === 'memory' }"
          @click="creationMode = 'memory'"
        >
          <text class="mode-title">{{ uiText("回忆") }}</text>

        </view>
        <view
          class="mode-tab"
          :class="{ active: creationMode === 'group' }"
          @click="creationMode = 'group'"
        >
          <text class="mode-title">{{ uiText("合集") }}</text>

        </view>
        <view
          class="mode-tab"
          :class="{ active: creationMode === 'album' }"
          @click="onPickAlbumMode"
        >
          <text class="mode-title">{{ uiText("相册") }}</text>

        </view>
      </view>
      <text v-if="!pendingGroupName" class="mode-description">{{ uiText(creationMode === 'memory' ? '图文记录回忆' : creationMode === 'group' ? '加入或新建合集' : '高清原图云相册') }}</text>
      <view class="mode-tabs-lock" v-else>
        <text class="mode-lock-hint">{{ uiText("追加章节 · 合集模式") }}</text>
      </view>
      <view class="section">
        <text class="section-label">
          {{ uiText("照片（") }}{{ images.length }} / {{ creationMode === 'album' ? '∞' : '9' }}）
        </text>
        <!-- 审核合规：未登录也能选图 → 进 COMPOSE → 写字 / 录音 / 选文风。
             只在点"生成"时拦登录（[CreationFlow.vue] onSubmit preflight modal）。
             chooseMedia 隐私接口已在小程序管理后台声明「相册/摄像头」，无需 manifest 声明。
             之前 hotfix 挡在门口是因为老基础库 toast 问题，manifest.json:60-72 说明已不需要。
             相册模式（album）：无 9 张上限，用户可多选批量上传。-->
        <!-- 2026-07-15：album 模式让 MediaPicker 弹 actionSheet（文件助手 / 相册二选一），
             拿到真名的 files 通过 @picked 事件带回来，透传给 useCreation 让上传时 originalFilename 生效 -->
        <MediaPicker
          :model-value="images"
          :max="albumPickMax"
          :readonly="false"
          :chooser-mode="creationMode === 'album' ? 'album' : 'default'"
          :original="originalQuality"
          @update:model-value="onMediaChange"
          @picked="onPicked"
        />
      </view>

      <!-- 视频也是一份回忆的内容；这里直接给入口，不用等进 compose 才发现 -->
      <!-- 未登录时隐藏视频区——审核要求"基础功能可体验"，视频不算基础（必须传服务端转码） -->
      <view v-if="isLoggedIn" class="section">
        <text class="section-label">{{ uiText("视频（可选，") }}{{ videos.length }} / 3）</text>
        <view class="video-tiles">
          <view
            v-for="(v, idx) in videos"
            :key="'uv'+idx"
            class="vtile"
          >
            <image
              v-if="v.thumbnailUrl"
              :src="v.thumbnailUrl"
              mode="aspectFill"
              class="vtile-img"
            />
            <view v-else class="vtile-mask">
              <SvgIcon name="play" size="36rpx" color="#F7F3EE" />
            </view>
            <view v-if="!v.uploadDone" class="vtile-mask">
              <text>{{ uiText("上传") }} {{ v.uploadProgress }}%</text>
            </view>
            <view v-else-if="v.transcoding" class="vtile-mask">
              <text>{{ uiText("转码中…") }}</text>
            </view>
            <view v-if="v.failed" class="vtile-mask err"><text>{{ uiText("失败") }}</text></view>
            <view class="vtile-remove" @click.stop="onRemoveVideo(idx)">
              <SvgIcon name="close" size="24rpx" color="#F7F3EE" />
            </view>
          </view>
          <view
            v-if="videos.length < 3"
            class="vtile vtile-add"
            @click="onAddVideo"
          >
            <SvgIcon name="play" size="40rpx" color="#A89A8A" />
            <text class="vtile-hint">{{ uiText("加视频") }}</text>
          </view>
        </view>
        <text class="preview-hint" v-if="videos.length > 0">{{ uiText("视频会在后台压缩、上传、转码；保存时若未完成会自动等") }}</text>
      </view>

      <!-- 设置概览：每个 chip 一项，点 chip 直接打开设置面板 -->
      <view class="section">

        <view class="settings-chips" @click="settingsOpen = true">
          <view class="chip" :class="{ on: autoPlayAudio }">
            <text class="chip-key">{{ uiText("自动播放") }}</text>
            <text class="chip-val">{{ autoPlayAudio ? uiText("开") : uiText("关") }}</text>
          </view>
          <view class="chip" :class="{ on: originalQuality }">
            <text class="chip-key">{{ uiText("原图") }}</text>
            <text class="chip-val">{{ originalQuality ? uiText("开") : uiText("压缩") }}</text>
          </view>
          <view class="chip" :class="{ on: !!groupId }">
            <text class="chip-key">{{ uiText("保存到") }}</text>
            <text class="chip-val">{{ groupId ? (personalPinned ? uiText("我的+合集") : uiText("仅合集")) : uiText("仅我的") }}</text>
          </view>
        </view>

      </view>

      <!-- 尾部 spacer：留给 fixed actions-bar + tabbar，避免最后 chip 被遮 -->
      <view class="upload-bottom-spacer" />
      </scroll-view>

      <view class="actions-bar">
        <button v-if="mode === 'page'" class="btn btn-ghost" @click="onCancel"><text>{{ uiText("取消") }}</text></button>
        <!-- 相册模式：直接「保存相册」，跳过 COMPOSE；其他模式：「下一步」进 COMPOSE -->
        <button
          v-if="creationMode === 'album'"
          class="btn btn-primary"
          :disabled="!canSubmit"
          :loading="isBusy"
          @click="onSubmit"
        >
          <text v-if="isLoggedIn && !allUploaded && prepared.length > 0">{{ uiText("上传中…") }}</text>
          <text v-else>{{ uiText("保存相册") }}</text>
        </button>
        <button
          v-else
          class="btn btn-primary"
          :disabled="!canGoCompose"
          @click="onMediaChange(images)"
        ><text>{{ uiText("下一步") }}</text></button>
      </view>
    </view>

    <!-- ============== COMPOSE 步骤 ============== -->
    <view v-else class="compose-step">
      <view class="topbar">
        <view class="back-btn" @click="goBackToUpload">
          <SvgIcon name="chevron-left" size="36rpx" />
        </view>
        <text class="topbar-title">{{ uiText("写下这段时光") }}</text>
        <view class="settings-btn" @click="settingsOpen = true">
          <SvgIcon name="gear" size="36rpx" />
        </view>
      </view>

      <scroll-view class="scroll" scroll-y>
        <view class="image-preview">
          <view v-for="(it, idx) in prepared" :key="idx" class="thumb">
            <image :src="it.localPath" mode="aspectFill" class="thumb-img" />
            <!-- 未登录时不显示「上传中」蒙版：我们故意没发请求，显示"上传中"会误导用户 -->
            <view v-if="isLoggedIn && !it.uploadDone && !it.failed" class="thumb-mask"><text>{{ uiText("上传中") }}</text></view>
            <view v-if="it.failed" class="thumb-mask err" @click.stop="onRetryImage(idx, it)">
              <text>{{ uiText("失败·点击重试") }}</text>
            </view>
            <view v-if="idx === 0" class="thumb-badge"><text>{{ uiText("封面") }}</text></view>
            <!-- 未登录的图片标记为「草稿」，让用户知道这只是本地缓存 -->
            <view v-if="!isLoggedIn" class="thumb-badge draft"><text>{{ uiText("草稿") }}</text></view>
            <view class="thumb-remove" @click.stop="onRemoveImage(idx)">
              <SvgIcon name="close" size="24rpx" color="#F7F3EE" />
            </view>
          </view>

          <!-- 视频 tiles -->
          <view v-for="(v, idx) in videos" :key="'v'+idx" class="thumb thumb-video">
            <image
              v-if="v.thumbnailUrl"
              :src="v.thumbnailUrl"
              mode="aspectFill"
              class="thumb-img"
            />
            <view v-else class="thumb-mask">
              <SvgIcon name="play" size="36rpx" color="#F7F3EE" />
            </view>
            <view v-if="!v.uploadDone" class="thumb-mask">
              <text>{{ uiText("上传") }} {{ v.uploadProgress }}%</text>
            </view>
            <view v-else-if="v.transcoding" class="thumb-mask">
              <text>{{ uiText("转码中…") }}</text>
            </view>
            <view v-if="v.failed" class="thumb-mask err"><text>{{ uiText("失败") }}</text></view>
            <view class="thumb-badge video"><text>{{ uiText("视频") }}</text></view>
            <view class="thumb-remove" @click.stop="onRemoveVideo(idx)">
              <SvgIcon name="close" size="24rpx" color="#F7F3EE" />
            </view>
          </view>

          <view v-if="prepared.length < 9" class="thumb thumb-add" @click="onAddMoreImages">
            <SvgIcon name="plus" size="48rpx" color="#A89A8A" />
            <text class="thumb-add-hint">{{ uiText("加图") }}</text>
          </view>
          <view v-if="isLoggedIn && videos.length < 3" class="thumb thumb-add" @click="onAddVideo">
            <SvgIcon name="play" size="40rpx" color="#A89A8A" />
            <text class="thumb-add-hint">{{ uiText("加视频") }}</text>
          </view>
        </view>

        <!-- 进度条只在「已开启网络任务」+ 「有图要传」时显示。用户投诉：仅传视频时
             prepared.length=0 → allUploaded=false（computed 里 length>0 才算 true）
             → 「图片处理中 0%」永远停在那儿看着像卡死。加一层 prepared.length > 0 拦截 -->
        <view v-if="isLoggedIn && prepared.length > 0 && !allUploaded" class="upload-status">
          <view class="upload-status-bar">
            <view class="upload-status-fill" :style="{ width: uploadProgress + '%' }" />
          </view>
          <text class="upload-status-text">{{ uiText("图片处理中") }} {{ uploadProgress }}%</text>
        </view>

        <view class="section">
          <text class="section-label">{{ uiText("这段时光想说什么") }}</text>
          <textarea
            v-model="text"
            class="textarea"
            :disabled="styling || asrLoading"
            :placeholder='uiText("比如：那年夏天我们一起去海边……")'
            maxlength="500"
            auto-height
          />
          <view v-if="styling" class="streaming-hint"><text>{{ uiText("正在为你切换文风…") }}</text></view>
          <view v-if="asrLoading" class="streaming-hint"><text>{{ uiText("正在转写你的录音…") }}</text></view>
        </view>

        <view class="section">
          <text class="section-label">{{ uiText("标题（选填）") }}</text>
          <input
            v-model="titleInput"
            class="title-input"
            maxlength="60"
            :placeholder='uiText("留空将由日期自动填充")'
          />
        </view>

        <view class="section">
          <text class="section-label">{{ uiText("文风（默认原文不加修饰）") }}</text>
          <view class="style-row">
            <view
              class="style-pill"
              :class="{ active: !activeStyle, disabled: styling }"
              @click="clearStyle"
            ><text>{{ uiText("原文") }}</text></view>
            <view
              v-for="s in STYLES" :key="s"
              class="style-pill"
              :class="{ active: activeStyle === s, disabled: styling }"
              @click="pickStyle(s)"
            ><text>{{ uiText(s) }}</text></view>
          </view>
        </view>

        <view class="section record-section">
          <text class="section-label">{{ uiText("录一段（最长 5 分钟）") }}</text>
          <view class="record-row">
            <view
              class="record-btn"
              :class="{ recording: isRecording, disabled: !canRecord }"
              @click="toggleRecord"
            >
              <SvgIcon
                :name="isRecording ? 'stop' : 'mic'"
                size="32rpx"
                :color="isRecording ? '#C13939' : '#3D2E1F'"
              />
              <text v-if="isRecording">{{ formatRecordingTime(recordingTime) }}</text>
              <text v-else>{{ uiText("开始录音") }}</text>
            </view>
            <!-- 展示条件：只要 audioInfo 有值就显示（含 ASR loading 阶段），不再等 url 到手 -->
            <text v-if="asrLoading" class="record-done">{{ uiText("识别中…") }}</text>
            <text v-else-if="audioInfo && audioInfo.duration > 0" class="record-done">{{ uiText("已录") }} {{ audioInfo.duration }}s</text>
            <text v-else-if="audioInfo?.url" class="record-done">{{ uiText("已录制") }}</text>
          </view>
        </view>

        <view class="bottom-spacer" />
      </scroll-view>

      <view class="actions-bar">
        <button class="btn btn-ghost" :disabled="isBusy" @click="onCancel"><text>{{ uiText("取消") }}</text></button>
        <button
          class="btn btn-primary"
          :disabled="!canSubmit"
          :loading="isBusy"
          @click="onSubmit"
        >
          <!-- 未登录态：不显示「分析中」（实际没在分析），直接显示「保存」让用户点 → 弹登录 modal -->
          <text v-if="isLoggedIn && !analyzeReady && images.length > 0">{{ uiText("整理中…") }}</text>
          <text v-else>{{ uiText("保存") }}</text>
        </button>
      </view>

      <view v-if="isBusy" class="overlay">
        <view class="overlay-card">
          <view class="spinner" />
          <text class="overlay-title">{{ stageMessage || uiText("处理中…") }}</text>
          <text class="overlay-sub">{{ uiText("这一步用时较长，请耐心等待") }}</text>
        </view>
      </view>

      <view v-if="phase === 'error'" class="overlay">
        <view class="overlay-card">
          <text class="overlay-title err">{{ uiText("操作失败") }}</text>
          <text class="overlay-sub">{{ uiText(errorMessage) }}</text>
          <view class="overlay-actions">
            <!-- 取消只关闭弹窗，不清空用户已选内容（用户实测痛点：点取消等于内容全没） -->
            <button class="btn btn-ghost" @click="dismissError"><text>{{ uiText("取消") }}</text></button>
            <!-- 鉴权类错误：显示「去登录」按钮代替「重试」，避免用户瞎点重试再次失败 -->
            <button
              v-if="/未登录|登录已过期|401|未授权/.test(errorMessage)"
              class="btn btn-primary" @click="goLogin"
            ><text>{{ uiText("去登录") }}</text></button>
            <button v-else class="btn btn-primary" @click="onSubmit"><text>{{ uiText("重试") }}</text></button>
          </view>
        </view>
      </view>
    </view>

    <SettingsPanel
      :auto-play-audio="autoPlayAudio"
      :group-id="groupId"
      :personal-pinned="personalPinned"
      :original-quality="originalQuality"
      :author-display-name="authorDisplayName"
      :preferred-template="preferredTemplate"
      :open="settingsOpen"
      :mode="creationMode"
      @update:auto-play-audio="(v) => (autoPlayAudio = v)"
      @update:group-id="(v) => (groupId = v)"
      @update:personal-pinned="(v) => (personalPinned = v)"
      @update:original-quality="(v) => (originalQuality = v)"
      @update:author-display-name="(v) => (authorDisplayName = v)"
      @update:preferred-template="(v) => (preferredTemplate = v)"
      @update:open="(v) => (settingsOpen = v)"
    />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.creation-flow {
  position: relative;
  height: 100vh;
  background: t.$color-bg;
  display: flex;
  flex-direction: column;
}

// 未登录态：内联提示「· 登录后可加更多」（小尺寸，强调色，可点）
.login-hint {
  color: t.$color-accent;
  font-size: t.$font-xs;
  margin-left: t.$spacing-1;
}

.upload-step { display: flex; flex-direction: column; flex: 1 1 0; padding: t.$spacing-4 t.$spacing-4 0; min-height: 0; }
// 中段可滚容器：flex:1，占满剩余高度；padding-right 补偿滚动条
.upload-scroll { flex: 1 1 0; min-height: 0; }
// 尾部 spacer 高度 = actions-bar (~180rpx) + safe-area 兜底；tab 模式追加 tabbar 高度
.upload-bottom-spacer { height: 240rpx; }
.is-tab .upload-bottom-spacer { height: 380rpx; }
.upload-topbar {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: t.$spacing-4;
  gap: t.$spacing-3;
}
.upload-hero { display: flex; flex-direction: column; gap: t.$spacing-1; flex: 1; }
.hero {
  display: flex; flex-direction: column;
  gap: t.$spacing-1; margin-bottom: t.$spacing-4;
}
.upload-hero .title, .hero .title { font-size: t.$font-xl; font-weight: t.$weight-extrabold; color: t.$color-text; }
.upload-hero .hint, .hero .hint { font-size: t.$font-sm; color: t.$color-text-soft; }

// 深色实心 + 米白图标文字 → 在暖白页面背景上对比度最强
.settings-btn-prominent {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 28rpx;
  border-radius: 999rpx;
  background: t.$color-accent;        // 深咖啡
  box-shadow: 0 4rpx 12rpx rgba(61, 46, 31, 0.20);
}

/* 2026-09-25：mp-weixin 相册模式下"去完整网页版"的 QR 提示（点开 → mp-to-h5-code → 展示 QR + 复制按钮） */
.h5-upload-hint {
  margin: t.$spacing-3 0;
  border-radius: t.$radius-md;
  background: rgba(61, 46, 31, 0.05);
  border: 2rpx dashed rgba(61, 46, 31, 0.18);
  overflow: hidden;
}
.h5uh-collapsed {
  display: flex;
  align-items: center;
  gap: t.$spacing-2;
  padding: t.$spacing-3 t.$spacing-4;
}
.h5uh-title { flex: 1; font-size: t.$font-xs; color: t.$color-text-mute; }
.h5uh-arrow { font-size: 32rpx; color: t.$color-text-soft; }
.h5uh-expanded {
  display: flex;
  flex-direction: column;
  gap: t.$spacing-3;
  padding: t.$spacing-4;
}
.h5uh-hint-title { font-size: t.$font-sm; font-weight: t.$weight-bold; color: t.$color-text; }
.h5uh-hint-sub { font-size: t.$font-xs; color: t.$color-text-mute; line-height: 1.5; }
.h5uh-qr-wrap {
  display: flex;
  justify-content: center;
  padding: t.$spacing-3 0;
}
.h5uh-qr {
  width: 320rpx;
  height: 320rpx;
  background: #fff;
  border-radius: t.$radius-sm;
  padding: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(61, 46, 31, 0.10);
}
.h5uh-actions {
  display: flex;
  gap: t.$spacing-3;
  justify-content: flex-end;
}
.h5uh-btn {
  padding: t.$spacing-2 t.$spacing-4;
  border-radius: t.$radius-sm;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-sm;
}
.h5uh-btn-ghost {
  background: transparent;
  color: t.$color-text-mute;
  border: 2rpx solid rgba(61, 46, 31, 0.20);
}
.settings-btn-label {
  font-size: t.$font-sm;
  color: t.$color-text-invert;        // 米白
  font-weight: t.$weight-bold;
  letter-spacing: 2rpx;
}

// A/B/C 模式选择器：3 pills 均分一行，active 显示强调色底
.mode-tabs {
  display: flex;
  gap: t.$spacing-2;
  margin-bottom: t.$spacing-4;
}
.mode-tab {
  flex: 1;
  padding: 20rpx 12rpx;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  text-align: center;
  min-width: 0;
}
.mode-tab.active {
  background: t.$color-accent;
  border-color: t.$color-accent;
}
.mode-tab.active .mode-title,
.mode-tab.active .mode-sub {
  color: t.$color-text-invert;
}
.mode-tab.disabled { opacity: 0.72; }
.mode-title {
  font-size: t.$font-md;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.mode-sub {
  font-size: 22rpx;
  color: t.$color-text-mute;
  line-height: 1.3;
}
.mode-tabs-lock {
  padding: 14rpx 20rpx;
  margin-bottom: t.$spacing-4;
  background: rgba(61, 46, 31, 0.06);
  border-radius: t.$radius-md;
  text-align: center;
}
.mode-lock-hint {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
}

.settings-chips {
  display: flex;
  flex-wrap: wrap;
  gap: t.$spacing-2;
}
.chip {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1 1 30%;
  min-width: 180rpx;
  padding: t.$spacing-2 t.$spacing-3;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  align-items: center;
  text-align: center;
}
.chip.on {
  border-color: t.$color-accent;
  background: rgba(61, 46, 31, 0.04);
}
.chip-key {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}
.chip-val {
  font-size: t.$font-sm;
  font-weight: t.$weight-bold;
  color: t.$color-text;
}
.preview-hint {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
  margin-top: t.$spacing-1;
}

// ---- UPLOAD 步骤的视频 tile（与 MediaPicker 相同的 3 列网格风格） ----
.video-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: t.$spacing-2;
}
.vtile {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: t.$radius-md;
  overflow: hidden;
  background: #000;
}
.vtile-img { width: 100%; height: 100%; }
.vtile-mask {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 22rpx;
  text-align: center;
}
.vtile-mask.err { background: rgba(220, 38, 38, 0.8); }
.vtile-add {
  background: t.$color-surface;
  border: 2rpx dashed t.$color-border;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8rpx;
  color: t.$color-text-mute;
}
.vtile-hint { font-size: 22rpx; color: t.$color-text-mute; }
.vtile-remove {
  position: absolute;
  top: 6rpx; right: 6rpx;
  width: 40rpx; height: 40rpx;
  border-radius: 50%;
  background: rgba(20, 14, 8, 0.65);
  display: flex; align-items: center; justify-content: center;
}

.section { display: flex; flex-direction: column; gap: t.$spacing-2; margin-bottom: t.$spacing-4; }
.section-label { font-size: t.$font-sm; color: t.$color-text-soft; }

.compose-step { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: t.$spacing-3 t.$spacing-4;
  border-bottom: 2rpx solid t.$color-border;
  background: t.$color-bg;
}
.topbar-title { font-size: t.$font-md; font-weight: t.$weight-bold; color: t.$color-text; }
.back-btn, .settings-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
  font-size: 40rpx; color: t.$color-text-soft;
}

.scroll { flex: 1 1 0; padding: t.$spacing-4; box-sizing: border-box; }

.image-preview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: t.$spacing-2;
  margin-bottom: t.$spacing-4;
}
.thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: t.$radius-md;
  overflow: hidden;
  background: t.$color-surface-2;
}
.thumb-img { width: 100%; height: 100%; }
.thumb-mask {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 22rpx;
}
.thumb-mask.err { background: rgba(220, 38, 38, 0.8); }
.thumb-badge {
  position: absolute;
  top: 8rpx; left: 8rpx;
  background: rgba(44, 62, 80, 0.85);
  color: #fff;
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
}
.thumb-badge.video { background: rgba(196, 74, 74, 0.9); }
// 未登录态的草稿角标：跟「封面」错开（草稿放右下），避免和「封面」蓝标重叠
.thumb-badge.draft {
  background: rgba(168, 154, 138, 0.92);
  top: auto; left: auto;
  bottom: 8rpx; right: 8rpx;
}
.thumb-video { background: #000; }
.thumb-remove {
  position: absolute;
  top: 4rpx; right: 4rpx;
  width: 36rpx; height: 36rpx;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.thumb-add {
  background: t.$color-surface;
  border: 2rpx dashed t.$color-border;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8rpx;
  color: t.$color-text-mute;
}
.thumb-add-hint { font-size: 20rpx; }
.record-btn {
  display: inline-flex; align-items: center; gap: 8rpx;
}

.upload-status {
  display: flex; flex-direction: column; gap: t.$spacing-1;
  margin-bottom: t.$spacing-4;
}
.upload-status-bar {
  height: 6rpx; background: t.$color-surface-2;
  border-radius: 999rpx; overflow: hidden;
}
.upload-status-fill {
  height: 100%; background: t.$color-accent;
  transition: width 0.3s ease;
}
.upload-status-text { font-size: 22rpx; color: t.$color-text-mute; text-align: right; }

.textarea {
  width: 100%;
  min-height: 240rpx;
  padding: t.$spacing-3;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  color: t.$color-text;
  font-size: t.$font-md;
  line-height: 1.6;
  box-sizing: border-box;
}
.streaming-hint { font-size: 22rpx; color: t.$color-text-mute; font-style: italic; }

.title-input {
  width: 100%;
  height: 88rpx;
  padding: 0 t.$spacing-3;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  color: t.$color-text;
  font-size: t.$font-md;
  box-sizing: border-box;
}

.style-row { display: flex; gap: t.$spacing-2; flex-wrap: wrap; }
.style-pill {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
}
.style-pill.active {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}
.style-pill.disabled { opacity: 0.5; }

.record-section { gap: t.$spacing-2; }
.record-row { display: flex; align-items: center; gap: t.$spacing-3; }
.record-btn {
  padding: 14rpx 32rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text;
  font-size: t.$font-sm;
}
.record-btn.recording {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}
.record-btn.disabled { opacity: 0.5; }
.record-done { font-size: t.$font-sm; color: t.$color-text-mute; }

.bottom-spacer { height: 200rpx; }

.actions-bar {
  position: fixed; left: 0; right: 0; bottom: 0;
  padding: t.$spacing-3 t.$spacing-4 calc(env(safe-area-inset-bottom) + #{t.$spacing-3});
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  display: flex;
  gap: t.$spacing-3;
  z-index: 5;
}
// tab 模式：CustomTabBar 占了底部 ~100rpx + safe-area，把 actions-bar 顶上去
.is-tab .actions-bar {
  bottom: calc(100rpx + env(safe-area-inset-bottom));
  padding-bottom: t.$spacing-3;
}
.is-tab .bottom-spacer { height: 320rpx; }
.btn {
  flex: 1;
  height: 80rpx; line-height: 80rpx;
  border-radius: t.$radius-pill;
  font-size: t.$font-md;
  padding: 0;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-ghost {
  background: transparent;
  color: t.$color-text-soft;
  border: 2rpx solid t.$color-border;
}

.overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 99;
  display: flex; align-items: center; justify-content: center;
  padding: t.$spacing-4;
}
.overlay-card {
  width: 100%; max-width: 600rpx;
  background: t.$color-surface;
  border-radius: t.$radius-card;
  padding: t.$spacing-5 t.$spacing-4;
  display: flex; flex-direction: column;
  align-items: center; gap: t.$spacing-3;
  box-shadow: t.$shadow-pop;
  text-align: center;
}
.overlay-title { font-size: t.$font-lg; font-weight: t.$weight-bold; color: t.$color-text; }
.overlay-title.err { color: t.$color-danger; }
.overlay-sub { font-size: t.$font-sm; color: t.$color-text-soft; line-height: 1.6; }
.overlay-actions { display: flex; gap: t.$spacing-3; width: 100%; }
.spinner {
  width: 56rpx; height: 56rpx; border-radius: 50%;
  border: 4rpx solid t.$color-border;
  border-top-color: t.$color-accent;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
/* 参考：annualreport/src/styles/UploadView.css，保留模式/设置功能，仅收敛移动端层级。 */
@media (max-width: 600px) {
  .creation-flow { height: 100dvh; }
  .upload-topbar { gap: 12px; margin-bottom: 16px; }
  .upload-hero { min-width: 0; }
  .upload-hero .title { font-size: 24px; line-height: 1.25; }
  .upload-hero .hint { font-size: 13px; line-height: 1.5; }
  .settings-btn-prominent { padding: 10px 12px; gap: 4px; flex-shrink: 0; box-shadow: none; }
  .settings-btn-label { font-size: 12px; letter-spacing: 0; }
  .mode-tabs { gap: 6px; margin-bottom: 8px; }
  .mode-tab { padding: 12px 4px; border-radius: 12px; }
  .mode-title { font-size: 15px; }
  .mode-description { display: block; font-size: 12px; color: t.$color-text-soft; margin-bottom: 18px; }
  .section { margin-bottom: 20px; }
  .section-label { font-size: 13px; }
  .settings-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .chip { min-width: 0; padding: 8px 4px; border-radius: 10px; }
  .chip-key { font-size: 11px; }
  .chip-val { font-size: 12px; overflow-wrap: anywhere; }
  .upload-step :deep(.picker), .video-tiles { grid-template-columns: repeat(auto-fill, 88px); gap: 8px; }
  .record-row { flex-wrap: wrap; }
}
</style>
