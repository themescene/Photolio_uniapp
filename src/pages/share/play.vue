<script setup lang="ts">
import { t as uiText } from "@/i18n";
/**
 * 画匣子播放页 —— v3：底栏固定 + 视频自适应 + 单 episode 隐藏切换。
 *
 * 参考：annualreport/src/views/PlayView.vue
 *
 * 功能：
 *   - 拉 /api/share/<id>，模板分发，多 episode 切换（仅在 totalEpisodes > 1 时显示前后）
 *   - 视频：episode 含 media_type=video 项 → 渲染 <video>，高度由用户/视频本身决定
 *     · 不再写死 aspect-ratio（之前 16:10 强制裁切）
 *     · object-fit="contain" 让原片完整可见
 *   - 评论展开 / 音频播放 / 微信分享（onShareAppMessage 钩子）
 *   - 控制栏 fixed 在屏幕底部，按钮文字居中
 *
 * 与上一版差异：
 *   - 控制栏从内容流里挪到 position: fixed bottom
 *   - 内容区底部加 spacer 避免被控制栏盖住
 *   - 单 episode 隐藏「上一节 / 下一节」
 *   - 视频去掉 16:10 强制比例，改 70vh + contain
 */
import { useDebugStore } from "@/stores/debug";
import { ref, computed, watch, nextTick, getCurrentInstance } from "vue";
import { onLoad, onUnload, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { fetchShare, acceptInvite, fetchPermissions, likeShare, unlikeShare, updateSharePermissions } from "@/api/share";
import { fetchGroupMemories, type GroupMemory } from "@/api/group";
import type { EditPermissions } from "@/api/share";
import { requestRestoreMedia, getRestoreStatus, devArchiveShareNow, type RestoreStatus } from "@/api/archive";
import { ApiError } from "@/api/request";
import { logger } from "@/utils/logger";
import { STATIC_BASE, STORAGE_KEYS } from "@/config/env";
import { setPending } from "@/utils/media";
import TemplateCard from "@/components/templates/TemplateCard.vue";
import CommentSection from "@/components/CommentSection.vue";
import SvgIcon from "@/components/SvgIcon.vue";
import PermissionSheet from "@/components/PermissionSheet.vue";
import type { ShareDetail, ReportEpisode } from "@/types";

const auth = useAuthStore();
const { user, isLoggedIn } = storeToRefs(auth);

// 编辑权限：仅 owner 可见「编辑」；owner + editor 可见「追加 / 邀请」。
// 之前只按 !!user.value 粗判 → 任何登录用户都能看到 owner 按钮 → 接收方点「编辑」
// 收到「无权修改」（u3 反馈）。改为拉后端 /permissions 获取真实权限。
//
// 2026-07-19 hotfix11：**消费 access_level 字段**（backend 早已返回，前端一直忽略）。
// canEdit  = owner || (editor && access_level >= 1 edit_no_share)
// canContribute = owner || (editor && access_level >= 2 edit_and_share)
// —— 之前 canEdit=owner only 是根因：owner 设了 access_level=2 但接收方看不到追加/编辑按钮。
// 2026-08-08 hotfix14：canEdit 直接读 backend can_edit（综合了 owner / editors /
// preset_open_edit / access_level>=1+can_view / preset 库五种情况）。
// 老版本前端自己重推 `owner || (editor && access_level>=x)` 硬要求 is_editor=true，
// 把"拿链接进入 + owner 设 access_level=2 (可编辑并分享)"的场景挡在门外——
// UI 承诺"可编辑并分享"但接收方看不到编辑按钮的根因就在这。
const permissions = ref<EditPermissions | null>(null);
// 2026-08-10：canEdit / canContribute 两个 computed 现在**只看 share 配置**（access_level）
// 而不再门 can_edit（那是 backend 综合了「本次请求是否登录」的结果）。
// 登录/授权检查移到点击 handler 里（onAddChapter / onEditShare）—— 未登录用户能看到入口，
// 点击时弹「登录后继续」modal，符合 CLAUDE R2「用户指令 = 100% 服从」+ CreationFlow「先体验再拦登录」的一贯风格。
//
// 修复 Bug B（2026-08-10）：contributor-cta 之前额外门 `is_editor`，导致链接分享的访问者
// （没走 acceptInvite → editors[] 空）永远看不到「追加你的章节」大按钮。现在只看 canContribute。
const canEdit = computed(() => {
  const p = permissions.value;
  if (!p) return false;
  if (p.is_owner) return true;
  return (p.access_level ?? 2) >= 1;
});
const canContribute = computed(() => {
  const p = permissions.value;
  if (!p) return false;
  if (p.is_owner) return true;
  return (p.access_level ?? 2) >= 2;
});

const shareId = ref("");
const loading = ref(true);
const errorMsg = ref("");
const share = ref<ShareDetail | null>(null);

const currentEpisodeIdx = ref(0);
const showComments = ref(false);

// 评论抽屉底部要贴到 ctrl-fixed 顶端。
// 估算行数 * rpx 不准（按钮 padding / gap / safe-area 三样叠起来偏差累积到 30+ rpx，
// 用户实测抽屉与按钮栏之间空一段木纹）。改成运行时用 createSelectorQuery 量真实高度 px。
const drawerBottomPx = ref(220); // 未量到前的兜底值，避免抽屉初次出现时贴屏底
const instance = getCurrentInstance();
async function measureCtrl() {
  await nextTick();
  try {
    const query = uni.createSelectorQuery().in((instance as unknown as { proxy: unknown })?.proxy);
    query.select('.ctrl-fixed').boundingClientRect((rect) => {
      // rect 是单个元素时是对象，多个才是数组；mp-weixin 里给的是对象
      const r = Array.isArray(rect) ? rect[0] : rect;
      if (r && typeof (r as { height?: number }).height === 'number') {
        drawerBottomPx.value = Math.round((r as { height: number }).height);
      }
    }).exec();
  } catch (e) {
    logger.warn('[play] measure ctrl-fixed failed', e);
  }
}

// —— 合集上下文（来自 group→play 的 gid query 参数）——
// 有 gid 时：显示"回集合" + 章节间导航 + onShareAppMessage 分享合集而非单章
// 对齐网页端 SharePlayView.vue:44-85 的 groupId / groupMemories / navigateToPrevChapter
const groupCtxId = ref("");
const groupMemories = ref<GroupMemory[]>([]);
const inGroupCtx = computed(() => !!groupCtxId.value && groupMemories.value.length > 1);
const currentGroupChapterIndex = computed(() => {
  if (!inGroupCtx.value) return 0;
  const i = groupMemories.value.findIndex((m) => m.share_id === shareId.value);
  return i >= 0 ? i + 1 : 0;
});
const prevGroupMemory = computed<GroupMemory | null>(() => {
  const idx = currentGroupChapterIndex.value; // 1-based
  return idx > 1 ? groupMemories.value[idx - 2] : null;
});
const nextGroupMemory = computed<GroupMemory | null>(() => {
  const idx = currentGroupChapterIndex.value;
  return idx > 0 && idx < groupMemories.value.length ? groupMemories.value[idx] : null;
});

async function loadGroupCtx(gid: string) {
  if (!gid) return;
  try {
    const r = await fetchGroupMemories(gid);
    groupMemories.value = r.memories || [];
    logger.info("[play] group ctx loaded", { gid, count: groupMemories.value.length });
  } catch (e) {
    logger.warn("[play] load group ctx failed", e);
  }
}

function gotoGroupHome() {
  if (!groupCtxId.value) return;
  logger.info("[play] back to group", { gid: groupCtxId.value });
  uni.redirectTo({ url: `/pages/group/index?id=${encodeURIComponent(groupCtxId.value)}` });
}

function gotoGroupNeighbor(m: GroupMemory | null) {
  if (!m?.share_id) return;
  logger.info("[play] navigate to group neighbor", { share_id: m.share_id, gid: groupCtxId.value });
  uni.redirectTo({
    url: `/pages/share/play?id=${encodeURIComponent(m.share_id)}&gid=${encodeURIComponent(groupCtxId.value)}`,
  });
}

const totalEpisodes = computed(() => share.value?.report?.episodes?.length || 0);
const isMultiEpisode = computed(() => totalEpisodes.value > 1);

// 章节导航默认折叠成右侧半透明浮窗；点开才展开全套按钮，避免遮挡正文
const navExpanded = ref(false);
function toggleNav() { navExpanded.value = !navExpanded.value; }

const currentEpisodeAudioUrl = computed(() => {
  const ep = share.value?.report?.episodes?.[currentEpisodeIdx.value];
  return (ep as { audio_url?: string } | undefined)?.audio_url || "";
});

const captionLine = computed(() => {
  const date = share.value?.created_at?.slice(0, 10) || "";
  const author = share.value?.author_display_name || "";
  if (date && author) return `${date} · ${author}`;
  return date || author;
});

const currentEpisode = computed<ReportEpisode | null>(() => {
  const ep = share.value?.report?.episodes?.[currentEpisodeIdx.value];
  if (!ep) return null;
  const cw = ep.copywriting || {};
  const h2 = cw.h2 || captionLine.value || "";
  // **不再 filter 视频**：视频项作为媒体之一交给 TemplateImage 内嵌渲染（对齐网页端
  // PlayView.vue:611-700 的 `<FoodCard><template #image-overlay><video/></template>` 模式）。
  // 之前在这里 filter 是错的：导致视频被吞、模板的相片区显示空白。
  return { ...ep, copywriting: { ...cw, h2 } };
});

const autoPlayAudio = computed(() => share.value?.auto_play_audio !== false);

// 汉堡菜单里可用的动作：追加 / 编辑 / 喜欢；至少 canContribute / canEdit / showLikeBtn 之一时显示
// 2026-08-10：不再门 isLoggedIn —— share 允许追加（access_level>=2）时未登录用户也能看到「选项 → 追加」，
// 点击 handler 会弹登录提示。这样从微信卡片分享跳进来的新用户能自然被引导登录。
const showHamburger = computed(() => {
  return canContribute.value || canEdit.value || showLikeBtn.value;
});
const hamburgerOpen = ref(false);
function toggleHamburger() { hamburgerOpen.value = !hamburgerOpen.value; }
function closeHamburger() { hamburgerOpen.value = false; }

// 分享 / 权限底部弹出栏（合并「分享」+「邀请」+「权限」）
// canManagePermissions = owner；非 owner 只读展示滑条
const permissionSheetOpen = ref(false);
const canManagePermissions = computed(() => !!permissions.value?.is_owner);
// 从 permissions 里读真实 visibility / access_level（backend 已落地字段）
// 旧数据没这两个字段时 fallback：visibility=1 (with_link), access_level=2 (edit_and_share)
const localScope = computed<0 | 1 | 2 | 3>(() => {
  const v = permissions.value?.visibility;
  return (v === 0 || v === 1 || v === 2 || v === 3) ? v : 1;
});
const localLevel = computed<0 | 1 | 2>(() => {
  const a = permissions.value?.access_level;
  return (a === 0 || a === 1 || a === 2) ? a : 2;
});
// 2026-07-19：贴一贴权限（NFC 独立轴）
const localNfcAccess = computed<'off' | 'view' | 'edit'>(() => {
  const n = permissions.value?.nfc_access;
  return (n === 'off' || n === 'view' || n === 'edit') ? n : 'view';
});
function openPermissionSheet() { permissionSheetOpen.value = true; closeHamburger(); }
async function onSavePermissions(payload: {
  scope: 0 | 1 | 2 | 3;
  level: 0 | 1 | 2;
  nfc_access: 'off' | 'view' | 'edit';
}) {
  if (!shareId.value) return;
  try {
    await updateSharePermissions(shareId.value, {
      visibility: payload.scope,
      access_level: payload.level,
      nfc_access: payload.nfc_access,
    });
    // 本地同步：直接改 permissions 对象，避免再拉一次
    if (permissions.value) {
      permissions.value = {
        ...permissions.value,
        visibility: payload.scope,
        access_level: payload.level,
        nfc_access: payload.nfc_access,
      };
    }
    permissionSheetOpen.value = false;
    uni.showToast({ title: "权限已更新", icon: "success" });
    logger.info("[play] permissions saved", payload);
  } catch (e) {
    logger.warn("[play] update permissions failed", e);
    uni.showToast({
      title: e instanceof ApiError ? e.message : "更新权限失败",
      icon: "none", duration: 2500,
    });
  }
}
/**
 * 2026-09-14 BUG7：H5 没有原生导航栏，必须自己给返回入口。
 * 有历史栈就退一层（从合集/首页点进来的情形），没有就 reLaunch 回首页
 * （分享链接直接打开的情形，栈里只有这一页）。
 */
function goBackOrHome() {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/index/index" });
}

// 2026-07-13：视图切换 —— 以相册模式查看同一份 media
function switchToAlbumView() {
  if (!shareId.value) return;
  closeHamburger();
  uni.redirectTo({ url: `/pages/album/index?id=${encodeURIComponent(shareId.value)}` });
}

// 2026-07-14：批量下载媒体 —— 汉堡菜单入口
// 复用 album 页的选择 UI（?select=1 → 默认全选进入多选态），用户可反选后按「下载」打包 zip
function goDownloadMedia() {
  if (!shareId.value) return;
  closeHamburger();
  uni.navigateTo({ url: `/pages/album/index?id=${encodeURIComponent(shareId.value)}&select=1` });
}
function onCopyShareLink() {
  const link = `${STATIC_BASE}/share/${shareId.value}`;
  uni.setClipboardData({ data: link, success: () => uni.showToast({ title: "链接已复制", icon: "success" }) });
}

// 2026-07-25 hotfix12h：内容举报入口。UGC 平台合规必备 —— 微信审核明确要求提供举报机制。
// 目前简单实现：弹 modal 让用户选举报原因 → 复制到剪贴板 + 提示联系客服。
// 未来可以后端加 report 表 + 自动隐藏累积举报的 share，本轮先满足合规红线。
function onReport() {
  closeHamburger();
  uni.showActionSheet({
    itemList: [
      "色情低俗",
      "政治敏感 / 违法",
      "暴力 / 血腥",
      "虚假信息 / 诈骗",
      "骚扰 / 人身攻击",
      "其它违规",
    ],
    success: (r) => {
      const reasons = ["色情低俗", "政治敏感/违法", "暴力/血腥", "虚假信息/诈骗", "骚扰/人身攻击", "其它违规"];
      const reason = reasons[r.tapIndex] || "其它违规";
      const link = shareId.value ? `${STATIC_BASE}/share/${shareId.value}` : "";
      const body = `举报原因：${reason}\n分享链接：${link}\n（请粘贴给客服）`;
      uni.setClipboardData({
        data: body,
        success: () => uni.showModal({
          title: "已复制举报信息",
          content: "举报信息已复制到剪贴板。请打开微信 → 添加客服「Theme_Scene」→ 粘贴发送，我们会在 24 小时内处理并反馈。感谢你的监督。",
          showCancel: false,
          confirmText: "知道了",
        }),
        fail: () => uni.showToast({ title: "复制失败", icon: "none" }),
      });
    },
  });
}

// ==================== 2026-07-25 hotfix13：冷存储归档 / 恢复 ====================
// 检测这个 share 里有没有 archived=true 的媒体（3 年后 backend 会标）
// 有 → 顶部显示 banner + 「取回完整内容」按钮
const hasArchivedMedia = computed(() => {
  const eps = share.value?.report?.episodes || [];
  for (const ep of eps) {
    for (const img of (ep.images || [])) {
      if (typeof img === 'object' && img !== null && (img as { archived?: boolean }).archived) {
        return true;
      }
    }
  }
  return false;
});

// 恢复状态：null=未请求 / queued / in_progress / done
const restoreState = ref<RestoreStatus | null>(null);
let restorePollTimer: ReturnType<typeof setInterval> | null = null;

async function onRestoreMedia() {
  if (!shareId.value) return;
  try {
    const r = await requestRestoreMedia(shareId.value);
    if (r.status === 'nothing_to_restore') {
      uni.showToast({ title: '没有需要取回的媒体', icon: 'none' });
      return;
    }
    uni.showToast({
      title: r.eta_hint || '已加入取回队列',
      icon: 'none', duration: 3000,
    });
    // 立刻开始轮询状态
    _startRestorePolling();
  } catch (e) {
    uni.showToast({
      title: e instanceof ApiError ? e.message : '请求失败',
      icon: 'none', duration: 3000,
    });
  }
}

function _startRestorePolling() {
  if (restorePollTimer) return;
  // 立刻查一次 + 每 5s 查一次
  _pollRestore();
  restorePollTimer = setInterval(() => _pollRestore(), 5000);
}

async function _pollRestore() {
  if (!shareId.value) return;
  try {
    const s = await getRestoreStatus(shareId.value);
    restoreState.value = s;
    if (s.status === 'done') {
      // 完成了 → 停轮询 + 重拉 share（media 现在应该 archived=false）
      _stopRestorePolling();
      uni.showToast({ title: '取回完成，正在刷新...', icon: 'success', duration: 1500 });
      setTimeout(() => { void loadShare(); }, 1500);
    } else if (s.status === 'failed') {
      _stopRestorePolling();
      uni.showToast({
        title: `取回失败：${s.last_error || '未知'}`,
        icon: 'none', duration: 3500,
      });
    }
    // queued / in_progress → 继续轮询
  } catch (e) {
    logger.warn('[restore] poll failed', e);
  }
}

function _stopRestorePolling() {
  if (restorePollTimer) {
    clearInterval(restorePollTimer);
    restorePollTimer = null;
  }
}

// 页面卸载时清理 poll
onUnload(() => { _stopRestorePolling(); });

// share 加载完后如果检测到 archived 且已有 restore 请求 → 恢复轮询
watch(() => share.value, (s) => {
  if (hasArchivedMedia.value) {
    // 探一次是不是已经在排队
    void _pollRestore();
    // 如果 status 是 queued/in_progress → 继续轮询
    setTimeout(() => {
      if (restoreState.value?.status === 'queued' || restoreState.value?.status === 'in_progress') {
        _startRestorePolling();
      }
    }, 100);
  }
});

// 沿用商家preset_links权限；本次会话还必须主动开启调试，启动及切换账号默认关闭。
const debug = useDebugStore();
const isDev = computed(() => debug.enabled);

async function devArchiveThisShare() {
  if (!debug.enabled) return;
  if (!shareId.value) return;
  const confirm = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: 'DEV: 立即归档',
      content: '将模拟 3 年后的归档：把此 share 的所有媒体上传备份（如未备份）+ 云端删除原文件。之后可点「取回完整内容」测试冷加载。确认吗？',
      confirmText: '归档',
      cancelText: '取消',
      success: (r) => resolve(!!r.confirm),
      fail: () => resolve(false),
    });
  });
  if (!confirm) return;
  try {
    uni.showLoading({ title: '归档中...', mask: true });
    const r = await devArchiveShareNow(shareId.value);
    uni.hideLoading();
    uni.showModal({
      title: '归档结果',
      content: JSON.stringify(r, null, 2).slice(0, 500),
      showCancel: false,
    });
    // 重拉 share 让 UI 更新到 archived 占位符
    void loadShare();
  } catch (e) {
    uni.hideLoading();
    uni.showModal({
      title: '归档失败',
      content: e instanceof ApiError ? e.message : '未知错误',
      showCancel: false,
    });
  }
}
// ==================== hotfix13 END ====================

// —— 喜欢 ——
// 后端"喜欢"= share.editors 里含当前用户。permissions.is_editor=true 就是已喜欢。
// owner 自己不显示喜欢（对齐网页端 PlayView 的处理）
const liked = ref(false);
const isOwnShare = computed(() => !!permissions.value?.is_owner);
const showLikeBtn = computed(() => isLoggedIn.value && !isOwnShare.value);
async function toggleLike() {
  if (!shareId.value) return;
  const next = !liked.value;
  liked.value = next; // optimistic
  try {
    if (next) await likeShare(shareId.value);
    else await unlikeShare(shareId.value);
    uni.showToast({ title: next ? "已加入喜欢" : "已取消喜欢", icon: "success" });
  } catch (e) {
    liked.value = !next; // rollback
    uni.showToast({
      title: e instanceof ApiError ? e.message : "操作失败",
      icon: "none", duration: 2500,
    });
  }
}

// —— 音频 ——
let audioCtx: UniApp.InnerAudioContext | null = null;
const isPlaying = ref(false);

function playAudioForEpisode(ep: ReportEpisode | null) {
  stopAudio();
  const url = (ep as { audio_url?: string } | null)?.audio_url;
  if (!url) return;
  audioCtx = uni.createInnerAudioContext();
  audioCtx.src = url;
  audioCtx.autoplay = true;
  audioCtx.onPlay(() => { isPlaying.value = true; });
  audioCtx.onEnded(() => { isPlaying.value = false; });
  audioCtx.onError((err) => {
    isPlaying.value = false;
    logger.warn("[play] audio error", err);
  });
}
function stopAudio() {
  if (audioCtx) {
    try { audioCtx.stop(); audioCtx.destroy(); } catch { /* ignore */ }
    audioCtx = null;
  }
  isPlaying.value = false;
}
function togglePlay() {
  if (!audioCtx) return playAudioForEpisode(currentEpisode.value);
  if (isPlaying.value) { audioCtx.pause(); isPlaying.value = false; }
  else { audioCtx.play(); isPlaying.value = true; }
}

watch(currentEpisode, (ep) => {
  if (autoPlayAudio.value) playAudioForEpisode(ep);
});

// ctrl-fixed 行数变化时重新量高度：episodes-row 出现/消失、汉堡展开都会改
watch([() => isMultiEpisode.value, () => hamburgerOpen.value, () => permissions.value, () => showComments.value], () => {
  if (showComments.value) void measureCtrl();
});

function prevEpisode() {
  if (currentEpisodeIdx.value > 0) currentEpisodeIdx.value--;
}
function nextEpisode() {
  if (currentEpisodeIdx.value < totalEpisodes.value - 1) currentEpisodeIdx.value++;
}

const inviteCode = ref("");

async function loadShare(force = false) {
  if (!shareId.value) return;
  if (!force && share.value) return;
  loading.value = !share.value;
  try {
    share.value = await fetchShare(shareId.value);
    if (share.value.share_type === 'album') { uni.redirectTo({ url: `/pages/album/index?id=${encodeURIComponent(shareId.value)}` }); return; }
    logger.info("[play] loaded share", share.value);
    try { uni.setStorageSync(STORAGE_KEYS.LAST_PLAYED, shareId.value); } catch { /* ignore */ }
    if (autoPlayAudio.value) playAudioForEpisode(currentEpisode.value);
  } catch (e) {
    errorMsg.value = e instanceof ApiError ? e.message : "加载失败";
    logger.warn("[play] load failed", e);
  } finally {
    loading.value = false;
  }
  // 2026-08-10：无论登录状态都拉一次 permissions —— 未登录 backend 会返回
  // {can_edit=false, is_owner=false, access_level=<manifest 值>, visibility=..., nfc_access=...}
  // 前端 canContribute/canEdit 现在只看 access_level，所以未登录用户也能看到「追加」入口，
  // 点击时再弹登录 preflight。（endpoint 允许 no-token 访问，见 share_controller get_permissions）
  fetchPermissions(shareId.value).then((p) => {
    if (p.share_type === 'album') { uni.redirectTo({ url: `/pages/album/index?id=${encodeURIComponent(shareId.value)}` }); return; }
    permissions.value = p;
    // "喜欢" 状态：后端返回 is_editor（当前用户在 editors[] 里）+ 非 owner
    liked.value = !!p?.is_editor && !p?.is_owner;
    logger.info("[play] permissions", p);
  }).catch((e) => {
    logger.warn("[play] fetch permissions failed", e);
    permissions.value = null;
  });
}

onLoad(async (opt) => {
  shareId.value = (opt?.id as string) || "";
  inviteCode.value = (opt?.invite as string) || "";
  // gid 由 group/index.vue openMemory 或 openShare 从合集卡点入时带过来
  groupCtxId.value = (opt?.gid as string) || "";
  logger.info("[play] onLoad", { shareId: shareId.value, gid: groupCtxId.value, invite: !!inviteCode.value });
  // 登录用户强制拉一次 me：storage 里的 user.entitlements 可能是上一账号 / 上一次兑换后残留，
  // isDev（preset_links）会跟着一起残留 → 普通账号也看到 DEV 归档 banner（对齐 settings.vue onMounted）
  if (isLoggedIn.value) auth.refreshMe().catch(() => { /* ignore */ });
  if (!shareId.value) {
    loading.value = false;
    errorMsg.value = "缺少 id 参数";
    return;
  }
  await loadShare(true);
  // 合集上下文：拉合集章节列表用于「上一章 / 下一章 / 回集合」
  if (groupCtxId.value) void loadGroupCtx(groupCtxId.value);
  // 受邀者打开带 invite 参数的卡片 → 自动接受邀请加入集合
  // 对齐 annualreport/src/views/SharePlayView.vue:440 consumeInviteCode
  if (inviteCode.value) {
    // 冷启动小程序时，Pinia 从 storage 拿 token 是同步的，
    // 但 user 对象可能因为 storage 空/过期而为 null——不能用 !user.value
    // 判「未登录」，否则受邀者明明在其他页看得到自己信息，这里却被误弹「未登录」（u3 反馈）。
    // 改用 isLoggedIn（token 存在）；user 为空则并行拉一次 me 兜底，不阻塞 acceptInvite。
    if (!isLoggedIn.value) {
      uni.showModal({
        title: "登录后加入共创",
        content: "你被邀请共同编辑这份画匣子，登录后即可加入",
        confirmText: "去登录",
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: "/pages/auth/login" });
        },
      });
      return;
    }
    if (!user.value) auth.refreshMe().catch(() => { /* ignore */ });
    try {
      const r = await acceptInvite(shareId.value, inviteCode.value);
      const isSelf = !!r?.is_self;
      if (isSelf) {
        uni.showToast({ title: "这是你自己的邀请", icon: "none" });
      } else {
        uni.showToast({ title: r?.group_name ? `已加入「${r.group_name}」` : "已加入共创", icon: "success" });
      }
      // 接受邀请后成为 editor —— 必须重拉 permissions，
      // 否则 canContribute 保持 false，「+追加」按钮不显示（用户反馈的 Bug1）
      try {
        const p = await fetchPermissions(shareId.value);
        if (p.share_type === 'album') { uni.redirectTo({ url: `/pages/album/index?id=${encodeURIComponent(shareId.value)}` }); return; }
    permissions.value = p;
        liked.value = !!p?.is_editor && !p?.is_owner;
      } catch (pe) {
        logger.warn("[play] refresh permissions after invite failed", pe);
      }
      // 受邀成功后主动引导追加章节：底栏「追加」按钮不显眼，用户反馈"没找到入口"（2026-07-09）
      // 只对真正的受邀者（非自己邀请自己）+ 首次成为 editor 弹一次；toast 之后 800ms 再弹
      // 避免和 toast 视觉冲突
      if (!isSelf) {
        setTimeout(() => {
          uni.showModal({
            title: "已加入共创",
            content: "现在就追加你的章节，让这份回忆更完整？稍后也能从底部「追加」按钮进入。",
            confirmText: "追加章节",
            cancelText: "稍后",
            success: (mr) => {
              if (mr.confirm) onAddChapter();
            },
          });
        }, 800);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "邀请失效或已过期";
      uni.showToast({ title: msg, icon: "none", duration: 3000 });
    }
  }
});

// p2 修：编辑页保存后写 SHARE_DIRTY=share_id，本页 onShow 看到就强制重拉详情
// 之前用 navigateBack 回到本页时数据保持陈旧（onLoad 不重跑），用户看不到改后的标题 / 模板
onShow(() => {
  if (!shareId.value) return;
  let dirtyId = "";
  try { dirtyId = String(uni.getStorageSync(STORAGE_KEYS.SHARE_DIRTY) || ""); } catch { /* ignore */ }
  if (dirtyId && dirtyId === shareId.value) {
    try { uni.removeStorageSync(STORAGE_KEYS.SHARE_DIRTY); } catch { /* ignore */ }
    // 重新拉一次 share 详情；保留当前 episode 索引
    void loadShare(true);
  }
});

// 「+ 追加章节」：把当前 share_id 作为 group_id 写到 storage，让 CreationFlow 启动时
// 预填 SettingsPanel.groupId。本质 = 新建画匣子并归到这个 group。
// 参考 annualreport/src/views/SharePlayView.vue:481 goAddChapter()
function onAddChapter() {
  if (!share.value) return;
  // 2026-09-16：相册 share 不允许在画匣子视图里"追加章节" —— 那会新建 share 绑 group_id →
  // 原相册从此被识别为合集成员 → 打开就是画匣子模式，相册模式回不去了。
  // 存量污染：用户此前在相册 share 里走了这条路径，现在他的相册已经变成了合集，需要后端手工清理。
  // 现在拦住：提示用户回相册视图追加媒体。
  if (share.value.share_type === "album") {
    uni.showModal({
      title: "相册模式不支持新章节",
      content: "这是相册模式的画匣子，追加要走「相册视图 → 追加媒体」，不然会把相册串成合集。",
      confirmText: "去相册视图",
      cancelText: "取消",
      success: (r) => { if (r.confirm) switchToAlbumView(); },
    });
    return;
  }
  // 2026-08-10：未登录用户点击 → 弹登录 modal（对齐 CreationFlow 的先体验后拦登录风格）
  if (!isLoggedIn.value) {
    uni.showModal({
      title: "登录后追加你的章节",
      content: "画匣子的追加需要一个账号，登录后即可为这段回忆写下你的一节",
      confirmText: "去登录",
      cancelText: "先不",
      success: (r) => {
        if (r.confirm) uni.navigateTo({ url: "/pages/auth/login" });
      },
    });
    return;
  }
  const gid = share.value.group_id || shareId.value;
  const gname = share.value.report?.report_title || "";
  // setPending 自带 ts，让 readPending 在 60min 后过期失效，避免漫游污染
  setPending(STORAGE_KEYS.PENDING_GROUP_ID, gid);
  setPending(STORAGE_KEYS.PENDING_GROUP_NAME, gname);
  uni.switchTab({ url: "/pages/upload/index" });
}

// 「编辑」：跳转编辑页（修改标题 / 副标题 / 正文）
function onEditShare() {
  if (!shareId.value) return;
  // 2026-08-10：未登录 preflight，避免用户点进去被 beginEdit 401 挡回
  if (!isLoggedIn.value) {
    uni.showModal({
      title: "登录后继续编辑",
      content: "编辑这份画匣子需要一个账号，登录后即可继续",
      confirmText: "去登录",
      cancelText: "先不",
      success: (r) => {
        if (r.confirm) uni.navigateTo({ url: "/pages/auth/login" });
      },
    });
    return;
  }
  uni.navigateTo({ url: `/pages/share/edit?id=${encodeURIComponent(shareId.value)}` });
}

// 「邀请共创」：跳转邀请页 → 拉一次性邀请链接（参考 InviteEditModal.vue）
function onInvite() {
  if (!shareId.value) return;
  const title = encodeURIComponent(share.value?.report?.report_title || "");
  uni.navigateTo({
    url: `/pages/share/invite?id=${encodeURIComponent(shareId.value)}&title=${title}`,
  });
}

// 视频不再由 play.vue 单独渲染——已下沉到 TemplateImage / WoodenBoxCard 的 image slot 内嵌
// （对齐网页端 PlayView.vue 用 <template #image-overlay><video class="video-in-slot"/></template> 的模式）
// 调试日志由各模板自行 console.log；UI 调试面板已撤除（用 wx devtools 看 console）
//
// 「横屏」按钮 2026-07-13 应用户要求整体去掉（换成汉堡菜单塞其他动作）
// 视频自身的全屏交给 <video> 自带的 show-fullscreen-btn；页面级横屏切换无用户价值

onUnload(() => {
  stopAudio();
});

// 微信图文卡片分享：
// - 合集上下文（inGroupCtx）→ 分享的是整个合集，接收方开卡直入 group/index
// - 无合集上下文 → 分享单章
// 网页端 PlayView.vue 的 shareLink 也是「合集时用 group_id，否则用 share_id」（line 483）
onShareAppMessage(() => {
  const cover = (share.value?.report?.episodes?.[0]?.images?.[0] as { image_url?: string } | undefined)?.image_url || "";
  if (inGroupCtx.value) {
    // 从合集卡片进来 → 分享合集
    const gname = share.value?.report?.report_title || "合集";
    logger.info("[play] onShareAppMessage as group", { gid: groupCtxId.value });
    return {
      title: `「${gname}」· 一份共同回忆`,
      path: `/pages/group/index?id=${encodeURIComponent(groupCtxId.value)}&name=${encodeURIComponent(gname)}`,
      imageUrl: cover,
    };
  }
  const title = share.value?.report?.report_title || "画匣子";
  logger.info("[play] onShareAppMessage as single share", { share_id: shareId.value });
  return {
    title,
    path: `/pages/share/play?id=${encodeURIComponent(shareId.value)}`,
    imageUrl: cover,
  };
});
</script>

<template>
  <view class="page">
    <!-- 全屏播放：mp-weixin 靠原生 nav 的返回/主页按钮；
         有历史栈 → 返回上一屏（含合集页 / 首页 / NFC 落地）
         无历史栈（分享卡片直入）→ 微信画「主页」图标 reLaunch 到首页

         2026-09-14 BUG7：**H5 上没有这个原生导航栏**（pages.json h5.titleNView=false），
         于是电脑浏览器从合集点进一份回忆后，屏幕上根本没有任何返回入口 ——
         用户实测「鼠标点不到返回主页的方法」。这里给非小程序端补一个悬浮返回按钮。 -->
    <!-- #ifndef MP-WEIXIN -->
    <view class="back-fab" @click="goBackOrHome">
      <SvgIcon name="chevron-left" size="36rpx" />
    </view>
    <!-- #endif -->

    <view v-if="loading" class="state"><text>{{ uiText("正在打开这份回忆…") }}</text></view>

    <view v-else-if="errorMsg" class="state state-err">
      <text class="state-title">{{ uiText("加载失败") }}</text>
      <text>{{ uiText(errorMsg) }}</text>
    </view>

    <view v-else-if="!currentEpisode" class="state">
      <text>{{ uiText("这份画匣子暂无内容") }}</text>
    </view>

    <view v-else class="content">

      <!-- 2026-07-25 hotfix13：归档 banner —— 有 archived 媒体时显示 -->
      <view v-if="hasArchivedMedia" class="archive-banner">
        <view class="archive-banner-body">
          <SvgIcon name="folder" size="32rpx" color="#8A7A6A" />
          <view class="archive-banner-text">
            <text class="archive-banner-title">{{ uiText("部分媒体已归档到冷存储") }}</text>
            <text v-if="restoreState && restoreState.status && restoreState.status !== 'no_request'" class="archive-banner-sub">
              {{ restoreState.eta_hint || '' }} · {{ restoreState.done_files || 0 }}/{{ restoreState.total_files || 0 }} {{ uiText("已取回") }}
            </text>
            <text v-else class="archive-banner-sub">{{ uiText("图 / 视频存 3 年后自动归档，文字永久保留") }}</text>
          </view>
        </view>
        <view
          v-if="!restoreState || restoreState.status === 'no_request' || restoreState.status === 'failed' || restoreState.status === 'done'"
          class="archive-banner-btn"
          @click="onRestoreMedia"
        >
          <text>{{ uiText("取回完整内容") }}</text>
        </view>
        <view v-else class="archive-banner-btn dim">
          <text>{{ restoreState.status === 'in_progress' ? uiText("取回中...") : uiText("排队中") }}</text>
        </view>
      </view>

      <!-- DEV：photolio2026 兑换码激活 preset_links entitlement 后显示 -->
      <view v-if="isDev && !hasArchivedMedia" class="dev-banner">
        <text class="dev-banner-tag">DEV</text>
        <view class="dev-banner-btn" @click="devArchiveThisShare">
          <text>{{ uiText("模拟 3 年归档（测试冷加载链路）") }}</text>
        </view>
      </view>

      <TemplateCard :episode="currentEpisode" />

      <view class="bottom-spacer" />
    </view>

    <!-- 合集章节导航：折叠成右侧半透明浮窗；点开展开完整菜单 -->
    <view v-if="!loading && !errorMsg && inGroupCtx" class="chapter-fab-wrap">
      <view v-if="!navExpanded" class="chapter-fab collapsed" @click="toggleNav">
        <SvgIcon name="folder" size="24rpx" color="#F7F3EE" />
        <text>{{ currentGroupChapterIndex }}/{{ groupMemories.length }}</text>
      </view>
      <view v-else class="chapter-fab expanded">
        <view
          class="fab-row"
          :class="{ disabled: !prevGroupMemory }"
          @click="gotoGroupNeighbor(prevGroupMemory)"
        >
          <SvgIcon name="chevron-left" size="24rpx" color="#F7F3EE" />
          <text>{{ uiText("上一章") }}</text>
        </view>
        <view class="fab-row" @click="gotoGroupHome">
          <SvgIcon name="folder" size="24rpx" color="#F7F3EE" />
          <text>{{ uiText("合集目录") }}</text>
        </view>
        <view
          class="fab-row"
          :class="{ disabled: !nextGroupMemory }"
          @click="gotoGroupNeighbor(nextGroupMemory)"
        >
          <text>{{ uiText("下一章") }}</text>
          <SvgIcon name="chevron-right" size="24rpx" color="#F7F3EE" />
        </view>
        <view class="fab-row close" @click="toggleNav">
          <text>{{ uiText("收起") }}</text>
        </view>
      </view>
    </view>

    <!-- 固定底部控制栏 -->
    <view v-if="!loading && !errorMsg && currentEpisode" class="ctrl-fixed">
      <view v-if="isMultiEpisode" class="ctrl-row episodes-row">
        <view
          class="ctrl-btn icon-btn"
          :class="{ disabled: currentEpisodeIdx === 0 }"
          @click="prevEpisode"
        >
          <SvgIcon name="chevron-left" size="32rpx" />
          <text>{{ uiText("上一节") }}</text>
        </view>
        <text class="ctrl-page">{{ currentEpisodeIdx + 1 }} / {{ totalEpisodes }}</text>
        <view
          class="ctrl-btn icon-btn"
          :class="{ disabled: currentEpisodeIdx >= totalEpisodes - 1 }"
          @click="nextEpisode"
        >
          <text>{{ uiText("下一节") }}</text>
          <SvgIcon name="chevron-right" size="32rpx" />
        </view>
      </view>

      <!-- 共创者常驻底部大按钮「+ 追加你的章节」
           2026-08-10：只要 canContribute（share 允许追加）且不是 owner 就显示。
           不再门 is_editor —— 链接访问者（未 acceptInvite → editors[] 空）也能看到入口。
           未登录点击会走 onAddChapter → upload tab → 那里已有登录 preflight。 -->
      <view
        v-if="!permissions?.is_owner && canContribute"
        class="contributor-cta"
        @click="onAddChapter"
      >
        <SvgIcon name="plus" size="32rpx" color="#F7F3EE" />
        <text>{{ uiText("追加你的章节") }}</text>
      </view>

      <!-- 汉堡菜单展开态：3 列网格，按语义分组
           2026-08-10 redesign：从横向 6-in-a-row 挤压 → 3×2 网格 + 短标签，
           视觉更松弛；同时把危险动作「举报」放最后并区分色。 -->
      <view v-if="hamburgerOpen" class="hamburger-panel" @click.stop>
        <view v-if="canContribute" class="ham-item" @click="onAddChapter">
          <SvgIcon name="plus" size="36rpx" color="#3D2E1F" />
          <text>{{ uiText("追加") }}</text>
        </view>
        <view v-if="canEdit" class="ham-item" @click="onEditShare">
          <SvgIcon name="gear" size="36rpx" color="#3D2E1F" />
          <text>{{ uiText("编辑") }}</text>
        </view>
        <!-- 2026-07-19：真正的「分享给微信好友」入口——走微信原生 open-type=share，
             onShareAppMessage 已在 script 顶层返回卡片。 -->
        <button class="ham-item ham-share-btn" open-type="share">
          <SvgIcon name="share" size="36rpx" color="#3D2E1F" />
          <text>{{ uiText("分享") }}</text>
        </button>
        <view
          v-if="showLikeBtn"
          class="ham-item"
          :class="{ liked }"
          @click="toggleLike"
        >
          <SvgIcon name="heart" size="36rpx" :color="liked ? '#C13939' : '#3D2E1F'" />
          <text>{{ liked ? uiText("已喜欢") : uiText("喜欢") }}</text>
        </view>
        <!-- 2026-09-16：**去掉「相册」切换项** —— 用户明确禁用相册模式和画匣子模式的
             互转（目的不一样）。相册 share 打开就走 album 页；memory share 打开就走
             share/play 页。switchToAlbumView 函数保留 —— R19 onAddChapter 里检到
             album 类型时还要靠它引导用户回相册视图追加。 -->
        <view class="ham-item" @click="goDownloadMedia">
          <SvgIcon name="download" size="36rpx" color="#3D2E1F" />
          <text>{{ uiText("下载") }}</text>
        </view>
        <!-- 举报独占一行、灰色小字，与主动作区分（合规必须保留可见入口） -->
        <view class="ham-item ham-item-report" @click="onReport">
          <text>{{ uiText("举报违规内容") }}</text>
        </view>
      </view>

      <!-- 主行：4 个按钮 —— 播放 / 评论 / 权限 / 选项(汉堡)
           2026-07-19：第 3 按钮从模糊的「分享」重命名为「权限」+ gear 图标，
           避免用户误以为是分享；真分享在汉堡菜单里 -->
      <view class="ctrl-row main-row main-row-4">
        <view
          class="ctrl-btn primary"
          :class="{ 'dim': !currentEpisodeAudioUrl }"
          @click="currentEpisodeAudioUrl ? togglePlay() : undefined"
        >
          <SvgIcon :name="isPlaying ? 'pause' : 'play'" size="32rpx" color="#F7F3EE" />
          <text>{{ currentEpisodeAudioUrl ? (isPlaying ? uiText("暂停") : uiText("播放音频")) : uiText("无音频") }}</text>
        </view>
        <view class="ctrl-btn ghost" @click="showComments = !showComments">
          <SvgIcon name="comment" size="32rpx" />
          <text>{{ showComments ? uiText("收起评论") : uiText("展开评论") }}</text>
        </view>
        <view class="ctrl-btn ghost" @click="openPermissionSheet">
          <SvgIcon name="gear" size="32rpx" />
          <text>{{ uiText("权限") }}</text>
        </view>
        <view
          v-if="showHamburger"
          class="ctrl-btn ghost"
          :class="{ active: hamburgerOpen }"
          @click="toggleHamburger"
        >
          <!-- 汉堡图标：用三个短横组合而成，避免依赖不存在的 SvgIcon name -->
          <view class="ham-icon">
            <view class="ham-bar" />
            <view class="ham-bar" />
            <view class="ham-bar" />
          </view>
          <text>{{ uiText("选项") }}</text>
        </view>
      </view>
    </view>

    <!-- 评论抽屉（浮在控制栏之上，底部由运行时测量的 ctrl-fixed 高度精确贴合）-->
    <view
      v-if="showComments && shareId"
      class="comments-drawer"
      :style="{ bottom: drawerBottomPx + 'px' }"
    >
      <view class="drawer-handle" @click="showComments = false"><text>{{ uiText("收起") }}</text></view>
      <scroll-view scroll-y class="drawer-scroll">
        <CommentSection :share-id="shareId" />
      </scroll-view>
    </view>

    <!-- 权限底部弹出栏（合并「分享」+「邀请」+「权限」） -->
    <PermissionSheet
      :open="permissionSheetOpen"
      :can-manage="canManagePermissions"
      :can-invite="canContribute"
      :scope="localScope"
      :level="localLevel"
      :nfc-access="localNfcAccess"
      :subject-title="share?.report?.report_title || ''"
      @update:open="(v) => (permissionSheetOpen = v)"
      @save="onSavePermissions"
      @invite="onInvite"
      @copy-link="onCopyShareLink"
    />
  </view>
</template>

<style lang="scss" scoped>
@use "@/styles/tokens.scss" as t;

/* 2026-09-14 BUG7：H5 悬浮返回按钮。小程序端用原生 nav，不渲染这个元素。 */
.back-fab {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 16rpx);
  left: 16rpx;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(247, 243, 238, 0.92);
  border: 2rpx solid rgba(61, 46, 31, 0.10);
  box-shadow: 0 4rpx 16rpx rgba(61, 46, 31, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}

.page {
  min-height: 100vh;
  padding: 0;
  background: t.$color-bg;
  position: relative;
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

/* 2026-09-16：加 --doc-pad-x 左右 padding 让模板卡跟 ctrl-fixed 同宽。
   契约见 [App.vue R18]：`.ctrl-fixed` 全局锁到 --doc-inner-width = 700-64rpx，
   .content 无 padding 时是 700 → 底部按钮区比模板窄 64rpx，用户视觉难受。 */
.content {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 var(--doc-pad-x);
  box-sizing: border-box;
}

// 2026-07-25 hotfix13：归档 banner + dev banner
.archive-banner {
  margin: 24rpx;
  padding: 24rpx 24rpx;
  background: rgba(232, 224, 212, 0.7);   // 暖灰半透明
  border: 2rpx solid rgba(138, 122, 106, 0.3);
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.archive-banner-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.archive-banner-text { flex: 1; display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.archive-banner-title { font-size: 26rpx; color: #3D2E1F; font-weight: 500; }
.archive-banner-sub { font-size: 22rpx; color: #8A7A6A; }
.archive-banner-btn {
  padding: 12rpx 24rpx;
  background: #3D2E1F;
  color: #F7F3EE;
  border-radius: 999rpx;
  font-size: 24rpx;
  white-space: nowrap;
}
.archive-banner-btn.dim { opacity: 0.5; }

.dev-banner {
  margin: 16rpx 24rpx;
  padding: 16rpx 20rpx;
  background: rgba(193, 57, 57, 0.08);
  border: 2rpx dashed rgba(193, 57, 57, 0.4);
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.dev-banner-tag {
  font-size: 20rpx;
  color: #C13939;
  font-weight: 700;
  padding: 4rpx 10rpx;
  border: 2rpx solid #C13939;
  border-radius: 6rpx;
}
.dev-banner-btn {
  flex: 1;
  font-size: 22rpx;
  color: #C13939;
  text-align: center;
  padding: 8rpx 0;
}

// 视频外层：black 背景 + flex 居中。video-frame 自身**不**强制高度，让 <video> 的
// inline style px 尺寸决定整块视频区高度——没有 conflicting styles，原生组件可靠
.video-frame {
  width: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;       // 给 .debug-panel 一个定位锚
}
.episode-video {
  display: block;
  // 不写 width/height — 完全由 inline style 控制
}

// 浮在视频右上角的调试面板
.debug-panel {
  position: absolute;
  top: 12rpx; right: 12rpx;
  max-width: 70%;
  background: rgba(0, 0, 0, 0.65);
  color: #F7F3EE;
  font-size: 18rpx;
  line-height: 1.4;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  z-index: 99;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  font-family: monospace;
}
.dbg-line { color: #F7F3EE; }
.dbg-line.err { color: #FF8877; }
.dbg-line.url { font-size: 16rpx; word-break: break-all; opacity: 0.8; }

// 底部 spacer：控制栏 ~280rpx + safe-area（不再叠 CustomTabBar）
.bottom-spacer {
  height: calc(320rpx + env(safe-area-inset-bottom));
}

// —— 固定底部控制栏（直接贴屏底，无 CustomTabBar） ——
.ctrl-fixed {
  position: fixed;
  left: 0; right: 0;
  bottom: 0;
  background: t.$color-bg;
  border-top: 2rpx solid t.$color-border;
  padding: t.$spacing-3 t.$spacing-4 calc(env(safe-area-inset-bottom) + #{t.$spacing-3});
  display: flex;
  flex-direction: column;
  gap: t.$spacing-2;
  z-index: 30;
  box-shadow: 0 -8rpx 24rpx rgba(61, 46, 31, 0.06);
}

// —— 章节导航浮窗（合集上下文时右侧半透明胶囊） ——
.chapter-fab-wrap {
  position: fixed;
  right: 24rpx;
  bottom: calc(360rpx + env(safe-area-inset-bottom));
  z-index: 35;
}
.chapter-fab {
  background: rgba(30, 20, 10, 0.55);
  color: #F7F3EE;
  border-radius: 999rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.24);
}
.chapter-fab.collapsed {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 22rpx;
  font-size: t.$font-xs;
}
.chapter-fab.expanded {
  border-radius: 32rpx;
  padding: 12rpx 8rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 200rpx;
}
.fab-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 14rpx 18rpx;
  border-radius: 24rpx;
  font-size: t.$font-xs;
  color: #F7F3EE;
}
.fab-row.disabled { opacity: 0.35; }
.fab-row.close {
  justify-content: center;
  color: rgba(247, 243, 238, 0.7);
  border-top: 2rpx solid rgba(247, 243, 238, 0.12);
  margin-top: 4rpx;
  padding-top: 12rpx;
}

.ctrl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: t.$spacing-2;
}
.episodes-row .icon-btn {
  flex: 0 0 auto;
  padding: 12rpx 20rpx;
}
// 合集导航行：与 episodes-row 同样布局，但中间是「回集合」按钮而非静态页码
.group-row {
  .icon-btn { flex: 0 0 auto; padding: 12rpx 20rpx; }
  .outline { flex: 1; min-width: 0; }
}
.ctrl-page {
  font-size: t.$font-sm;
  color: t.$color-text-mute;
  text-align: center;
}
.main-row { gap: t.$spacing-2; }

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;        // 关键：文字居中
  gap: 8rpx;
  padding: 16rpx 24rpx;
  border-radius: 999rpx;
  background: t.$color-bg;
  border: 2rpx solid t.$color-border;
  color: t.$color-text-soft;
  font-size: t.$font-sm;
  text-align: center;
  flex: 1;                        // 主操作行三个按钮均分宽度
  box-sizing: border-box;
}
.ctrl-btn.primary {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}
.ctrl-btn.ghost {
  background: t.$color-surface;
}
.ctrl-btn.disabled { opacity: 0.4; }
.ctrl-btn.icon-btn { flex: 0 0 auto; }      // 上一节/下一节不要均分
.ctrl-btn.outline {
  background: transparent;
  border: 2rpx solid t.$color-accent;
  color: t.$color-accent;
}
// 主行 4 按钮：均分宽度、字体缩小到 xs 避免文字挤成两行
.main-row-4 .ctrl-btn {
  flex: 1;
  padding: 14rpx 8rpx;
  font-size: t.$font-xs;
  gap: 4rpx;
}
.main-row-4 .ctrl-btn.dim {
  opacity: 0.55;
}
.main-row-4 .ctrl-btn.active {
  background: t.$color-accent;
  color: t.$color-text-invert;
  border-color: t.$color-accent;
}

// 汉堡按钮的图标（三横线）
.ham-icon {
  width: 32rpx;
  height: 24rpx;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.ham-bar {
  width: 100%;
  height: 4rpx;
  background: t.$color-text-soft;
  border-radius: 2rpx;
}
.main-row-4 .ctrl-btn.active .ham-bar {
  background: t.$color-text-invert;
}

// 2026-08-10 redesign：3 列网格代替一整行 6+ 挤压布局；
// 项目按语义分组（追加/编辑 · 分享/喜欢 · 相册/下载 · 举报独占底行）
.hamburger-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  padding: 16rpx;
  background: t.$color-surface;
  border-radius: t.$radius-lg;
  box-shadow: 0 6rpx 20rpx rgba(61, 46, 31, 0.12);
}
.ham-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 22rpx 8rpx;
  border-radius: t.$radius-md;
  background: t.$color-bg;
  border: 2rpx solid t.$color-border;
  color: t.$color-text;
  font-size: t.$font-sm;
  min-width: 0;
  min-height: 108rpx;
}
.ham-item.liked {
  border-color: #C13939;
  color: #C13939;
}
// 举报入口：独占整行 + 弱化视觉（虚线灰边 + 灰字 + 小号）—— 合规必须可见，但绝不喧宾夺主
.ham-item-report {
  grid-column: 1 / -1;
  min-height: 64rpx;
  padding: 14rpx 8rpx;
  background: transparent;
  border: 2rpx dashed rgba(61, 46, 31, 0.15);
  color: rgba(61, 46, 31, 0.55);
  font-size: t.$font-xs;
}
// 2026-07-19：汉堡里的「分享给微信好友」是 <button open-type=share>，
// 微信 button 默认 min-width + ::after 会撑出容器，全局 reset 后仍需微调
// 让它跟其它 .ham-item 视觉齐平（无边线、居中、font-size 一致）
.ham-share-btn {
  line-height: normal;
  &::after { border: none; }
}
// 2026-07-19：共创者常驻底部大按钮「+ 追加你的章节」
// 位置在汉堡菜单之外，即使菜单收起也永远可见（对齐 owner 的邀请 CTA 视觉权重）
.contributor-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: t.$spacing-2;
  padding: 22rpx;
  margin: 0 0 t.$spacing-2;
  border-radius: t.$radius-pill;
  background: t.$color-accent;
  color: t.$color-text-invert;
  font-size: t.$font-md;
  font-weight: t.$weight-bold;
  box-shadow: 0 4rpx 16rpx rgba(61, 46, 31, 0.15);
}

// —— 评论抽屉：inline style 动态指定 bottom（依 ctrl-fixed 行数） ——
.comments-drawer {
  position: fixed;
  left: 0; right: 0;
  max-height: 50vh;
  background: t.$color-surface;
  border-top-left-radius: 32rpx;
  border-top-right-radius: 32rpx;
  z-index: 35;
  box-shadow: 0 -12rpx 32rpx rgba(61, 46, 31, 0.15);
  display: flex;
  flex-direction: column;
}
.drawer-handle {
  text-align: center;
  padding: t.$spacing-2 0;
  color: t.$color-text-mute;
  font-size: t.$font-xs;
  border-bottom: 2rpx solid t.$color-border;
}
.drawer-scroll {
  flex: 1;
  min-height: 0;
}
</style>
