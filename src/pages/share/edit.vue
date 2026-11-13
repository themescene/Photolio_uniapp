<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 画匣子编辑页 —— 参考 annualreport/src/components/ShareModal.vue（edit tab）。
 *
 * 编辑字段：
 *   顶层：report_title / author_display_name / report_style
 *   当前 episode：h1 / h2 / body / template_id / show_audio / images / audio_url
 *
 * 流程：fetchShare → 预填 → onSave 时 beginEdit → updateShare → endEdit
 *
 * 图片增删：用 MediaPicker 选新图 → POST /upload-image（analyze=0） → push 进 editImages；
 * 删除：tile 上的 × 直接拼掉本地数组。
 *
 * 视频追加：选视频 → uni.uploadFile 到 VIDEO_UPLOAD_BASE/upload-video → poll job_id → done 后入列。
 *
 * 多 episode 时可删除当前 episode（episode_patch.deleted=true 由后端识别）。
 */
import { ref, computed, watch, onMounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import {
  fetchShare, fetchPermissions, beginEdit, endEdit, updateShare,
  uploadShareImage, uploadShareVideo, pollVideoStatus,
} from "@/api/share";
import { uploadImage as uploadRoundImage } from "@/api/round";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import { compressVideoIfPossible } from "@/utils/media";
import AudioEditor from "@/components/AudioEditor.vue";
import { useAuthStore } from "@/stores/auth";
import SvgIcon from "@/components/SvgIcon.vue";
import { useStyleStream } from "@/composables/useStyleStream";
import { STORAGE_KEYS } from "@/config/env";
import type { ShareDetail, StyleKey, TemplateType } from "@/types";

const STYLES: StyleKey[] = ["独白", "家书", "给兄弟", "给闺蜜"];

// 与网页端 ShareCard.vue THEMES + photolio TemplateCard.vue 对齐的 10 个模板
const TEMPLATES: { id: TemplateType; label: string }[] = [
  { id: "wooden_box",    label: "木匣" },
  { id: "food",          label: "美食" },
  { id: "work",          label: "工作" },
  { id: "sports",        label: "运动" },
  { id: "entertainment", label: "娱乐" },
  { id: "hobby",         label: "爱好" },
  { id: "reflection",    label: "随笔" },
  { id: "pixel_surf",    label: "像素" },
  { id: "valentine",     label: "情书" },
  { id: "travel_vlog",   label: "旅行" },
];

interface EpisodeImage {
  image_url: string
  display_order: number
  media_type?: 'image' | 'video'
  thumbnail_url?: string | null
}

const shareId = ref("");
const loading = ref(true);
const errorMsg = ref("");
const share = ref<ShareDetail | null>(null);
const canEdit = ref(false);
const lockBlocked = ref(false);

const selectedEpIdx = ref(0);

// 顶层字段
const editTitle = ref("");
const editAuthorName = ref("");

// 当前 episode 字段
const editH1 = ref("");
const editH2 = ref("");
const editBody = ref("");
const editStyle = ref<StyleKey | null>(null);
const editTemplate = ref<TemplateType>("wooden_box");
const editShowAudio = ref(true);
const editImages = ref<EpisodeImage[]>([]);
const editAudioUrl = ref<string>("");
const editAudioDuration = ref(0), audioBusy = ref(false);
const auth = useAuthStore();
const canEditAudio = computed(() => canEdit.value && !lockBlocked.value && (!currentEpisode.value?.author_id || currentEpisode.value.author_id === auth.user?.user_id));

const saving = ref(false);
const uploadingImage = ref(false);
const uploadingVideo = ref(false);
const videoProgress = ref<number | null>(null);
const styleStream = useStyleStream();

watch(() => styleStream.streamedText.value, (v) => {
  if (styleStream.styling.value && v) editBody.value = v;
});

const currentEpisode = computed(() => share.value?.report?.episodes?.[selectedEpIdx.value]);
const totalEpisodes = computed(() => share.value?.report?.episodes?.length || 0);
const canDeleteEpisode = computed(() => totalEpisodes.value > 1);

const sessionId = computed(() => `edit_${shareId.value}`);

onLoad((opt) => {
  shareId.value = (opt?.id as string) || "";
});

onMounted(async () => {
  if (!shareId.value) {
    errorMsg.value = "缺少 id 参数";
    loading.value = false;
    return;
  }
  try {
    const [s, perm] = await Promise.all([
      fetchShare(shareId.value),
      fetchPermissions(shareId.value).catch(() => null),
    ]);
    share.value = s;
    if (perm) {
      canEdit.value = !!perm.can_edit;
      lockBlocked.value = !!perm.editing_lock && !perm.lock_is_mine && !perm.lock_is_stale;
    } else {
      canEdit.value = false;
    }
    populateFields();
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "加载失败";
    logger.warn("[edit] load failed", e);
  } finally {
    loading.value = false;
  }
});

function populateFields() {
  if (!share.value) return;
  editTitle.value = share.value.report?.report_title || "";
  editAuthorName.value = share.value.author_display_name || "";
  const ep = currentEpisode.value;
  const cw = (ep?.copywriting || {}) as Record<string, string | null | undefined>;
  editH1.value = cw.h1 || "";
  editH2.value = cw.h2 || "";
  editBody.value = cw.body || "";
  editStyle.value = (cw.style as StyleKey) || null;
  editTemplate.value = ((ep as { template_id?: TemplateType })?.template_id) || "wooden_box";
  editShowAudio.value = (ep as { show_audio?: boolean })?.show_audio !== false;
  editAudioUrl.value = (ep as { audio_url?: string })?.audio_url || "";
  editAudioDuration.value = Number(ep?.audio_duration) || 0;
  // 对齐网页端：按 display_order 排序 + 兜底
  const rawImages = ((ep?.images || []) as EpisodeImage[]).map((it, i) => ({
    image_url: it.image_url,
    display_order: typeof it.display_order === 'number' ? it.display_order : i,
    media_type: it.media_type || 'image',
    thumbnail_url: it.thumbnail_url,
  }));
  rawImages.sort((a, b) => a.display_order - b.display_order);
  editImages.value = rawImages;
}

watch(selectedEpIdx, () => populateFields());

async function pickStyle(s: StyleKey) {
  if (styleStream.styling.value) return;
  if (s === editStyle.value) return;
  if (!editBody.value.trim()) {
    editStyle.value = s;
    return;
  }
  try {
    const original = editBody.value;
    editStyle.value = s;
    await styleStream.apply(original, s);
  } catch {
    uni.showToast({ title: "文风切换失败", icon: "none" });
  }
}

function clearStyle() {
  if (styleStream.styling.value) styleStream.abort();
  editStyle.value = null;
}

function pickTemplate(id: TemplateType) {
  editTemplate.value = id;
}

function toggleShowAudio() {
  editShowAudio.value = !editShowAudio.value;
}

// ============ 图片增删 ============

async function onAddImages() {
  if (uploadingImage.value) return;
  const remaining = Math.max(0, 9 - editImages.value.length);
  if (remaining === 0) {
    uni.showToast({ title: "最多 9 张", icon: "none" });
    return;
  }
  try {
    const res = await new Promise<UniApp.ChooseMediaSuccessCallbackResult>((resolve, reject) => {
      uni.chooseMedia({
        count: remaining,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: resolve,
        fail: (err) => reject(new Error(err.errMsg || "")),
      });
    });
    const paths = (res.tempFiles || []).map((f) => f.tempFilePath).filter(Boolean);
    if (!paths.length) return;
    uploadingImage.value = true;
    let baseOrder = editImages.value.length;
    for (const p of paths) {
      try {
        const r = await uploadShareImage(p, sessionId.value);
        editImages.value.push({
          image_url: r.image_url,
          display_order: baseOrder++,
          media_type: 'image',
        });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "图片上传失败";
        uni.showToast({ title: msg, icon: "none", duration: 3000 });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/cancel/i.test(msg)) uni.showToast({ title: msg || "选择失败", icon: "none" });
  } finally {
    uploadingImage.value = false;
  }
}

function onRemoveImage(idx: number) {
  editImages.value = editImages.value.filter((_, i) => i !== idx).map((img, i) => ({
    ...img, display_order: i,
  }));
}

function onPreviewImage(idx: number) {
  const urls = editImages.value
    .filter((it) => it.media_type !== 'video')
    .map((it) => it.image_url);
  if (urls.length) uni.previewImage({ urls, current: editImages.value[idx].image_url });
}

// ============ 视频追加（VIDEO_UPLOAD_BASE + 轮询转码） ============

async function onAddVideo() {
  if (uploadingVideo.value) return;
  try {
    const res = await new Promise<UniApp.ChooseMediaSuccessCallbackResult>((resolve, reject) => {
      uni.chooseMedia({
        count: 1,
        mediaType: ["video"],
        sourceType: ["album", "camera"],
        maxDuration: 60,
        success: resolve,
        fail: (err) => reject(new Error(err.errMsg || "")),
      });
    });
    const f = (res.tempFiles || [])[0];
    if (!f?.tempFilePath) return;
    const MAX = 500 * 1024 * 1024;
    if ((f.size || 0) > MAX) {
      uni.showToast({ title: "视频不能超过 500MB", icon: "none", duration: 3000 });
      return;
    }
    // wx.chooseMedia 视频项自带 thumbTempFilePath —— 前端保留一份本地封面帧，
    // 后端 ffmpeg 提帧失败时用它作为兜底缩略图，避免仅视频章节没封面
    const thumbLocal = (f as { thumbTempFilePath?: string }).thumbTempFilePath || "";
    uploadingVideo.value = true;
    videoProgress.value = 0;
    // 2026-08-11：追加视频统一 6Mbps 1080p（对齐 useCreation._runOneVideo 契约）
    // backend `_should_skip_transcode` 阈值 8Mbps，6M 会直接被 skip 不再重编码
    const compressedPath = await compressVideoIfPossible(f.tempFilePath, {
      quality: "high",
      resolution: 1080,
      bitrate: 6000,
      fps: 30,
    });
    const up = await uploadShareVideo(compressedPath, sessionId.value, (p) => {
      videoProgress.value = p;
    });
    videoProgress.value = null;
    if (!up.job_id) {
      uni.showToast({ title: "视频上传失败", icon: "none", duration: 3000 });
      return;
    }
    // 轮询转码状态：指数退避，10 分钟封顶
    const finalUrl = await pollUntilDone(up.job_id);
    if (finalUrl) {
      let coverUrl = finalUrl.thumbnail_url || null;
      // 后端没能产出缩略图（ffmpeg 失败）时上传本地封面帧作为 thumbnail_url
      // 这张封面**只写进 video 条目的 thumbnail_url 字段**，绝不作为独立 image 条目
      if (!coverUrl && thumbLocal) {
        try {
          const r = await uploadRoundImage(thumbLocal, sessionId.value);
          coverUrl = r.image_url || null;
        } catch (e) {
          logger.warn("[edit] fallback video thumb upload failed", e);
        }
      }
      editImages.value.push({
        image_url: finalUrl.video_url,
        display_order: editImages.value.length,
        media_type: 'video',
        thumbnail_url: coverUrl,
      });
      uni.showToast({ title: "视频已添加", icon: "success" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/cancel/i.test(msg)) uni.showToast({ title: msg || "上传失败", icon: "none", duration: 3000 });
  } finally {
    uploadingVideo.value = false;
    videoProgress.value = null;
  }
}

// 轮询转码状态 —— 与 nfc/index.vue 重复，重构机会，但目前各自保有自己的失败 toast 文案
// 退避：3s → 4.5s → 6s ... 上限 8s；连续 5 次网络失败直接报错
async function pollUntilDone(jobId: string): Promise<{ video_url: string; thumbnail_url?: string | null } | null> {
  let delay = 3000;
  const MAX_DELAY = 8000;
  let consecutiveFail = 0;
  const deadline = Date.now() + 10 * 60 * 1000; // 10 分钟封顶
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    try {
      const s = await pollVideoStatus(jobId);
      consecutiveFail = 0;
      if (s.status === 'done' && s.video_url) {
        return { video_url: s.video_url, thumbnail_url: s.thumbnail_url };
      }
      if (s.status === 'error') {
        uni.showToast({ title: s.message || "转码失败", icon: "none", duration: 3000 });
        return null;
      }
    } catch {
      consecutiveFail++;
      if (consecutiveFail >= 5) {
        uni.showToast({ title: "网络持续失败，请稍后再试", icon: "none", duration: 3000 });
        return null;
      }
    }
    delay = Math.min(MAX_DELAY, Math.round(delay * 1.5));
  }
  uni.showToast({ title: "转码超时，稍后再试", icon: "none", duration: 3000 });
  return null;
}

// ============ 章节删除（多 episode 时可见） ============

function onDeleteEpisode() {
  if (!canDeleteEpisode.value) return;
  const ep = currentEpisode.value;
  if (!ep) return;
  uni.showModal({
    title: "删除此章节？",
    content: "删除后无法恢复",
    success: async (res) => {
      if (!res.confirm || !shareId.value || !share.value) return;
      let lockAcquired = false;
      try {
        await beginEdit(shareId.value);
        lockAcquired = true;
        // 后端 update_share_content 不支持 episode_patch.deleted 字段，
        // 必须通过完整替换 episodes 数组来删除（share_service.py:954）
        const remainEps = (share.value.report?.episodes || []).filter(
          (x) => (x as { episode_id?: string }).episode_id !== (ep as { episode_id?: string }).episode_id
        );
        await updateShare(shareId.value, { episodes: remainEps });
        uni.showToast({ title: "已删除", icon: "success" });
        try { uni.setStorageSync(STORAGE_KEYS.SHARE_DIRTY, shareId.value); } catch { /* ignore */ }
        try { uni.setStorageSync(STORAGE_KEYS.HOME_DIRTY, true); } catch { /* ignore */ }
        const s = await fetchShare(shareId.value);
        share.value = s;
        if (selectedEpIdx.value >= (s.report?.episodes?.length || 0)) {
          selectedEpIdx.value = Math.max(0, (s.report?.episodes?.length || 1) - 1);
        }
        populateFields();
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "删除失败";
        uni.showToast({ title: msg, icon: "none", duration: 3000 });
      } finally {
        if (lockAcquired) { try { await endEdit(shareId.value); } catch { /* ignore */ } }
      }
    },
  });
}

async function onSave() {
  if (!shareId.value || saving.value || audioBusy.value) return;
  if (!canEdit.value) {
    uni.showToast({ title: "你没有编辑权限", icon: "none" });
    return;
  }
  if (lockBlocked.value) {
    uni.showToast({ title: "他人正在编辑中，请稍后再试", icon: "none" });
    return;
  }
  saving.value = true;
  let lockAcquired = false;
  try {
    await beginEdit(shareId.value);
    lockAcquired = true;

    const ep = currentEpisode.value;
    // 2026-08-08 hotfix14：h1 兜底 —— 与 useCreation.generate 一致（用户新契约）
    // 2026-08-09 补丁：report_title 也用 h1Final 镜像，否则主页永远显示"未命名"
    const h1Trim = editH1.value.trim();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const h1Final = h1Trim || today;
    await updateShare(shareId.value, {
      report_title: h1Final,
      report_style: editStyle.value ?? null,
      author_display_name: editAuthorName.value.trim(),
      episode_patch: ep ? {
        episode_id: (ep as { episode_id?: number | null }).episode_id ?? null,
        copywriting: {
          h1: h1Final,
          h2: editH2.value,
          body: editBody.value,
          style: editStyle.value,
        },
        template_id: editTemplate.value,
        show_audio: editShowAudio.value,
        audio_url: editAudioUrl.value,
        audio_duration: editAudioDuration.value,
        images: editImages.value,
      } : undefined,
    });

    uni.showToast({ title: "已保存", icon: "success" });
    // 标主页脏，回去能看到改后的标题 / 封面
    try { uni.setStorageSync(STORAGE_KEYS.HOME_DIRTY, true); } catch { /* ignore */ }
    // 标本 share 脏，让 play 页 onShow 重拉详情（p2 修：编辑后回播放页能看到新模板 / 新标题）
    try { uni.setStorageSync(STORAGE_KEYS.SHARE_DIRTY, shareId.value); } catch { /* ignore */ }
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : "保存失败";
    uni.showToast({ title: msg, icon: "none", duration: 3000 });
    logger.warn("[edit] save failed", e);
  } finally {
    if (lockAcquired) {
      try { await endEdit(shareId.value); } catch { /* ignore */ }
    }
    saving.value = false;
  }
}

function onCancel() {
  uni.navigateBack();
}

function prevEpisode() {
  if (selectedEpIdx.value > 0) selectedEpIdx.value--;
}
function nextEpisode() {
  if (selectedEpIdx.value < totalEpisodes.value - 1) selectedEpIdx.value++;
}
</script>

<template>
  <view class="page">
    <view v-if="loading" class="state"><text>{{ uiText("正在打开编辑…") }}</text></view>

    <view v-else-if="errorMsg" class="state state-err">
      <text class="state-title">{{ uiText("加载失败") }}</text>
      <text>{{ uiText(errorMsg) }}</text>
    </view>

    <view v-else class="edit-page">
      <view class="topbar">
        <view class="back-btn" @click="onCancel">
          <SvgIcon name="chevron-left" size="36rpx" />
        </view>
        <text class="topbar-title">{{ uiText("编辑画匣子") }}</text>
        <view class="topbar-placeholder" />
      </view>

      <scroll-view class="scroll" scroll-y>
        <!-- 顶层：作者署名（画匣子标题 = report_title 已弃用，改由 episode.h1 承载唯一标题；
             副标题 h2 也隐藏 —— 用户新契约要求单一"标题"字段，见 hotfix14） -->
        <view class="section">
          <text class="label">{{ uiText("作者署名（留空使用昵称）") }}</text>
          <input v-model="editAuthorName" class="input" maxlength="30" :placeholder='uiText("比如：奶奶的小棉袄")' />
        </view>

        <!-- 多 episode：切换器 -->
        <view v-if="totalEpisodes > 1" class="section ep-switcher">
          <view class="ep-btn" :class="{ disabled: selectedEpIdx === 0 }" @click="prevEpisode">
            <SvgIcon name="chevron-left" size="28rpx" />
            <text>{{ uiText("上一节") }}</text>
          </view>
          <text class="ep-page">{{ selectedEpIdx + 1 }} / {{ totalEpisodes }}</text>
          <view class="ep-btn" :class="{ disabled: selectedEpIdx >= totalEpisodes - 1 }" @click="nextEpisode">
            <text>{{ uiText("下一节") }}</text>
            <SvgIcon name="chevron-right" size="28rpx" />
          </view>
        </view>

        <!-- 当前 episode：标题（h1） + 正文（h2 副标题已隐藏，见 hotfix14 单一标题契约） -->
        <view class="section">
          <text class="label">{{ uiText("标题（留空将由日期自动填充）") }}</text>
          <input v-model="editH1" class="input" maxlength="60" :placeholder='uiText("留空将由日期自动填充")' />
        </view>
        <view class="section">
          <text class="label">{{ uiText("正文") }}</text>
          <textarea
            v-model="editBody"
            class="textarea"
            :disabled="styleStream.styling.value"
            maxlength="2000"
            :placeholder='uiText("这段时光想说什么…")'
            auto-height
          />
          <view v-if="styleStream.styling.value" class="streaming-hint">
            <text>{{ uiText("正在为你切换文风…") }}</text>
          </view>
        </view>

        <!-- 文风 -->
        <view class="section">
          <text class="label">{{ uiText("文风") }}</text>
          <view class="pill-row">
            <view
              class="pill"
              :class="{ active: !editStyle, disabled: styleStream.styling.value }"
              @click="clearStyle"
            ><text>{{ uiText("原文") }}</text></view>
            <view
              v-for="s in STYLES" :key="s"
              class="pill"
              :class="{ active: editStyle === s, disabled: styleStream.styling.value }"
              @click="pickStyle(s)"
            ><text>{{ uiText(s) }}</text></view>
          </view>
        </view>

        <!-- 模板 -->
        <view class="section">
          <text class="label">{{ uiText("模板") }}</text>
          <view class="pill-row">
            <view
              v-for="tpl in TEMPLATES" :key="tpl.id"
              class="pill"
              :class="{ active: editTemplate === tpl.id }"
              @click="pickTemplate(tpl.id)"
            ><text>{{ uiText(tpl.label) }}</text></view>
          </view>
        </view>

        <view class="section"><text class="label">{{ uiText("录音") }}</text><AudioEditor :key="String(currentEpisode?.episode_id ?? 'main')" v-model="editAudioUrl" :duration="editAudioDuration" :disabled="!canEditAudio || saving" @duration="editAudioDuration = $event" @busy="audioBusy = $event" /><text v-if="!canEditAudio" class="label">{{ uiText("仅章节作者可修改录音") }}</text></view>
        <!-- 音频开关 -->
        <view v-if="editAudioUrl" class="section">
          <view class="row-between">
            <text class="label">{{ uiText("在播放页显示录音条") }}</text>
            <view
              class="switch" :class="{ on: editShowAudio }"
              @click="toggleShowAudio"
            >
              <view class="switch-knob" />
            </view>
          </view>
        </view>

        <!-- 图片增删 -->
        <view class="section">
          <text class="label">{{ uiText("图片 / 视频（") }}{{ editImages.length }} / 9）</text>
          <view class="img-grid">
            <view
              v-for="(it, idx) in editImages"
              :key="`${idx}-${it.image_url}`"
              class="img-tile"
            >
              <image
                v-if="it.media_type !== 'video'"
                class="img-thumb"
                :src="it.image_url"
                mode="aspectFill"
                @click="onPreviewImage(idx)"
              />
              <view v-else class="img-thumb video-thumb">
                <image
                  v-if="it.thumbnail_url"
                  :src="it.thumbnail_url"
                  mode="aspectFill"
                  class="video-cover"
                />
                <view class="video-mark"><text>{{ uiText("视频") }}</text></view>
              </view>
              <view class="tile-remove" @click="onRemoveImage(idx)">
                <SvgIcon name="close" size="24rpx" color="#fff" />
              </view>
            </view>

            <view
              v-if="editImages.length < 9"
              class="img-tile tile-add"
              :class="{ disabled: uploadingImage }"
              @click="onAddImages"
            >
              <SvgIcon name="plus" size="40rpx" color="#A89A8A" />
              <text class="add-hint">{{ uploadingImage ? uiText("上传中…") : uiText("加图片") }}</text>
            </view>
          </view>

          <view class="video-row">
            <view
              class="btn-mini" :class="{ disabled: uploadingVideo }"
              @click="onAddVideo"
            >
              <SvgIcon name="upload" size="28rpx" />
              <text v-if="!uploadingVideo">{{ uiText("追加视频") }}</text>
              <text v-else-if="videoProgress !== null">{{ uiText("上传中") }} {{ videoProgress }}%</text>
              <text v-else>{{ uiText("正在转码…") }}</text>
            </view>
          </view>
        </view>

        <!-- 删除当前章节 -->
        <view v-if="canDeleteEpisode" class="section">
          <view class="btn btn-danger" @click="onDeleteEpisode">
            <SvgIcon name="trash" size="28rpx" color="#C44A4A" />
            <text>{{ uiText("删除当前章节") }}</text>
          </view>
        </view>

        <view class="bottom-spacer" />
      </scroll-view>

      <view class="actions-bar">
        <view class="btn btn-ghost" @click="onCancel"><text>{{ uiText("取消") }}</text></view>
        <view
          class="btn btn-primary"
          :class="{ disabled: saving || !canEdit || lockBlocked }"
          @click="onSave"
        ><text>{{ saving ? uiText("保存中…") : uiText("保存") }}</text></view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  position: relative;
  height: 100vh;
  background: t.$color-bg;
  display: flex;
  flex-direction: column;
}

.state {
  padding: t.$spacing-6 t.$spacing-4;
  display: flex; flex-direction: column;
  align-items: center;
  gap: t.$spacing-2;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  text-align: center;
  &.state-err .state-title {
    color: t.$color-danger;
    font-size: t.$font-lg;
    font-weight: t.$weight-bold;
  }
}

.edit-page {
  flex: 1; display: flex; flex-direction: column;
  min-height: 0;
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

.scroll { flex: 1 1 0; padding: t.$spacing-4; box-sizing: border-box; }

.section { display: flex; flex-direction: column; gap: t.$spacing-2; margin-bottom: t.$spacing-4; }
.label {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
}
.input {
  height: 88rpx;
  padding: 0 t.$spacing-3;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  color: t.$color-text;
  font-size: t.$font-md;
}
.textarea {
  width: 100%;
  min-height: 320rpx;
  padding: t.$spacing-3;
  border: 2rpx solid t.$color-border;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  color: t.$color-text;
  font-size: t.$font-md;
  line-height: 1.7;
  box-sizing: border-box;
}
.streaming-hint {
  font-size: t.$font-xs; color: t.$color-text-mute;
  font-style: italic;
}

.ep-switcher {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: t.$spacing-2;
}
.ep-btn {
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  font-size: t.$font-sm;
  color: t.$color-text-soft;
  display: inline-flex; align-items: center; gap: 8rpx;
}
.ep-btn.disabled { opacity: 0.4; }
.ep-page { font-size: t.$font-sm; color: t.$color-text-mute; }

.pill-row { display: flex; gap: t.$spacing-2; flex-wrap: wrap; }
.pill {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
}
.pill.active {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}
.pill.disabled { opacity: 0.5; }

.row-between {
  display: flex; align-items: center; justify-content: space-between;
}
.switch {
  width: 80rpx; height: 44rpx;
  border-radius: 999rpx;
  background: t.$color-border;
  position: relative;
  transition: background 0.2s;
}
.switch.on { background: t.$color-accent; }
.switch-knob {
  position: absolute;
  top: 4rpx; left: 4rpx;
  width: 36rpx; height: 36rpx;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s;
}
.switch.on .switch-knob { left: 40rpx; }

.img-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: t.$spacing-2;
}
.img-tile {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: t.$radius-md;
  overflow: hidden;
  background: t.$color-surface-2;
}
.img-thumb { width: 100%; height: 100%; }
.video-thumb {
  display: flex; align-items: center; justify-content: center;
  background: #000;
  position: relative;
}
.video-cover { width: 100%; height: 100%; }
.video-mark {
  position: absolute; bottom: 8rpx; left: 8rpx;
  background: rgba(0,0,0,0.6); color: #fff;
  padding: 4rpx 12rpx; border-radius: t.$radius-sm;
  font-size: t.$font-xs;
}
.tile-add {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  border: 2rpx dashed t.$color-border;
  background: t.$color-surface;
  gap: t.$spacing-1;
}
.tile-add.disabled { opacity: 0.5; }
.add-hint { font-size: t.$font-xs; color: t.$color-text-mute; }
.tile-remove {
  position: absolute;
  top: 6rpx; right: 6rpx;
  width: 40rpx; height: 40rpx;
  border-radius: 50%;
  background: rgba(20, 14, 8, 0.65);
  display: flex; align-items: center; justify-content: center;
}

.video-row { margin-top: t.$spacing-2; }
.btn-mini {
  display: inline-flex; align-items: center; gap: 8rpx;
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
}
.btn-mini.disabled { opacity: 0.5; }

.bottom-spacer { height: 240rpx; }

.actions-bar {
  position: fixed; left: 0; right: 0; bottom: 0;
  padding: t.$spacing-3 t.$spacing-4 calc(env(safe-area-inset-bottom) + #{t.$spacing-3});
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  display: flex;
  gap: t.$spacing-3;
  z-index: 5;
}
.btn {
  flex: 1;
  height: 80rpx; line-height: 80rpx;
  border-radius: t.$radius-pill;
  font-size: t.$font-md;
  text-align: center;
  box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center; gap: 8rpx;
}
.btn-primary { background: t.$color-accent; color: t.$color-text-invert; }
.btn-primary.disabled { opacity: 0.5; }
.btn-ghost {
  background: transparent;
  color: t.$color-text-soft;
  border: 2rpx solid t.$color-border;
}
.btn-danger {
  background: transparent;
  color: t.$color-danger;
  border: 2rpx solid t.$color-danger;
  height: 80rpx; line-height: 80rpx;
}
</style>
