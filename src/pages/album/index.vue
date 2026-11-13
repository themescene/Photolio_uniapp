<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 相册模式播放页（2026-07-13 新增）
 *
 * 规格来自用户 2026-07-13 需求：
 *   - 网格 3 图 / 6 图 / 列表 三种查看模式
 *   - 多选批量下载（backend /share/<id>/album-download）
 *   - 事后追加媒体（复用 CreationFlow 的追加流程）
 *   - 保留原文件名 + EXIF（backend media_controller.py 已做，此处只需展示）
 *   - 卡顿视频提示（挂 useVideoStallDetector）
 *
 * 后端契约：
 *   GET  /share/<id>          → ShareDetail（相册模式的 report.episodes[0].images 是完整媒体列表）
 *   POST /share/<id>/album-download  → { zip_url, file_count }
 */
import { ref, computed, onMounted, watch } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import { storeToRefs } from "pinia";
import {
  fetchShare, fetchPermissions, requestAlbumBatchDownload, updateSharePermissions,
  updateShare, uploadShareVideo, pollVideoStatus, beginEdit, endEdit, appendShareSection,
} from "@/api/share";
import { uploadImage } from "@/api/round";
import type { EditPermissions } from "@/api/share";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import SvgIcon from "@/components/SvgIcon.vue";
import PermissionSheet from "@/components/PermissionSheet.vue";
// #ifdef H5
import H5ImagePreview from "@/components/H5ImagePreview.vue";
// #endif
import * as mediaCache from "@/utils/mediaCache";
import { useVideoStallDetector } from "@/composables/useVideoStallDetector";
import { ensurePrivacyAuthorized } from "@/utils/privacy";
import { STATIC_BASE, H5_PICK_MAX } from "@/config/env";
import { explainChatFileSourceOnce } from "@/utils/chat-file-hint";
import { useAuthStore } from "@/stores/auth";
import type { ShareDetail } from "@/types";

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

type ViewMode = "grid3" | "grid6" | "list";

const shareId = ref("");
const share = ref<ShareDetail | null>(null);
const permissions = ref<EditPermissions | null>(null);
const loading = ref(true);
const errorMsg = ref("");
const viewMode = ref<ViewMode>("grid3");

const selectionMode = ref(false);
const selected = ref<Set<string>>(new Set());
const downloading = ref(false);

const permissionSheetOpen = ref(false);

/**
 * 追加媒体的进度状态（2026-09-15 用户反馈"追加视频很慢，给个进度条"）。
 * 视频链路 = 大文件上传 (100MB-500MB, 家宽上行常见 20-60Mbps) → 后端转码 (10-120s) →
 * 前端轮询直到 status=done。原来只有 uni.showLoading("处理中 1/1")，用户看不到到底卡在哪。
 * 现在广播 phase + pct + elapsed，模板底部固定条实时显示；每个关键时刻打 log 便于诊断。
 */
interface AppendProgress {
  visible: boolean;
  total: number;        // 总文件数
  current: number;      // 当前正在处理的第几个（1-based）
  currentName: string;  // 文件名或"视频 / 图片"
  phase: "" | "uploading" | "transcoding" | "saving";
  uploadPct: number;    // 0-100，仅上传阶段有效
  startedAt: number;    // Date.now() 当前项开始时刻
}
const appendProgress = ref<AppendProgress>({
  visible: false, total: 0, current: 0, currentName: "",
  phase: "", uploadPct: 0, startedAt: 0,
});
/** 已耗时（秒）文本，1s 刷新一次 */
const appendElapsedText = ref("0s");
let _appendElapsedTimer: ReturnType<typeof setInterval> | null = null;
function _startAppendTicker() {
  _appendElapsedTimer && clearInterval(_appendElapsedTimer);
  appendElapsedText.value = "0s";
  _appendElapsedTimer = setInterval(() => {
    const sec = Math.round((Date.now() - appendProgress.value.startedAt) / 1000);
    appendElapsedText.value = sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
  }, 1000);
}
function _stopAppendTicker() {
  if (_appendElapsedTimer) { clearInterval(_appendElapsedTimer); _appendElapsedTimer = null; }
}

interface AlbumMedia {
  /** 原图（本机缓存优先）—— 只在预览 / 全屏播放 / 下载时用，**绝不进网格** */
  url: string;
  media_type: "image" | "video";
  /** 网格 / 列表统一用这一档缩略图（backend 现在只产 200px q60，约 3-5KB） */
  thumb_url: string;
  thumbnail_url?: string;
  original_filename?: string;
  size_bytes?: number;
  taken_at?: string;
  has_gps?: boolean;
  camera_model?: string;
  /** 2026-09-16：删除权限判定 —— backend 要求 episode.author_id === user_id 才能改 episode.images
       所以每张 media 必须记录来源 episode + author，前端才能：
         · 判定当前用户能否删这张
         · 删除时按 episode_id 分组，逐 episode 减 images 再 PUT */
  episode_id?: number;
  episode_author_id?: string;
}

// 2026-07-13：本地缓存优先 —— 本机上传过的媒体直接读 uni.saveFile 存的 wxfile://xxx，
// 避免每次进相册都从 CDN 拉一遍（用户明确要求）。若无本地缓存则回落远端。
function _cacheAware(url?: string): string | undefined {
  if (!url) return url;
  return mediaCache.resolve(url) || url;
}

/**
 * 网格 / 列表要显示的小图 URL。
 *
 * 2026-09-14：相册"打开卡 + 翻阅卡"的根因不是布局，是**网格直接加载原图**。
 * 证据链：`/api/upload-image` 的 media_meta 只有 image_url / original_filename /
 * size_bytes + EXIF，从来没写过 thumbnail_url（见 media_controller.py），
 * 而模板是 `:src="m.thumbnail_url || m.url"` → 全部回落原图。
 *
 * 三级取值（**不要**在这里回落到原图，回落原图就是把 bug 放回去）：
 *   1. manifest 里已有后端缩略图（视频封面 / 新上传的图）→ 直接用
 *   2. 存量数据没有 → 加 `?thumb=1` 让后端按需派生 720px 缩略图并落盘缓存
 *   3. 本地 wxfile:// / blob: 之类非 http 路径 → 只能用原路径
 */
function _gridThumb(rawImageUrl: string, thumbnailUrl?: string): string {
  if (thumbnailUrl && thumbnailUrl !== rawImageUrl) return thumbnailUrl;
  if (/^https?:\/\//i.test(rawImageUrl)) {
    // 直接请求派生文件名 `<stem>__gthumb.jpg`：文件在 → nginx 静态直发；
    // 不在 → 前端 @error 回落原图（"缩略图是加速手段，不能成为能不能看到图的前提"）。
    // 没有 query string，CDN 可缓存。
    const q = rawImageUrl.indexOf("?");
    const base = q >= 0 ? rawImageUrl.slice(0, q) : rawImageUrl;
    const tail = q >= 0 ? rawImageUrl.slice(q) : "";
    const dot = base.lastIndexOf(".");
    const slash = base.lastIndexOf("/");
    if (dot > slash) return base.slice(0, dot) + "__gthumb.jpg" + tail;
  }
  return rawImageUrl;
}

// 相册模式的媒体列表：聚合所有 episode.images
// 2026-09-16：之前只读 episode[0].images —— owner 初始那 1 个 episode。
// 非 owner 追加走 backend `append-section` 建**新 episode**（backend 契约：episode.author_id
// 只能 owner 改 images），非 owner 的追加内容在 episode[1..N]，不聚合就在相册视图看不到。
// 每张 media 标注来源 episode_id + episode_author_id，删除时按 episode 分组 + 权限校验。
const mediaList = computed<AlbumMedia[]>(() => {
  const eps = share.value?.report?.episodes || [];
  if (!eps.length) return [];
  const imgs: Array<{ raw: unknown; epId?: number; epAuthor?: string }> = [];
  for (const ep of eps) {
    const epTyped = ep as { episode_id?: number; author_id?: string; images?: unknown[] };
    for (const raw of (epTyped?.images ?? [])) {
      imgs.push({ raw, epId: epTyped.episode_id, epAuthor: epTyped.author_id });
    }
  }
  return imgs
    .map(({ raw, epId, epAuthor }): AlbumMedia | null => {
      const it = raw;
      const x = it as {
        image_url?: string;
        media_type?: string;
        thumbnail_url?: string;
        original_filename?: string;
        size_bytes?: number;
        taken_at?: string;
        has_gps?: boolean;
        camera_model?: string;
      };
      const rawUrl = x.image_url || "";
      const url = _cacheAware(rawUrl) || "";
      if (!url) return null;
      const t = (x.media_type === "video" ? "video" : "image") as "image" | "video";
      return {
        url,
        media_type: t,
        // 缩略图走远端小图，**不**经 _cacheAware —— 本地缓存存的是原图，
        // 拿本地原图渲网格等于没修（解码 20MB JPEG 才是真正的卡顿源）
        thumb_url: _gridThumb(rawUrl, x.thumbnail_url),
        thumbnail_url: _cacheAware(x.thumbnail_url),
        original_filename: x.original_filename,
        size_bytes: x.size_bytes,
        taken_at: x.taken_at,
        has_gps: x.has_gps,
        camera_model: x.camera_model,
        episode_id: epId,
        episode_author_id: epAuthor,
      };
    })
    .filter((x): x is AlbumMedia => !!x);
});

/**
 * 分批渲染：一次性把几百个 <image> 塞进网格，mp-weixin 的原生 image 组件会同时
 * 发起几百个请求 + 创建几百个原生视图层，这是"翻阅卡"的第二个来源。
 * 首屏 60 个，滚到底再加 60 —— 与 MasonryFeed 一样只做增量，不做整块重排。
 */
/**
 * 缩略图取不到时降级到原图的记录（key = m.url）。
 *
 * 为什么需要：缩略图是纯加速手段。派生文件可能还没生成、服务端规则可能没部署、
 * CDN 可能缓存了 404 —— 任何一种都不该让用户看到裂图。
 * 2026-09-14 实测踩过：nginx named location 是 server 局部作用域，
 * 补丁只在一个 server block 里插了定义，主域引用不到 → 整屏 500/404。
 */
const thumbFailed = ref<Set<string>>(new Set());

function thumbSrc(m: AlbumMedia): string {
  if (thumbFailed.value.has(m.url)) return m.url;
  // 2026-09-14 v3：单档 200px q60，grid3 / grid6 / 列表共用（用户明确"再压一半"）
  return m.thumb_url;
}

// v-for scoped var 一律走 :data-item-id + _resolveItem（CLAUDE.md 模板 pitfall / R11.9）
function onThumbError(e: Event) {
  const id = (e as unknown as {
    currentTarget?: { dataset?: { itemId?: string } }
  })?.currentTarget?.dataset?.itemId;
  if (!id || thumbFailed.value.has(id)) return;
  logger.warn("[album] 缩略图加载失败，回落原图", { url: id });
  thumbFailed.value.add(id);
  thumbFailed.value = new Set(thumbFailed.value);   // Set mutate 不触发响应
}

// ═══════════════════════════════════════════════════════════════════════
// 视口窗口化（2026-09-14 用户规格：「页面之外超过半个屏幕就不加载」）
//
// 上一版是"只增不减"的分批（滚到底 +60），114 张滚到底后仍然有 114 个原生 <image>
// 同时挂在树上 —— 这正是用户说「已经是缩略图了，数量一多还是卡」的原因。
// 真正的相册软件都是**窗口化**：只渲染视口 ± 半屏内的行，滚出去的行卸载，
// 上下用占位撑住滚动高度，滚动条长度和位置保持正确。
//
// 行高的来源：实测 .scroll 的内容宽 → 算出 cellSize → **显式写进 grid-auto-rows**。
// 也就是说渲染高度按构造等于 JS 算的行高，不存在"CSS 以为的"和"JS 以为的"两套数。
// 只需在挂载 / 数据到位 / 切视图 / 窗口 resize 时各测一次宽度，滚动过程零测量，
// 不会触发 layout thrash。
// ═══════════════════════════════════════════════════════════════════════
// 2026-09-14 v3：**去掉窗口化 + 去掉 rect 测量**。用户第 4 轮反馈"重构整个系统"。
// 前两版为了防"网格拉原图 5-20MB"做了 windowing，但缩略图现在已经压到 3-5KB × 200
// 张 ≈ 1MB，一次性都渲染完全没有性能压力；反倒是窗口化本身引入了行高漂移 / rowRange
// 边界 / scroll-view flex 高度算不出等一堆问题，反复 4 轮没稳住。
//
// 现在：`<scroll-view>` 内 v-for 直接遍历 mediaList，CSS grid + aspect-ratio:1/1 自撑
// 高度，`<image lazy-load>` 交给平台按需加载。cellSize / rowHeight / padTop / padBottom
// / _measureViewport / onGridScroll / scrollTop / viewportH / scrollHeight 全部删。


const albumTitle = computed(
  () => share.value?.report?.report_title || "相册",
);

async function loadAlbum() {
  loading.value = true;
  try {
    share.value = await fetchShare(shareId.value);
    permissions.value = await fetchPermissions(shareId.value).catch(() => null);
    // 2026-07-14：来自 share/play「下载媒体」入口 → 直接进选择态 + 全选
    if (autoSelectAll.value && mediaList.value.length > 0) {
      selectionMode.value = true;
      selected.value = new Set(mediaList.value.map((m) => m.url));
      autoSelectAll.value = false;   // 一次性，防翻页/刷新重复触发
    }
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "加载失败";
    logger.warn("[album] load failed", e);
  } finally {
    loading.value = false;
  }
}

// 2026-07-14：长按 cell 进入多选 + 选中该项（相册模式常态交互，用户明确要求）
// mp-weixin 长按后会立刻再触发 click，用 _justLongPressed 拦住 300ms 内的 tap
let _justLongPressed = false;
let _lpTimer: ReturnType<typeof setTimeout> | null = null;
function onCellLongPress(url: string) {
  _justLongPressed = true;
  if (_lpTimer) clearTimeout(_lpTimer);
  _lpTimer = setTimeout(() => { _justLongPressed = false; }, 350);
  if (!selectionMode.value) {
    selectionMode.value = true;
    selected.value = new Set([url]);
    return;
  }
  if (selected.value.has(url)) selected.value.delete(url);
  else selected.value.add(url);
  selected.value = new Set(selected.value);
}

// 2026-07-14：`?select=1` 进入即多选并默认全选（share/play 的「下载媒体」入口用）
const autoSelectAll = ref(false);
onLoad((opt) => {
  shareId.value = (opt?.id as string) || "";
  autoSelectAll.value = String((opt as { select?: string })?.select || "") === "1";
  if (!shareId.value) {
    loading.value = false;
    errorMsg.value = "缺少 id 参数";
    return;
  }
  loadAlbum();
});

onMounted(() => {
  try { uni.hideTabBar({ animation: false, fail: () => {} }); } catch { /* h5 */ }
});

function goBack() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/index/index" });
}

function switchView(v: ViewMode) {
  viewMode.value = v;
}

function toggleSelection() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) selected.value.clear();
}

// 2026-07-13：视频全屏播放器 + 卡顿检测
const playingVideoUrl = ref<string>("");
const playingVideoPoster = ref<string>("");
const albumVideoStall = useVideoStallDetector(() => playingVideoUrl.value);

// 2026-09-16 v3：H5 自建 preview modal 状态。mp-weixin 走 uni.previewImage 不用这些。
const h5PreviewVisible = ref(false);
const h5PreviewUrls = ref<string[]>([]);
const h5PreviewInitialIdx = ref(0);
function playVideo(url: string, poster?: string) {
  playingVideoUrl.value = url;
  playingVideoPoster.value = poster || "";
}
function closeVideoPlayer() {
  playingVideoUrl.value = "";
  playingVideoPoster.value = "";
}

function toggleSelect(url: string) {
  // 长按后 mp-weixin 会立刻再触发 tap；拦住这个假触发
  if (_justLongPressed) return;
  // 2026-09-15：手机 Edge 首次点击图不弹预览 bug 的诊断日志（用户切桌面版再切回来就好了）。
  // 如果 log 出但预览不出 → uni-h5 previewImage 首次未初始化；
  // 如果 log 不出 → click handler 根本没触发（z-index / pointer-events 问题）。
  logger.info("[album] cell tap", { url, selectionMode: selectionMode.value });
  if (!selectionMode.value) {
    // 单击非选择态：图/视频区别处理
    const m = mediaList.value.find((x) => x.url === url);
    if (m?.media_type === "video") {
      // 2026-07-13：弹全屏播放器；poster 用 thumbnail_url 承载首帧
      playVideo(url, m.thumbnail_url || "");
      return;
    }
    // 2026-09-16 v3：H5 走**自建 preview modal**（H5ImagePreview.vue），DOM 里一次
    // 只 render 当前图 → 不撞 h2 上限 → 无边界灰、无限翻。
    // 前史：188 崩 → 窗口 ±10 用户报"左灰" → ±20 用户仍报"翻 20 张卡住" → 根治。
    // mp-weixin 继续走 uni.previewImage（微信原生预览不是 h2 batch fetch，无此问题）。
    const allUrls = mediaList.value.filter((mm) => mm.media_type === "image").map((mm) => mm.url);
    const curIdx = allUrls.indexOf(url);
    logger.info("[album] preview open", {
      current: url, curIdx, totalCount: allUrls.length,
    });
    // #ifdef H5
    h5PreviewUrls.value = allUrls;
    h5PreviewInitialIdx.value = Math.max(0, curIdx);
    h5PreviewVisible.value = true;
    // #endif
    // #ifndef H5
    uni.previewImage({
      current: url, urls: allUrls,
      success: () => logger.info("[album] previewImage success"),
      fail: (err) => logger.warn("[album] previewImage fail", err),
    });
    // #endif
    return;
  }
  if (selected.value.has(url)) selected.value.delete(url);
  else selected.value.add(url);
  // 强制触发响应：Set 的 mutate 不会自动 trigger
  selected.value = new Set(selected.value);
}

function selectAll() {
  if (selected.value.size === mediaList.value.length) {
    selected.value = new Set();
  } else {
    selected.value = new Set(mediaList.value.map((m) => m.url));
  }
}

// 2026-09-16：单张删除的权限判定 + 批量删除。
// backend 契约（share_service.update_share episode_patch）：
//   ep.author_id 存在时**只有 author_id === user_id 才能改 episode.images**
//   → 前端按同一规则拦：owner 能删无 author_id 或 author_id === owner 的 episode；
//     非 owner 只能删自己 author 的 episode
// 删除实现：按 episode_id 分组，每组 filter 掉选中项后 PUT update-share episode_patch
function _canDeleteMedia(m: AlbumMedia): boolean {
  const uid = user.value?.user_id;
  const epAuthor = m.episode_author_id;
  // episode 无 author_id（老数据 / 相册主 episode）→ 只 owner 能删
  if (!epAuthor) return !!permissions.value?.is_owner;
  // episode 有 author_id → 只 author 本人能删（含 owner 追加过的场景）
  return !!uid && epAuthor === uid;
}

const selectedDeletable = computed(() => {
  // 选中项里有多少张当前用户能删
  const sel = selected.value;
  return mediaList.value.filter((m) => sel.has(m.url) && _canDeleteMedia(m)).length;
});
const selectedUndeletable = computed(() => selected.value.size - selectedDeletable.value);

async function onBatchDelete() {
  if (!shareId.value) return;
  const sel = selected.value;
  if (sel.size === 0) {
    uni.showToast({ title: "请先选择要删除的媒体", icon: "none" });
    return;
  }
  // 分组：只允许对可删的做
  const deletable = mediaList.value.filter((m) => sel.has(m.url) && _canDeleteMedia(m));
  if (deletable.length === 0) {
    uni.showToast({ title: "所选媒体你都无权删除（只能删自己追加的）", icon: "none", duration: 3000 });
    return;
  }
  const confirmed = await new Promise<boolean>((r) => {
    uni.showModal({
      title: "确认删除",
      content: selectedUndeletable.value > 0
        ? `将删除 ${deletable.length} 张（其余 ${selectedUndeletable.value} 张非你追加，跳过）。删除后不可恢复。`
        : `将删除 ${deletable.length} 张。删除后不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
      confirmColor: "#C44A4A",
      success: (res) => r(!!res.confirm),
      fail: () => r(false),
    });
  });
  if (!confirmed) return;

  // 按 episode_id 分组。**主 episode 的 episode_id 是 None**（老数据没这字段），
  // 前端映射成 undefined —— 之前 `if (undefined) continue` 直接跳过 → groups:0 → 0 张删除。
  // backend `ep.get('episode_id') == ep_id` 允许 None == None 匹配，body 传 null 即可命中主 episode。
  // 分组 key 统一用 `null` 表示"主 episode"，用数字表示 append-section 建的 episode。
  const toDelete = new Set(deletable.map((m) => m.url));
  const epGroups = new Map<number | null, AlbumMedia[]>();
  for (const m of deletable) {
    const key: number | null = m.episode_id ?? null;
    if (!epGroups.has(key)) epGroups.set(key, []);
    epGroups.get(key)!.push(m);
  }
  logger.info("[album-delete] start", { total: deletable.length, groups: epGroups.size });

  // 2026-09-16：backend 编辑锁一 share 一把，串行 begin/update/end。
  // 每步都 log 便于诊断"哪一步卡住 / 抛错"（用户实测有 request 静默 pending 的迹象）
  let lockAcquired = false;
  try {
    logger.info("[album-delete] beginEdit request");
    await beginEdit(shareId.value);
    logger.info("[album-delete] beginEdit OK");
    lockAcquired = true;
    let successCount = 0;
    for (const [epId, items] of epGroups) {
      // 找 episode 现有 images，filter 掉待删的 url（epId=null → 匹主 episode）
      const ep = share.value?.report?.episodes?.find(
        (e) => ((e as { episode_id?: number | null })?.episode_id ?? null) === epId,
      ) as { episode_id?: number | null; images?: Array<{ image_url?: string }> } | undefined;
      if (!ep) {
        logger.warn("[album-delete] ep not found", { epId });
        continue;
      }
      const remaining = (ep.images || []).filter(
        (img) => !toDelete.has(img?.image_url || ""),
      );
      logger.info("[album-delete] ep patch request", {
        epId, before: (ep.images || []).length, after: remaining.length,
      });
      try {
        await updateShare(shareId.value, {
          // epId 为 null 时传 null 命中主 episode（backend None == None 匹配）
          episode_patch: { episode_id: epId, images: remaining },
        });
        logger.info("[album-delete] ep patch OK", { epId });
        successCount += items.length;
      } catch (e) {
        logger.warn("[album-delete] ep patch failed", { epId, e });
      }
    }
    logger.info("[album-delete] all done", { successCount, expected: deletable.length });
    uni.showToast({
      title: successCount === deletable.length
        ? `已删除 ${successCount} 张`
        : `${successCount}/${deletable.length} 删除成功`,
      icon: successCount === deletable.length ? "success" : "none",
      duration: 2500,
    });
    selected.value = new Set();
    selectionMode.value = false;
    await loadAlbum();
  } catch (e) {
    logger.warn("[album-delete] outer failed", e);
    const errMsg = e instanceof ApiError ? e.message : "";
    uni.showToast({ title: errMsg || "删除失败", icon: "none", duration: 3000 });
  } finally {
    if (lockAcquired) {
      logger.info("[album-delete] endEdit request");
      try { await endEdit(shareId.value); logger.info("[album-delete] endEdit OK"); }
      catch (e) { logger.warn("[album-delete] endEdit failed", e); }
    }
  }
}

async function onBatchDownload() {
  if (!shareId.value) return;
  const urls = Array.from(selected.value);
  if (urls.length === 0) {
    uni.showToast({ title: "请先选择要下载的媒体", icon: "none" });
    return;
  }
  downloading.value = true;

  // #ifdef MP-WEIXIN
  // 2026-07-14 用户明确反驳「为啥不能直接下载到本地？APP 是可以的，微信小程序为啥不能」——
  // 我上轮说「不能」是错的：mp-weixin 有 uni.saveImageToPhotosAlbum / uni.saveVideoToPhotosAlbum，
  // 只是首次要弹一次「保存图片和视频到相册」权限。改成逐个 downloadFile → saveXToPhotosAlbum。
  // 用户不再需要复制链接到电脑。
  await _saveBatchToPhotosAlbum(urls);
  downloading.value = false;
  return;
  // #endif

  // #ifdef H5
  // 网页版：backend 打包 zip → 用 <a download> 触发浏览器保存（避开弹窗拦截）
  try {
    const r = await requestAlbumBatchDownload(shareId.value, urls);
    if (!r.zip_url) throw new Error("打包失败");
    const host = STATIC_BASE + r.zip_url;
    // H5 里可以直接摸到 document；uni-app 编译到 h5 保留 DOM API
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (doc) {
      const a = doc.createElement("a");
      a.href = host;
      a.download = `${albumTitle.value || "album"}.zip`;
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
    } else {
      // 兜底：没 document 就 window.open
      (globalThis as unknown as { open?: (u: string, t: string) => void })
        .open?.(host, "_blank");
    }
    uni.showToast({ title: `已开始下载 ${r.file_count} 个文件`, icon: "success" });
    selectionMode.value = false;
    selected.value.clear();
  } catch (e) {
    logger.warn("[album] batch download failed", e);
    uni.showToast({
      title: e instanceof ApiError ? e.message : "下载失败",
      icon: "none", duration: 3000,
    });
  } finally {
    downloading.value = false;
  }
  // #endif
}

// 2026-07-14：mp-weixin 逐个下载 → 保存到系统相册
// - 图片走 saveImageToPhotosAlbum；视频走 saveVideoToPhotosAlbum
// - 第一次调用会弹「保存图片和视频到相册」权限；一次授权覆盖后续所有保存
// - 拒绝授权 → 引导去 uni.openSetting 开权限，然后允许重试
async function _saveBatchToPhotosAlbum(urls: string[]) {
  let ok = 0;
  let fail = 0;
  const total = urls.length;
  uni.showLoading({ title: `保存中 0 / ${total}`, mask: true });
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const m = mediaList.value.find((x) => x.url === url);
    if (!m) { fail++; continue; }
    try {
      // 2026-07-14：`url` 可能是 wxfile://（mediaCache 本地缓存过）也可能是 https://
      // 前者直接当 filePath 用；后者要先 downloadFile
      let filePath = "";
      if (url.startsWith("wxfile://") || url.startsWith("file://") || url.startsWith("http://tmp/")) {
        filePath = url;
      } else {
        const dl = await new Promise<{ tempFilePath: string; statusCode: number }>((resolve, reject) => {
          uni.downloadFile({
            url,
            success: (r) => resolve(r as { tempFilePath: string; statusCode: number }),
            fail: reject,
          });
        });
        if (dl.statusCode !== 200 || !dl.tempFilePath) {
          throw new Error(`下载失败 HTTP ${dl.statusCode}`);
        }
        filePath = dl.tempFilePath;
      }
      if (m.media_type === "video") {
        await new Promise<void>((resolve, reject) => {
          uni.saveVideoToPhotosAlbum({
            filePath,
            success: () => resolve(),
            fail: reject,
          });
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          uni.saveImageToPhotosAlbum({
            filePath,
            success: () => resolve(),
            fail: reject,
          });
        });
      }
      ok++;
      uni.showLoading({ title: `保存中 ${i + 1} / ${total}`, mask: true });
    } catch (e) {
      const errMsg = String((e as { errMsg?: string })?.errMsg || "");
      logger.warn("[album] save one failed", { url, errMsg });
      // 权限拒绝 → 停下来弹一次 modal 引导到 setting，不然循环里每张都弹一次
      if (errMsg.includes("auth deny") || errMsg.includes("authorize:fail")) {
        uni.hideLoading();
        uni.showModal({
          title: "需要相册权限",
          content: "请在小程序设置里允许「保存图片和视频到相册」，然后重新下载。",
          confirmText: "去设置",
          cancelText: "取消",
          success: (r) => {
            if (r.confirm) uni.openSetting({});
          },
        });
        return;
      }
      fail++;
    }
  }
  uni.hideLoading();
  if (fail === 0) {
    uni.showToast({ title: `全部 ${ok} 个已保存到相册`, icon: "success", duration: 2500 });
  } else if (ok === 0) {
    uni.showToast({ title: `${fail} 个全部失败`, icon: "none", duration: 3000 });
  } else {
    uni.showToast({ title: `${ok} 个成功 · ${fail} 个失败`, icon: "none", duration: 3000 });
  }
  selectionMode.value = false;
  selected.value.clear();
}

// 2026-07-13：视图切换 —— 用画匣子模板方式查看同一份 media
// 只是导航到 share/play；share/play 端也会显示「以相册视图查看」互开
function switchToMemoryView() {
  if (!shareId.value) return;
  uni.redirectTo({ url: `/pages/share/play?id=${encodeURIComponent(shareId.value)}` });
}
// 2026-07-14 用户反馈根因修：之前 onAddMore 走 PENDING_GROUP_ID → 切 upload tab → CreationFlow，
// 导致相册被错误当成"合集追加章节"路径：
//   - 微信 chooseMedia 硬限 9 张（合集模式 count=9）
//   - creationMode 被 pendingGroupName 锁到 "group"，originalQuality 不会自动开 → 上传全被压缩到 77KB
//   - 相册追加视频后本地保存的是"新章节"，导致相册变第一章、视频变第二章的合集
//
// 修法：直接在 album 页里 chooseMedia + upload-image / upload-video，然后 PUT 更新 share.report.episodes[0].images
// 原图强制 = true（相册模式的语义）
// 2026-09-16：跟 share/play.vue canContribute 完全一致（owner || access_level>=2）
// 之前只让 owner 追加，用户抱怨"非 owner 相册模式没入口，只能切画匣子模式追加，
// 结果加成了新章节，把相册模式串成了画匣子模式"。
// 现在：非 owner 也能追加，且直接进 episode.images 而不是新建章节。
const canContribute = computed(() => {
  const p = permissions.value;
  if (!p) return false;
  if (p.is_owner) return true;
  return (p.access_level ?? 2) >= 2;
});

async function onAddMore() {
  if (!shareId.value) return;
  if (!canContribute.value) {
    uni.showToast({ title: "该画匣子暂不允许追加", icon: "none" });
    return;
  }
  // 2026-09-17 契约翻转（用户明确决策）：**不再推 chooseMessageFile**（"从聊天文件选"
  // 入口太抽象，用户报"选个聊天对话后显示无内容"—— chooseMessageFile 打开的是"用户微信
  // 聊天里以文件形式发过的文件"不是相册，没发过就是空，正常但反直觉）。改成：**直接走
  // chooseMedia sizeType=['original'] 相册原图模式**。EXIF 保不住就算了不要求。
  // 大批量上传的场景引导用户去 h5 网页版（[R14 契约更新] 已同步 CLAUDE.md）。
  await _pickFromAlbum();
}

async function _pickFromAlbum() {
  // #ifdef H5
  // 2026-09-14：改用 uni.chooseFile（type:"all"）**同时支持图片和视频**。
  //
  // 之前用 uni.chooseImage，accept 被写死成 image/*，且 normalized 里 fileType
  // 硬编码为 "image" —— 用户选了视频也会被当图片送去 /api/upload-image，
  // 后端直接 400「图片格式不支持」。用户实测日志：
  //   POST /api/upload-image?original=true 400 → [album] append one failed
  //   {idx: 0, e: ApiError: 图片格式不支持}
  // 而 _appendMediaToAlbum **本来就有完整的视频分支**（uploadShareVideo + 轮询转码），
  // 只是永远走不到。这里把 fileType 按真实扩展名/MIME 判出来即可。
  try {
    const VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "avi", "mkv", "3gp"];
    const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp"];
    const chooseFileApi = (uni as unknown as {
      chooseFile?: (o: Record<string, unknown>) => void;
    }).chooseFile;

    const res = await new Promise<{
      tempFilePaths?: string[];
      tempFiles?: Array<{ name?: string; size?: number; type?: string }>;
    }>((resolve, reject) => {
      const opts = {
        count: H5_PICK_MAX,
        type: "all",
        extension: [...IMAGE_EXT, ...VIDEO_EXT].map((e) => "." + e),
        success: resolve,
        fail: reject,
      };
      // chooseFile 在老版本 uni-h5 上可能缺失 → 回落 chooseImage（只能选图，但不至于崩）
      if (chooseFileApi) chooseFileApi(opts);
      else uni.chooseImage({
        count: H5_PICK_MAX, sourceType: ["album", "camera"], sizeType: ["original"],
        success: resolve as never, fail: reject,
      });
    });

    const paths = res.tempFilePaths || [];
    if (paths.length === 0) return;
    const tempFiles = res.tempFiles || [];
    const normalized = paths.map((p, i) => {
      const tf = tempFiles[i] || {};
      const nm = tf.name || "";
      const ext = (nm.split(".").pop() || "").toLowerCase();
      const mime = (tf.type || "").toLowerCase();
      const isVideo = mime.startsWith("video/") || VIDEO_EXT.includes(ext);
      return {
        tempFilePath: p,
        fileType: isVideo ? "video" : "image",
        size: tf.size || 0,
        name: nm,   // H5 里能拿到真名
      };
    });
    logger.info("[album] H5 追加选中", {
      总数: normalized.length,
      图片: normalized.filter((n) => n.fileType === "image").length,
      视频: normalized.filter((n) => n.fileType === "video").length,
    });
    await _appendMediaToAlbum(normalized);
  } catch (e) {
    const errMsg = String((e as { errMsg?: string })?.errMsg || "");
    if (errMsg.includes("cancel")) return;
    logger.warn("[album] h5 chooseImage failed", e);
    const safe = /[a-zA-Z]{4,}/.test(errMsg) ? "选择失败，请重试" : (errMsg || "选择失败");
    uni.showToast({ title: safe, icon: "none", duration: 3000 });
  }
  return;
  // #endif
  // #ifndef H5
  try {
    const res = await new Promise<UniApp.ChooseMediaSuccessCallbackResult>((resolve, reject) => {
      uni.chooseMedia({
        count: 20,
        mediaType: ["mix"],
        sourceType: ["album", "camera"],
        sizeType: ["original"],
        success: resolve,
        fail: reject,
      });
    });
    const files = (res as { tempFiles?: Array<{ tempFilePath: string; fileType: string; size?: number; thumbTempFilePath?: string }> }).tempFiles || [];
    if (files.length === 0) return;
    // 转成统一格式（无真名）→ 交给 _appendMediaToAlbum
    const normalized = files.map((f) => ({
      tempFilePath: f.tempFilePath,
      fileType: f.fileType,   // 'image' | 'video'
      size: f.size || 0,
      name: "",               // chooseMedia 拿不到真名
    }));
    await _appendMediaToAlbum(normalized);
  } catch (e) {
    const errMsg = String((e as { errMsg?: string })?.errMsg || "");
    if (errMsg.includes("cancel")) return;
    logger.warn("[album] chooseMedia failed", e);
    uni.showToast({ title: "选择失败", icon: "none" });
  }
  // #endif
}

async function _pickFromChatFiles() {
  // 2026-07-14 用户明确要求：类似飞书云盘，让文件保留 EXIF + 原文件名
  // chooseMessageFile 是 mp-weixin 里唯一能拿到原始文件名 + 完整二进制的接口
  // 用户先把文件从系统文件管理器发到"文件传输助手"，然后在小程序里选它
  //
  // 2026-07-23 hotfix12：先弹步骤引导 modal（真因是"没在微信里作为文件发过"，而非隐私声明）
  const guideOk = await explainChatFileSourceOnce();
  if (!guideOk) return;
  // 2026-07-19 hotfix11：chooseMessageFile 从 2.32.3 起是隐私接口，
  // 新账号未 preflight 时会出现"无内容"的选择器（scope 未声明的直接失败态）
  const ok = await ensurePrivacyAuthorized();
  if (!ok) {
    uni.showToast({ title: "需先同意隐私协议才能选文件", icon: "none", duration: 3000 });
    return;
  }
  try {
    const res = await new Promise<{ tempFiles?: Array<{ path: string; name: string; size: number; type?: string; time?: number }> }>((resolve, reject) => {
      uni.chooseMessageFile({
        count: 20,
        type: "file",
        // 允许所有常见图 / 视频扩展名。HEIC 需要 backend 转 JPEG（media_controller 已有 fallback）
        extension: [
          "jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp",
          "mp4", "mov", "m4v", "webm", "avi", "mkv",
        ],
        success: (r) => resolve(r as { tempFiles?: Array<{ path: string; name: string; size: number; type?: string; time?: number }> }),
        fail: reject,
      });
    });
    const files = res.tempFiles || [];
    if (files.length === 0) return;
    // 判断文件类型：靠扩展名（chooseMessageFile 不给 fileType）
    const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]);
    const normalized = files.map((f) => {
      const ext = (f.name || "").toLowerCase().split(".").pop() || "";
      const isVideo = VIDEO_EXTS.has(ext);
      return {
        tempFilePath: f.path,
        fileType: isVideo ? "video" : "image",
        size: f.size,
        name: f.name || "",   // 真名！
      };
    });
    await _appendMediaToAlbum(normalized);
  } catch (e) {
    const errMsg = String((e as { errMsg?: string })?.errMsg || "");
    if (errMsg.includes("cancel")) return;
    if (/scope/i.test(errMsg)) {
      uni.showModal({
        title: "「聊天文件」权限未开",
        content: "小程序尚未开通「聊天文件」隐私接口。请管理员在小程序后台「用户隐私保护指引」里加入「聊天文件」，或先从相册选一次绕过。",
        showCancel: false,
      });
      return;
    }
    logger.warn("[album] chooseMessageFile failed", e);
    // 合规红线（R8）：不 toast raw 英文 errMsg
    const safeMsg = /[a-zA-Z]{4,}/.test(errMsg) ? "选择文件失败，请重试" : (errMsg || "选择文件失败");
    uni.showToast({ title: safeMsg, icon: "none", duration: 3000 });
  }
}

async function _appendMediaToAlbum(
  files: Array<{ tempFilePath: string; fileType: string; size?: number; thumbTempFilePath?: string; name?: string }>,
) {
  const sessionForAlbum = `album_${shareId.value}`;
  const newMedia: Array<Record<string, unknown>> = [];
  let ok = 0;
  let fail = 0;
  appendProgress.value = {
    visible: true, total: files.length, current: 0, currentName: "",
    phase: "", uploadPct: 0, startedAt: Date.now(),
  };
  logger.info("[album-append] 开始", { count: files.length, sessionId: sessionForAlbum });

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const isVideo = f.fileType === "video";
    appendProgress.value = {
      ...appendProgress.value,
      current: i + 1,
      currentName: f.name || (isVideo ? "视频" : "图片"),
      phase: "uploading",
      uploadPct: 0,
      startedAt: Date.now(),
    };
    _startAppendTicker();
    logger.info("[album-append] 处理", {
      idx: i + 1, total: files.length,
      type: f.fileType, name: f.name, sizeMB: f.size ? (f.size / 1024 / 1024).toFixed(1) : "?",
    });
    try {
      // 2026-07-14：文件模式（chooseMessageFile）能拿到 f.name = "IMG_20250712_143022.jpg"；相册模式为空串
      const nameOverride = f.name || undefined;
      if (isVideo) {
        // 视频：上传（带进度） → 轮询转码；原图模式 true
        const t0 = Date.now();
        const up = await uploadShareVideo(
          f.tempFilePath, sessionForAlbum,
          (p) => { appendProgress.value = { ...appendProgress.value, uploadPct: p }; },
          true, nameOverride,
        );
        const uploadMs = Date.now() - t0;
        logger.info("[album-append] 上传完成 → 转码", { idx: i + 1, uploadMs, jobId: up.job_id });
        appendProgress.value = { ...appendProgress.value, phase: "transcoding", uploadPct: 100 };

        // 最多等 10 分钟
        const deadline = Date.now() + 10 * 60_000;
        let sVideoUrl = "";
        let sThumb: string | undefined;
        let sMeta: Record<string, unknown> = {};
        let pollCount = 0;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 3500));
          pollCount++;
          try {
            const s = await pollVideoStatus(up.job_id);
            if (s.status === "done" && s.video_url) {
              sVideoUrl = s.video_url;
              sThumb = s.thumbnail_url || undefined;
              sMeta = {
                original_filename: s.original_filename,
                size_bytes: s.size_bytes,
                taken_at: s.taken_at,
              };
              logger.info("[album-append] 转码完成", { idx: i + 1, pollCount, videoUrl: sVideoUrl });
              break;
            }
            if (s.status === "error") throw new Error(s.message || "转码失败");
          } catch (pollErr) {
            // 瞬时轮询错误继续等 —— 但每 10 次记一下，防"卡在转码没日志"
            if (pollCount % 10 === 0) logger.warn("[album-append] 轮询瞬时错", { idx: i + 1, pollCount, pollErr });
          }
        }
        if (!sVideoUrl) throw new Error("视频转码超时");
        newMedia.push({
          image_url: sVideoUrl,
          thumbnail_url: sThumb || "",
          media_type: "video",
          display_order: 999 + i,
          ...sMeta,
        });
        // 本地缓存原视频，之后 album 播放直接读本地
        void mediaCache.saveAfterUpload(sVideoUrl, f.tempFilePath);
      } else {
        // 图片：原图上传（?original=true）—— 保留 EXIF + 精确文件名/大小/日期
        const t0 = Date.now();
        const r = await uploadImage(f.tempFilePath, sessionForAlbum, undefined, true, nameOverride);
        logger.info("[album-append] 图片上传完成", { idx: i + 1, uploadMs: Date.now() - t0 });
        newMedia.push({
          image_url: r.image_url,
          thumbnail_url: r.thumbnail_url || r.image_url,
          media_type: "image",
          display_order: 999 + i,
          original_filename: r.original_filename,
          size_bytes: r.size_bytes,
          taken_at: r.taken_at,
          has_gps: r.has_gps,
          camera_model: r.camera_model,
        });
        void mediaCache.saveAfterUpload(r.image_url, f.tempFilePath);
      }
      ok++;
    } catch (e) {
      logger.warn("[album-append] one failed", { idx: i + 1, e });
      fail++;
    }
  }
  _stopAppendTicker();
  appendProgress.value = { ...appendProgress.value, phase: "saving" };

  if (newMedia.length === 0) {
    appendProgress.value = { ...appendProgress.value, visible: false };
    uni.showToast({ title: "全部追加失败", icon: "none", duration: 2500 });
    return;
  }

  // 2026-09-16：按 backend 契约分流 —— episode.author_id 校验只允许 author 改自己 episode 的 images。
  //   owner    → update-share episode_patch（改自己那 episode[0].images）
  //   非 owner → append-section 建**新 episode**，author_id 自动 = 该用户，image 直接放新 episode
  // 之前统一走 episode_patch → 非 owner 直接被拒"无权修改他人的回忆段落"（用户 2026-09-16 实测踩到）。
  const isOwner = !!permissions.value?.is_owner;
  if (isOwner) {
    // 合并到当前 share.report.episodes[0].images，PUT 更新
    // hotfix12: update-share 需 beginEdit → updateShare → endEdit 三步链，缺 beginEdit 会 409
    let lockAcquired = false;
    try {
      await beginEdit(shareId.value);
      lockAcquired = true;
      const eps = share.value?.report?.episodes || [];
      const ep0 = eps[0] as { episode_id?: number | null; images?: unknown[] } | undefined;
      const currentImages = (ep0?.images || []) as Array<Record<string, unknown>>;
      const merged = [...currentImages, ...newMedia];
      await updateShare(shareId.value, {
        episode_patch: {
          episode_id: ep0?.episode_id,
          images: merged,
        },
      });
      appendProgress.value = { ...appendProgress.value, visible: false };
      if (fail === 0) {
        uni.showToast({ title: `已追加 ${ok} 个媒体`, icon: "success", duration: 2000 });
      } else {
        uni.showToast({ title: `${ok} 个成功 · ${fail} 个失败`, icon: "none", duration: 3000 });
      }
      await loadAlbum();
    } catch (e) {
      appendProgress.value = { ...appendProgress.value, visible: false };
      logger.warn("[album-append] owner update-share failed", e);
      const errMsg = e instanceof ApiError ? e.message : "";
      const friendly = /他人正在编辑|编辑锁/i.test(errMsg) ? errMsg : (errMsg || "追加保存失败");
      uni.showToast({ title: friendly, icon: "none", duration: 3000 });
    } finally {
      if (lockAcquired) {
        try { await endEdit(shareId.value); } catch { /* ignore */ }
      }
    }
  } else {
    // 非 owner：append-section 建独立 episode（author_id 自动 = 该用户，不动 owner 的 episode）
    try {
      await appendShareSection(shareId.value, {
        template_id: "reflection",
        display_name: "",
        copywriting: { h1: "", h2: "", body: "" },
        images: newMedia,
      });
      appendProgress.value = { ...appendProgress.value, visible: false };
      if (fail === 0) {
        uni.showToast({ title: `已追加 ${ok} 个媒体`, icon: "success", duration: 2000 });
      } else {
        uni.showToast({ title: `${ok} 个成功 · ${fail} 个失败`, icon: "none", duration: 3000 });
      }
      await loadAlbum();
    } catch (e) {
      appendProgress.value = { ...appendProgress.value, visible: false };
      logger.warn("[album-append] non-owner append-section failed", e);
      const errMsg = e instanceof ApiError ? e.message : "";
      uni.showToast({ title: errMsg || "追加失败", icon: "none", duration: 3000 });
    }
  }
}

// —— 权限 / 分享 ——
const canManagePermissions = computed(() => !!permissions.value?.is_owner);
const localScope = computed<0 | 1 | 2 | 3>(() => {
  const v = permissions.value?.visibility;
  return (v === 0 || v === 1 || v === 2 || v === 3) ? v : 1;
});
const localLevel = computed<0 | 1 | 2>(() => {
  const a = permissions.value?.access_level;
  return (a === 0 || a === 1 || a === 2) ? a : 2;
});
function openPermissionSheet() { permissionSheetOpen.value = true; }
async function onSavePermissions(payload: { scope: 0 | 1 | 2 | 3; level: 0 | 1 | 2 }) {
  if (!shareId.value) return;
  try {
    await updateSharePermissions(shareId.value, {
      visibility: payload.scope,
      access_level: payload.level,
    });
    if (permissions.value) {
      permissions.value = {
        ...permissions.value,
        visibility: payload.scope,
        access_level: payload.level,
      };
    }
    permissionSheetOpen.value = false;
    uni.showToast({ title: "权限已更新", icon: "success" });
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : "更新权限失败",
      icon: "none", duration: 2500,
    });
  }
}
function onCopyAlbumLink() {
  const link = `${STATIC_BASE}/album/${shareId.value}`;
  uni.setClipboardData({
    data: link,
    success: () => uni.showToast({ title: "链接已复制", icon: "success" }),
  });
}
function onInviteToAlbum() {
  if (!shareId.value) return;
  uni.navigateTo({
    url: `/pages/share/invite?id=${encodeURIComponent(shareId.value)}&title=${encodeURIComponent(albumTitle.value)}`,
  });
}

onShareAppMessage(() => ({
  title: `「${albumTitle.value}」· 相册`,
  path: `/pages/album/index?id=${encodeURIComponent(shareId.value)}`,
  imageUrl: mediaList.value[0]?.thumbnail_url || mediaList.value[0]?.url || "",
}));

// 相册模式下的视频卡顿检测：一个视频 5 次卡顿弹「建议下载到本地相册播放」
// TODO 下一批：把 useVideoStallDetector 挂上；本轮只留 UI 骨架
function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
// EXIF DateTime 一般格式：'2024:05:12 09:15:22' → 转成友好显示
function formatTaken(raw?: string): string {
  if (!raw) return "";
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return raw;
}
</script>

<template>
  <view class="page">
    <view class="topbar">
      <view class="back-btn" @click="goBack">
        <SvgIcon name="chevron-left" size="36rpx" />
      </view>
      <view class="topbar-info">
        <text class="topbar-title">{{ albumTitle }}</text>
        <text class="topbar-sub">{{ mediaList.length }} {{ uiText("个媒体") }}</text>
      </view>
      <view class="view-switcher">
        <view
          class="vs-item"
          :class="{ active: viewMode === 'grid3' }"
          @click="switchView('grid3')"
        ><text>3</text></view>
        <view
          class="vs-item"
          :class="{ active: viewMode === 'grid6' }"
          @click="switchView('grid6')"
        ><text>6</text></view>
        <view
          class="vs-item"
          :class="{ active: viewMode === 'list' }"
          @click="switchView('list')"
        >
          <view class="vs-list-icon">
            <view class="vs-list-bar" />
            <view class="vs-list-bar" />
            <view class="vs-list-bar" />
          </view>
        </view>
      </view>
    </view>

    <view v-if="loading" class="state"><text>{{ uiText("加载中…") }}</text></view>
    <view v-else-if="errorMsg" class="state state-err">
      <text class="state-title">{{ uiText("加载失败") }}</text>
      <text>{{ uiText(errorMsg) }}</text>
    </view>
    <view v-else-if="mediaList.length === 0" class="state">
      <text>{{ uiText("相册里还没有媒体") }}</text>
      <view class="btn btn-primary" @click="onAddMore"><text>{{ uiText("去追加") }}</text></view>
    </view>

    <scroll-view
      v-else
      scroll-y
      class="scroll"
      :scroll-with-animation="false"
    >
      <!-- Grid 3 / Grid 6：v-for 直接遍历 mediaList，CSS grid + aspect-ratio 自撑
           单元格高度。<image lazy-load> 交给平台按需加载，无窗口化逻辑。 -->
      <view
        v-if="viewMode !== 'list'"
        class="grid"
        :class="viewMode === 'grid3' ? 'grid-3' : 'grid-6'"
      >
        <view
          v-for="m in mediaList" :key="m.url"
          class="cell"
          :class="{ selected: selected.has(m.url), 'is-video': m.media_type === 'video' }"
          @click="toggleSelect(m.url)"
          @longpress="onCellLongPress(m.url)"
        >
          <!-- 2026-09-14：网格只渲缩略图。原图只在 previewImage / 全屏播放器里加载。
               @error 回落原图：缩略图是「加速手段」，**不能**成为能不能看到图的前提。 -->
          <image
            :src="thumbSrc(m)"
            mode="aspectFill"
            class="cell-img"
            lazy-load
            :data-item-id="m.url"
            @error="onThumbError"
          />
          <view v-if="m.media_type === 'video'" class="cell-video-badge">
            <SvgIcon name="play" size="20rpx" color="#F7F3EE" />
          </view>
          <view v-if="selectionMode" class="cell-check" :class="{ on: selected.has(m.url) }">
            <SvgIcon v-if="selected.has(m.url)" name="check" size="20rpx" color="#F7F3EE" />
          </view>
        </view>
      </view>

      <!-- List：显示文件名 + 大小 -->
      <view v-else class="list-view">
        <view
          v-for="m in mediaList" :key="m.url"
          class="list-row"
          :class="{ selected: selected.has(m.url) }"
          @click="toggleSelect(m.url)"
          @longpress="onCellLongPress(m.url)"
        >
          <image
            :src="thumbSrc(m)"
            mode="aspectFill"
            class="list-thumb"
            lazy-load
            :data-item-id="m.url"
            @error="onThumbError"
          />
          <view class="list-info">
            <text class="list-name">
              {{ m.original_filename || (m.media_type === 'video' ? uiText("视频") : uiText("图片")) }}
            </text>
            <text class="list-meta">
              {{ m.media_type === 'video' ? uiText("视频") : uiText("图片") }}
              <text v-if="m.size_bytes"> · {{ formatSize(m.size_bytes) }}</text>
              <text v-if="m.taken_at"> · {{ formatTaken(m.taken_at) }}</text>
              <text v-if="m.has_gps"> {{ uiText("· 含位置") }}</text>
              <text v-if="m.camera_model"> · {{ m.camera_model }}</text>
            </text>
          </view>
          <view v-if="selectionMode" class="cell-check" :class="{ on: selected.has(m.url) }">
            <SvgIcon v-if="selected.has(m.url)" name="check" size="20rpx" color="#F7F3EE" />
          </view>
        </view>
      </view>

      <view class="bottom-spacer" />
    </scroll-view>

    <!-- 追加媒体进度条（2026-09-15：用户反馈"视频追加慢，给个进度条"）
         视频链路：上传大文件（家宽上行 20-60Mbps）→ 后端转码（10-120s）→ 前端轮询完成。
         phase 明确告诉用户"卡在哪一步"；elapsed 让"还在动"这件事持续可见。 -->
    <view v-if="appendProgress.visible" class="append-progress-fixed">
      <view class="ap-head">
        <text class="ap-title">{{ appendProgress.current }} / {{ appendProgress.total }} · {{ appendProgress.currentName }}</text>
        <text class="ap-elapsed">{{ appendElapsedText }}</text>
      </view>
      <view class="ap-phase">
        <text v-if="appendProgress.phase === 'uploading'">{{ uiText("上传中 ·") }} {{ appendProgress.uploadPct }}%</text>
        <text v-else-if="appendProgress.phase === 'transcoding'">{{ uiText("服务器转码中，可能持续几十秒") }}</text>
        <text v-else-if="appendProgress.phase === 'saving'">{{ uiText("保存到画匣子…") }}</text>
        <text v-else>{{ uiText("准备中…") }}</text>
      </view>
      <view class="ap-bar">
        <view class="ap-bar-fill" :style="{
          width: appendProgress.phase === 'uploading' ? (appendProgress.uploadPct + '%')
            : appendProgress.phase === 'transcoding' ? '100%'
            : appendProgress.phase === 'saving' ? '100%' : '0%',
          background: appendProgress.phase === 'transcoding' ? '#C4A882' : '#3D2E1F',
        }" />
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="ctrl-fixed">
      <view v-if="selectionMode" class="ctrl-row selection-row">
        <text class="sel-count">{{ uiText("已选") }} {{ selected.size }}</text>
        <view class="btn btn-ghost" @click="selectAll">
          <text>{{ selected.size === mediaList.length ? uiText("全不选") : uiText("全选") }}</text>
        </view>
        <view class="btn btn-primary" :class="{ dim: downloading }" @click="onBatchDownload">
          <text>{{ downloading ? uiText("打包中…") : uiText("下载") }}</text>
        </view>
        <!-- 2026-09-16：删除按钮 —— 只有当前用户有可删项时显示（backend 契约：episode.author_id === user_id 才能改 images）
             visualy 红色危险色 —— 跟 batch download 主 CTA 区分开 -->
        <view v-if="selectedDeletable > 0" class="btn btn-danger" @click="onBatchDelete">
          <text>{{ uiText("删除") }} {{ selectedDeletable }}</text>
        </view>
        <view class="btn btn-ghost" @click="toggleSelection"><text>{{ uiText("取消") }}</text></view>
      </view>
      <view v-else class="ctrl-row main-row">
        <!-- 2026-09-16：canContribute（owner || access_level>=2）都能追加 —— 之前只 is_owner
             用户抱怨非 owner 相册模式没入口 → 切画匣子 → 加成了新章节污染 -->
        <view v-if="canContribute" class="btn btn-ghost" @click="onAddMore">
          <SvgIcon name="plus" size="28rpx" />
          <text>{{ uiText("追加") }}</text>
        </view>
        <!-- 2026-09-16：**去掉「回忆视图」按钮** —— 用户明确"禁用相册模式和画匣子模式
             的切换，目的不一样"。之前的切换 UI 让用户误以为"这份相册可以变成画匣子"，
             反而助长了 R19 那类模式串扰。相册就是相册，追加就是相册续加，不再提供
             "以画匣子方式回看"入口。switchToMemoryView 函数保留（R19 拦截时用不到，
             但暂时不删，未来若给"深链兜底"用）。 -->
        <view class="btn btn-ghost" @click="openPermissionSheet">
          <SvgIcon name="share" size="28rpx" />
          <text>{{ uiText("分享") }}</text>
        </view>
        <!-- 2026-09-16 用户决策：把「下载」改回泛化的「更多选项」入口——2026-09-14 曾把它
             命名为「下载」是为了让用户"能找到批量下载"；但现在多选态里除了下载还多了"删除"，
             再叫"下载"就名不副实了。行为：点入多选 → 用户勾选要处理的媒体 → 底部出现
             「下载 / 删除」两个动作按钮。 -->
        <view class="btn btn-ghost" @click="toggleSelection">
          <SvgIcon name="gear" size="28rpx" />
          <text>{{ uiText("更多选项") }}</text>
        </view>
      </view>
    </view>

    <PermissionSheet
      :open="permissionSheetOpen"
      :can-manage="canManagePermissions"
      :can-invite="canManagePermissions"
      :scope="localScope"
      :level="localLevel"
      :subject-title="albumTitle"
      @update:open="(v) => (permissionSheetOpen = v)"
      @save="onSavePermissions"
      @invite="onInviteToAlbum"
      @copy-link="onCopyAlbumLink"
    />

    <!-- 2026-09-16 v3：H5 自建 preview modal（一次只 render 当前图，不撞 h2 上限） -->
    <!-- #ifdef H5 -->
    <H5ImagePreview
      :visible="h5PreviewVisible"
      :urls="h5PreviewUrls"
      :initial-idx="h5PreviewInitialIdx"
      @close="h5PreviewVisible = false"
    />
    <!-- #endif -->

    <!-- 2026-07-13：视频全屏播放器 —— 用户明确要求 -->
    <view v-if="playingVideoUrl" class="video-fullscreen" @click.self="closeVideoPlayer">
      <view class="video-close-btn" @click="closeVideoPlayer">
        <SvgIcon name="close" size="40rpx" color="#F7F3EE" />
      </view>
      <video
        class="video-fullscreen-video"
        :src="playingVideoUrl"
        :poster="playingVideoPoster"
        controls
        autoplay
        show-fullscreen-btn
        object-fit="contain"
        :enable-progress-gesture="true"
        @waiting="albumVideoStall.onWaiting"
        @error="albumVideoStall.onError"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

.page {
  height: 100vh;
  background: t.$color-bg;
  display: flex;
  flex-direction: column;
  position: relative;
}

.topbar {
  display: flex; align-items: center; gap: t.$spacing-2;
  padding: t.$spacing-3 t.$spacing-4;
  border-bottom: 2rpx solid t.$color-border;
  background: t.$color-bg;
}
.back-btn {
  width: 64rpx; height: 64rpx; border-radius: 50%;
  background: t.$color-surface;
  display: flex; align-items: center; justify-content: center;
}
.topbar-info {
  flex: 1; display: flex; flex-direction: column;
  gap: 4rpx; min-width: 0;
}
.topbar-title {
  font-size: t.$font-md;
  font-weight: t.$weight-bold;
  color: t.$color-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-sub {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

.view-switcher {
  display: flex;
  gap: 4rpx;
  padding: 4rpx;
  border-radius: 999rpx;
  background: t.$color-surface;
}
.vs-item {
  min-width: 48rpx; height: 48rpx;
  padding: 0 12rpx;
  border-radius: 999rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: t.$font-xs;
  color: t.$color-text-soft;
  font-weight: t.$weight-bold;
}
.vs-item.active {
  background: t.$color-accent;
  color: t.$color-text-invert;
}
.vs-list-icon {
  width: 32rpx;
  height: 20rpx;
  display: flex; flex-direction: column;
  justify-content: space-between;
}
.vs-list-bar {
  height: 3rpx;
  background: currentColor;
  border-radius: 2rpx;
}

.scroll {
  flex: 1 1 0;
  /* 2026-09-15 v5：左右 padding 跟 --doc-pad-x（$spacing-4=32rpx）严格一致 —— 之前
     写 $spacing-3=24rpx，比 ctrl-fixed 宽 16rpx，用户视觉"边边就差一点"。 */
  padding: t.$spacing-3 t.$spacing-4 0;
  box-sizing: border-box;
}
.state {
  padding: t.$spacing-6 t.$spacing-4;
  display: flex; flex-direction: column;
  align-items: center; gap: t.$spacing-2;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  text-align: center;
  &.state-err .state-title {
    color: t.$color-danger;
    font-size: t.$font-lg;
    font-weight: t.$weight-bold;
  }
}

.grid {
  display: grid;
  gap: 6rpx;
}
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-6 { grid-template-columns: repeat(6, 1fr); }
.cell {
  position: relative;
  /* 2026-09-14 v3：去掉窗口化后，恢复 aspect-ratio:1/1 自撑单元格高度。
     无需 JS 算 cellSize/rowHeight，也就不存在两套数漂移的问题。 */
  aspect-ratio: 1 / 1;
  border-radius: 12rpx;
  overflow: hidden;
  background: t.$color-surface-2;
}
.cell.selected {
  box-shadow: 0 0 0 4rpx t.$color-accent inset;
}
.cell-img { width: 100%; height: 100%; }
.cell-video-badge {
  position: absolute;
  bottom: 8rpx; right: 8rpx;
  width: 40rpx; height: 40rpx;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
}
.cell-check {
  position: absolute;
  top: 8rpx; right: 8rpx;
  width: 40rpx; height: 40rpx;
  border-radius: 50%;
  background: rgba(0,0,0,0.35);
  border: 2rpx solid #F7F3EE;
  display: flex; align-items: center; justify-content: center;
}
.cell-check.on {
  background: t.$color-accent;
  border-color: t.$color-accent;
}

.list-view {
  display: flex; flex-direction: column;
  /* 与 JS 的 LIST_GAP=8 对齐 */
  gap: 8px;
}
.list-row {
  display: flex; align-items: center;
  /* 2026-09-14：高度写死，且**必须**与 JS 的 LIST_ROW_H 一致。
     原来是内容撑高（不定），而 JS 那边按 96 算窗口 → 同样会累计漂移。 */
  height: 96px;
  box-sizing: border-box;
  gap: t.$spacing-3;
  padding: t.$spacing-2;
  border-radius: t.$radius-md;
  background: t.$color-surface;
  border: 2rpx solid t.$color-border;
}
.list-row.selected {
  border-color: t.$color-accent;
  background: rgba(61, 46, 31, 0.04);
}
.list-thumb {
  width: 100rpx; height: 100rpx;
  border-radius: 8rpx;
  background: t.$color-surface-2;
  flex: 0 0 auto;
}
.list-info { flex: 1; display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.list-name {
  font-size: t.$font-sm;
  color: t.$color-text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-meta {
  font-size: t.$font-xs;
  color: t.$color-text-mute;
}

.bottom-spacer { height: 220rpx; }

/* 追加进度条：贴在 ctrl-fixed 上方，宽度对齐版心（H5 480px 锁） */
.append-progress-fixed {
  position: fixed;
  left: 0; right: 0;
  bottom: 168rpx;   /* 高于 ctrl-fixed（约 140rpx + safe-area），避免遮住底部按钮 */
  padding: t.$spacing-3 t.$spacing-4;
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  z-index: 29;
  box-shadow: 0 -4rpx 16rpx rgba(61, 46, 31, 0.06);
}
.ap-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: t.$font-sm;
  color: t.$color-text;
  margin-bottom: 8rpx;
}
.ap-title { font-weight: t.$weight-bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-elapsed { color: t.$color-text-mute; margin-left: 16rpx; flex: 0 0 auto; }
.ap-phase {
  font-size: t.$font-xs;
  color: t.$color-text-soft;
  margin-bottom: 10rpx;
}
.ap-bar {
  width: 100%;
  height: 8rpx;
  border-radius: 4rpx;
  background: rgba(61, 46, 31, 0.10);
  overflow: hidden;
}
.ap-bar-fill {
  height: 100%;
  transition: width 0.3s ease-out;
}

.ctrl-fixed {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  padding: t.$spacing-3 t.$spacing-4 calc(env(safe-area-inset-bottom) + #{t.$spacing-3});
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  z-index: 30;
  box-shadow: 0 -8rpx 24rpx rgba(61, 46, 31, 0.06);
}
.ctrl-row {
  display: flex; align-items: center;
  gap: t.$spacing-2;
}
.selection-row .sel-count {
  font-size: t.$font-sm;
  color: t.$color-text-soft;
  padding: 0 t.$spacing-2;
}
.btn {
  flex: 1;
  height: 80rpx; line-height: 80rpx;
  border-radius: 999rpx;
  font-size: t.$font-sm;
  display: inline-flex; align-items: center; justify-content: center;
  // 2026-07-14 用户反馈 4 按钮均分时"模板视图"文字换行：
  // - gap 8→6，padding-x 减到 8rpx，让内文有更多空间
  // - 加 white-space: nowrap 强制不换行；宁可 icon+text overflow 也别双行错位
  gap: 6rpx;
  padding: 0 8rpx;
  white-space: nowrap;
  overflow: hidden;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
  min-width: 0;
  box-sizing: border-box;
}
.btn.btn-primary {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}
.btn.btn-ghost { background: t.$color-surface; }
.btn.btn-danger {
  background: #C44A4A;
  color: #F7F3EE;
  border-color: #C44A4A;
}
.btn.dim { opacity: 0.55; }

.render-more {
  margin: t.$spacing-4 auto t.$spacing-2;
  padding: t.$spacing-2 t.$spacing-4;
  border-radius: 999rpx;
  border: 2rpx solid t.$color-border;
  background: t.$color-surface;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

// 2026-07-13：视频全屏播放器 overlay
.video-fullscreen {
  position: fixed; inset: 0;
  background: #000;
  z-index: 500;
  display: flex; align-items: center; justify-content: center;
}
.video-close-btn {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 24rpx);
  right: 24rpx;
  width: 72rpx; height: 72rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 501;
}
.video-fullscreen-video {
  width: 100vw;
  height: 100vh;
}
</style>
